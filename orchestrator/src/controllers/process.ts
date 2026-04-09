import type { RequestHandler } from "express";

import { mcpClient } from "../services/mcpClient.js";
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
    handleResponse(response, 501, "Planner integration not implemented yet", {
      speech: body.speech,
      nextStep: "Wire oLLaMa or another planner into the orchestrator before enabling speech mode.",
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
