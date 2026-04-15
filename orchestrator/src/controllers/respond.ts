import type { RequestHandler } from "express";

import { synthesiseSpeech } from "../services/piperApi.js";
import {
  type BufferedAudioInput,
  executeBufferedAudioSpeech,
  executeDirectToolSelection,
  executePlannedSpeech,
} from "../services/respondPipeline.js";
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

const parseMultipartOrRawAudio = async (
  request: Parameters<RequestHandler>[0],
): Promise<{ input: BufferedAudioInput; source: "raw_audio" | "multipart_audio" }> => {
  if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
    throw new HttpError(400, "No request body was provided.");
  }

  const contentType = request.header("content-type") ?? "application/octet-stream";
  if (contentType.startsWith("multipart/form-data")) {
    const file = parseMultipartFile(request.body, contentType);
    return {
      input: {
        audioBuffer: file.bytes,
        contentType: file.contentType,
        filename: file.filename,
      },
      source: "multipart_audio",
    };
  }

  const filename =
    typeof request.query.filename === "string" && request.query.filename.trim() !== ""
      ? request.query.filename
      : "audio.wav";
  return {
    input: {
      audioBuffer: request.body,
      contentType,
      filename,
    },
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

      if (execution.unsupported) {
        await respondWithOutput(response, output, {
          status: 422,
          message: "No supported task identified.",
          json: {
            mode: "speech_text",
            speech,
            selection: execution.selection,
            response: execution.responseText,
          },
          text: execution.responseText,
        });
        return;
      }

      await respondWithOutput(response, output, {
        status: 200,
        message: `Tool executed: ${execution.selection.tool}`,
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

    const { input, source } = await parseMultipartOrRawAudio(request);
    const { transcript, execution } = await executeBufferedAudioSpeech(input);

    if (execution.unsupported) {
      await respondWithOutput(response, output, {
        status: 422,
        message: "No supported task identified.",
        json: {
          mode: source,
          transcript,
          selection: execution.selection,
          response: execution.responseText,
        },
        text: execution.responseText,
      });
      return;
    }

    await respondWithOutput(response, output, {
      status: 200,
      message: `Tool executed: ${execution.selection.tool}`,
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
    const execution = await executeDirectToolSelection(selection);

    await respondWithOutput(response, output, {
      json: {
        mode: "direct_tool",
        tool: execution.selection.tool,
        args: execution.selection.args,
        result: execution.result,
      },
      text: execution.responseText,
      message: `Tool executed: ${execution.selection.tool}`,
    });
    return;
  }

  if (typeof body.speech === "string" && body.speech.trim() !== "") {
    const speech = body.speech.trim();
    const execution = await executePlannedSpeech(speech);

    if (execution.unsupported) {
      await respondWithOutput(response, output, {
        status: 422,
        message: "No supported task identified.",
        json: {
          mode: "speech_json",
          speech,
          selection: execution.selection,
          response: execution.responseText,
        },
        text: execution.responseText,
      });
      return;
    }

    await respondWithOutput(response, output, {
      status: 200,
      message: `Tool executed: ${execution.selection.tool}`,
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
