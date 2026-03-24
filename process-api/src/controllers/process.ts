import type { RequestHandler } from "express";

import { handleResponse } from "../utils/responseHandler";

export const process: RequestHandler = (req, res): void => {
  try {
    const speech = req.body.speech;

    if (typeof speech !== "string" || speech.trim() === "") {
      handleResponse(res, 400, "Invalid input: 'speech' must be a non-empty string");
      return;
    }

    
  } catch (error) {
    handleResponse(res, 500, "Internal Server Error", {
      error: (error as Error).message,
    });
  }
};
