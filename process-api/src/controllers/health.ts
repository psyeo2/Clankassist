import type { RequestHandler } from "express";

import { handleResponse } from "../utils/responseHandler";

export const ping: RequestHandler = (_req, res): void => {
  handleResponse(res, 200, "Ok", {
    uptime: process.uptime(),
  });
};
