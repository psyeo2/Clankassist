import type { RequestHandler } from "express";

import { extractToolText } from "../helpers/toolResult.js";
import { mcpClient } from "../services/mcpClient.js";
import { planToolSelection } from "../services/ollama.js";
import { HttpError } from "../utils/errors.js";
import { handleResponse } from "../utils/response.js";

type DirectToolBody = {
  tool?: unknown;
  args?: unknown;
  selection?: {
    tool?: unknown;
    args?: unknown;
  };
  speech?: unknown;
};

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

export const processRequest: RequestHandler = async (request, response): Promise<void> => {
  const body = isRecord(request.body) ? (request.body as DirectToolBody) : {};

  if (typeof body.speech === "string" && body.speech.trim() !== "") {
    const speech = body.speech.trim();
    const plan = await planToolSelection(speech);

    if (plan.tool.trim() === "" || plan.tool === "system.unsupported_request") {
      throw new HttpError(422, "No supported task identified.", {
        speech,
        response: plan.response,
      });
    }

    const result = await mcpClient.callTool(plan.tool, plan.args);

    handleResponse(response, 200, "Tool executed", {
      speech,
      selection: {
        tool: plan.tool,
        args: plan.args,
      },
      response: extractToolText(result) || plan.response,
      result,
    });
    return;
  }

  const selection = resolveSelection(body);
  if (!selection) {
    handleResponse(
      response,
      400,
      "Invalid input: provide either 'tool' plus optional 'args', or a 'selection' object.",
      null,
    );
    return;
  }

  const result = await mcpClient.callTool(selection.tool, selection.args);

  handleResponse(response, 200, "Tool executed", {
    tool: selection.tool,
    args: selection.args,
    result,
  });
};
