import type { NextFunction, Request, Response } from "express";

import { authenticateBearerHeader } from "../helpers/bearerAuth.js";
import { HttpError } from "../utils/errors.js";

export const authenticateBearerToken = async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    response.locals.authToken = await authenticateBearerHeader(request.headers.authorization);
    next();
  } catch (error) {
    next(error);
  }
};
