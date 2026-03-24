import type { RequestHandler } from "express";

import {
  executeToolSelection,
  isToolSelection,
  listExecutableTools,
  listTools,
  plannerOutputSchema,
} from "../tools";
import { handleResponse } from "../utils/responseHandler";

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

const getErrorStatus = (error: unknown): number =>
  typeof (error as { status?: unknown }).status === "number"
    ? ((error as { status: number }).status)
    : 500;

export const process: RequestHandler = async (req, res): Promise<void> => {
  try {
    const directSelection = getDirectToolSelection(req.body);

    if (directSelection) {
      const execution = await executeToolSelection(directSelection);

      handleResponse(res, 200, "Tool executed successfully", {
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

    handleResponse(res, 501, "Speech processing pipeline not implemented yet", {
      speech,
      availableTools: listTools(),
      executableTools: listExecutableTools(),
      plannerOutputSchema,
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
    });
  }
};
