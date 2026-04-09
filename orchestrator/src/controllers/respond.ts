import type { RequestHandler } from "express";

import { extractToolText } from "../helpers/toolResult.js";
import { planToolSelection } from "../services/llm.js";
import { mcpClient } from "../services/mcpClient.js";
import { synthesiseSpeech } from "../services/piperApi.js";
import { transcribeAudio } from "../services/whisperApi.js";
import { HttpError } from "../utils/errors.js";
import { parseMultipartFile } from "../utils/multipart.js";
import {
  handleBinaryResponse,
  handleResponse,
  handleTextResponse,
} from "../utils/response.js";

type DirectToolBody = {
  tool?: unknown;
  args?: unknown;
  selection?: {
    tool?: unknown;
    args?: unknown;
  };
  speech?: unknown;
};

type RespondOutput = "json" | "text" | "audio";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const resolveSelection = (
  body: DirectToolBody,
): { tool: string; args: Record<string, unknown> } | null => {
  if (typeof body.tool === "string") {
    return {
      tool: body.tool,
      args: isRecord(body.args) ? body.args : {},
    };
  }

  if (isRecord(body.selection) && typeof body.selection.tool === "string") {
    return {
      tool: body.selection.tool,
      args: isRecord(body.selection.args) ? body.selection.args : {},
    };
  }

  return null;
};

const parseOutput = (rawOutput: unknown): RespondOutput => {
  if (rawOutput === undefined) {
    return "json";
  }

  const value = typeof rawOutput === "string" ? rawOutput.toLowerCase() : "";
  if (value === "json" || value === "text" || value === "audio") {
    return value;
  }

  throw new HttpError(400, "Invalid output type. Expected 'json', 'text', or 'audio'.");
};

const executePlannedSpeech = async (
  speech: string,
): Promise<{
  selection: {
    tool: string;
    args: Record<string, unknown>;
  };
  responseText: string;
  result: unknown;
}> => {
  const plan = await planToolSelection(speech);
  if (plan.tool.trim() === "" || plan.tool === "system.unsupported_request") {
    throw new HttpError(422, "No supported task identified.", {
      speech,
      response: plan.response,
    });
  }

  const result = await mcpClient.callTool(plan.tool, plan.args);

  return {
    selection: {
      tool: plan.tool,
      args: plan.args,
    },
    responseText: extractToolText(result) || plan.response,
    result,
  };
};

const respondWithOutput = async (
  response: Parameters<RequestHandler>[1],
  output: RespondOutput,
  payload: {
    json: Record<string, unknown>;
    text: string;
    status?: number;
    message?: string;
  },
): Promise<void> => {
  const status = payload.status ?? 200;
  const message = payload.message ?? "Ok";

  if (output === "json") {
    handleResponse(response, status, message, payload.json);
    return;
  }

  if (output === "text") {
    handleTextResponse(response, status, payload.text, {
      message,
    });
    return;
  }

  const audio = await synthesiseSpeech({
    text: payload.text,
  });

  handleBinaryResponse(response, status, audio.audioBuffer, {
    contentType: audio.contentType,
    message,
  });
};

const transcribeMultipartOrRawAudio = async (
  request: Parameters<RequestHandler>[0],
): Promise<{ transcript: string; source: "raw_audio" | "multipart_audio" }> => {
  if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
    throw new HttpError(400, "No request body was provided.");
  }

  const contentType = request.header("content-type") ?? "application/octet-stream";
  if (contentType.startsWith("multipart/form-data")) {
    const file = parseMultipartFile(request.body, contentType);
    const transcription = await transcribeAudio({
      audioBuffer: file.bytes,
      contentType: file.contentType,
      filename: file.filename,
    });

    return {
      transcript: transcription.text,
      source: "multipart_audio",
    };
  }

  const filename =
    typeof request.query.filename === "string" && request.query.filename.trim() !== ""
      ? request.query.filename
      : "audio.wav";
  const transcription = await transcribeAudio({
    audioBuffer: request.body,
    contentType,
    filename,
  });

  return {
    transcript: transcription.text,
    source: "raw_audio",
  };
};

export const respond: RequestHandler = async (request, response): Promise<void> => {
  const output = parseOutput(request.query.output);
  const contentType = request.header("content-type") ?? "";

  if (Buffer.isBuffer(request.body)) {
    if (contentType.startsWith("text/plain")) {
      const speech = request.body.toString("utf8").trim();
      if (!speech) {
        throw new HttpError(400, "Text request body must not be empty.");
      }

      const execution = await executePlannedSpeech(speech);

      await respondWithOutput(response, output, {
        status: 200,
        message: "Tool executed",
        json: {
          mode: "speech_text",
          speech,
          selection: execution.selection,
          response: execution.responseText,
          result: execution.result,
        },
        text: execution.responseText,
      });
      return;
    }

    const { transcript, source } = await transcribeMultipartOrRawAudio(request);
    const execution = await executePlannedSpeech(transcript);
    await respondWithOutput(response, output, {
      status: 200,
      message: "Tool executed",
      json: {
        mode: source,
        transcript,
        selection: execution.selection,
        response: execution.responseText,
        result: execution.result,
      },
      text: execution.responseText,
    });
    return;
  }

  const body = isRecord(request.body) ? (request.body as DirectToolBody) : {};
  const selection = resolveSelection(body);
  if (selection) {
    const result = await mcpClient.callTool(selection.tool, selection.args);
    const text = extractToolText(result);

    await respondWithOutput(response, output, {
      json: {
        mode: "direct_tool",
        tool: selection.tool,
        args: selection.args,
        result,
      },
      text,
      message: "Tool executed",
    });
    return;
  }

  if (typeof body.speech === "string" && body.speech.trim() !== "") {
    const speech = body.speech.trim();
    const execution = await executePlannedSpeech(speech);
    await respondWithOutput(response, output, {
      status: 200,
      message: "Tool executed",
      json: {
        mode: "speech_json",
        speech,
        selection: execution.selection,
        response: execution.responseText,
        result: execution.result,
      },
      text: execution.responseText,
    });
    return;
  }

  throw new HttpError(
    400,
    "Invalid input. Send JSON with 'speech' or direct tool selection, text/plain, raw audio, or multipart audio.",
  );
};
