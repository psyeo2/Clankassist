import type { RequestHandler } from "express";

import {
  executeToolSelection,
  isToolSelection,
  listAvailableTools,
  ToolValidationError,
} from "../tools";
import { requestJson } from "../integrations/shared/http";
import { handleResponse } from "../utils/responseHandler";
import { logEvent } from "../utils/logger";
import type { ToolSelection } from "../tools";

const getDirectToolSelection = (body: unknown) => {
  if (!body || typeof body !== "object") {
    return null;
  }

  const requestBody = body as Record<string, unknown>;

  if (isToolSelection(requestBody.selection)) {
    return requestBody.selection;
  }

  if (typeof requestBody.tool === "string") {
    const args =
      requestBody.args &&
      typeof requestBody.args === "object" &&
      !Array.isArray(requestBody.args)
        ? (requestBody.args as Record<string, unknown>)
        : {};

    return {
      tool: requestBody.tool,
      args,
    };
  }

  return null;
};

interface PlannerResponse {
  tool: string;
  args: Record<string, unknown>;
  response: string;
}

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
  error?: string;
}

const plannerResponseSchema = {
  type: "object",
  properties: {
    tool: {
      type: "string",
      description:
        "Exact tool name to execute. Return an empty string if no available tool can fulfil the request.",
    },
    args: {
      type: "object",
      description: "Arguments for the selected tool. Use an empty object when none are required.",
    },
    response: {
      type: "string",
      description:
        "Short voice-assistant reply for the user. If no tool matches, explain that briefly.",
    },
  },
  required: ["tool", "args", "response"],
  additionalProperties: false,
} as const;

const getErrorStatus = (error: unknown): number =>
  typeof (error as { status?: unknown }).status === "number"
    ? ((error as { status: number }).status)
    : 500;

const getOllamaChatUrl = (): string => {
  const rawBaseUrl = globalThis.process.env.OLLAMA_URL?.trim();

  if (!rawBaseUrl) {
    const error = new Error("OLLAMA_URL is not configured.");
    (error as Error & { status: number }).status = 500;
    throw error;
  }

  const baseUrl = /^https?:\/\//i.test(rawBaseUrl)
    ? rawBaseUrl
    : `http://${rawBaseUrl}`;
  const trimmedBaseUrl = baseUrl.replace(/\/+$/, "");

  return trimmedBaseUrl.endsWith("/api")
    ? `${trimmedBaseUrl}/chat`
    : `${trimmedBaseUrl}/api/chat`;
};

const getOllamaModel = (): string => {
  const model = globalThis.process.env.OLLAMA_MODEL?.trim();

  if (!model) {
    const error = new Error("OLLAMA_MODEL is not configured.");
    (error as Error & { status: number }).status = 500;
    throw error;
  }

  return model;
};

const isPlannerResponse = (value: unknown): value is PlannerResponse => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.tool === "string" &&
    typeof candidate.response === "string" &&
    typeof candidate.args === "object" &&
    candidate.args !== null &&
    !Array.isArray(candidate.args)
  );
};

const createPlanningPrompt = (speech: string): string => {
  const tools = listAvailableTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));

  return [
    "You are a tool planner for a local voice assistant.",
    "Pick exactly one tool only when a request clearly matches an available tool.",
    'If no tool can fulfil the request, choose "system.unsupported_request" and return an empty object for args.',
    "Do not guess. Do not force unrelated requests into the closest tool.",
    "If the request is for another service or domain, such as Grocy or something not listed, return no tool.",
    "Do not invent arguments that are not defined by the selected tool schema.",
    "Keep the response field short and natural for speech output.",
    "Use only the exact tool names provided.",
    "Only choose from the available tools listed below.",
    `Available tools: ${JSON.stringify(tools)}`,
    `User request: ${speech}`,
  ].join("\n");
};

const planToolSelection = async (speech: string): Promise<PlannerResponse> => {
  const payload = await requestJson<OllamaChatResponse>("oLLaMa", getOllamaChatUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getOllamaModel(),
      stream: false,
      format: plannerResponseSchema,
      options: {
        temperature: 0,
      },
      messages: [
        {
          role: "user",
          content: createPlanningPrompt(speech),
        },
      ],
    }),
  }, {
    logBody: false,
  });

  const content = payload.message?.content;

  if (!content) {
    const error = new Error("oLLaMa returned an empty planning response.");
    (error as Error & { status: number }).status = 502;
    throw error;
  }

  let parsedContent: unknown;

  try {
    parsedContent = JSON.parse(content);
  } catch {
    const error = new Error("oLLaMa returned invalid JSON.");
    (error as Error & { status: number }).status = 502;
    throw error;
  }

  if (!isPlannerResponse(parsedContent)) {
    const error = new Error("oLLaMa returned an invalid planner payload.");
    (error as Error & { status: number }).status = 502;
    throw error;
  }

  return parsedContent;
};

export const process: RequestHandler = async (req, res): Promise<void> => {
  try {
    const directSelection = getDirectToolSelection(req.body);

    if (directSelection) {
      const execution = await executeToolSelection(directSelection);

      handleResponse(res, 200, "Tool executed successfully", {
        response: execution.speech,
        execution,
      });
      return;
    }

    const speech = req.body.speech;

    if (typeof speech !== "string" || speech.trim() === "") {
      handleResponse(
        res,
        400,
        "Invalid input: provide a non-empty 'speech' string or a direct tool selection."
      );
      return;
    }

    const plan = await planToolSelection(speech.trim());
    logEvent("planner_selection", {
      speech,
      tool: plan.tool,
      args: plan.args,
      response: plan.response,
    });

    if (
      plan.tool.trim() === "" ||
      plan.tool === "system.unsupported_request"
    ) {
      handleResponse(res, 422, "No supported task identified", {
        speech,
        response: plan.response,
      });
      return;
    }

    const selection: ToolSelection = {
      tool: plan.tool,
      args: plan.args,
    };

    let execution;

    try {
      execution = await executeToolSelection(selection);
    } catch (error) {
      if (error instanceof ToolValidationError) {
        handleResponse(res, 422, "No supported task identified", {
          speech,
          selection,
          response: plan.response,
          error: error.message,
        });
        return;
      }

      throw error;
    }

    handleResponse(res, 200, "Tool executed successfully", {
      speech,
      selection,
      response: execution.speech || plan.response,
      execution,
    });
  } catch (error) {
    const status = getErrorStatus(error);
    const message =
      status >= 500
        ? "Internal Server Error"
        : error instanceof Error
          ? error.message
          : "Request failed";

    handleResponse(res, status, message, {
      error: error instanceof Error ? error.message : "Unknown error",
      response:
        status >= 500
          ? "I ran into a problem while processing that request."
          : message,
    });
  }
};
