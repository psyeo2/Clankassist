import type { NextFunction, Request, Response } from "express";

import { authenticateDeviceHeader } from "../helpers/deviceAuth.js";

export const authenticateBearerToken = async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    response.locals.authToken = await authenticateDeviceHeader(request.headers.authorization);
    next();
  } catch (error) {
    next(error);
  }
};
