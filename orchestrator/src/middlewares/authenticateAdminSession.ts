import type { NextFunction, Request, Response } from "express";

import { authenticateAdminSessionHeader } from "../helpers/adminSessionAuth.js";

export const authenticateAdminSession = async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    response.locals.adminSession = await authenticateAdminSessionHeader(
      request.headers.authorization,
      "access",
    );
    next();
  } catch (error) {
    next(error);
  }
};
