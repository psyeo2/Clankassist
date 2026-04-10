import type { NextFunction, Request, Response } from "express";

import { getAppAuthState } from "../db/appAuthState.js";
import { HttpError } from "../utils/errors.js";

export const requireAppSetup = async (
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> => {
  if (request.method === "OPTIONS") {
    next();
    return;
  }

  try {
    const state = await getAppAuthState();
    if (!state.setup_completed_at) {
      throw new HttpError(503, "Initial setup is required.", {
        setup_required: true,
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};
