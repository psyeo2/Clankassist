import type { Response } from "express";

export const handleResponse = <T = unknown>(
  res: Response,
  status: number,
  message: string,
  data: T | null = null,
): void => {
  const payload: Record<string, unknown> = { status, message, data };
  res.locals.responsePayload = payload;
  res.status(status).json(payload);
};
