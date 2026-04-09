import type { RequestHandler } from "express";

import { mcpClient } from "../services/mcpClient.js";
import { handleResponse } from "../utils/response.js";

export const ping: RequestHandler = async (_request, response): Promise<void> => {
  const tools = await mcpClient.listTools();

  handleResponse(response, 200, "Ok", {
    uptime: process.uptime(),
    mcp: {
      ...mcpClient.getConfiguration(),
      toolCount: tools.length,
    },
  });
};
