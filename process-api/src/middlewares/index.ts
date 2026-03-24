import type { ErrorRequestHandler, RequestHandler } from "express";

import { handleResponse } from "../utils/responseHandler";

export const logRequest: RequestHandler = (req, res, next): void => {
  const startedAt = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`
    );
  });

  next();
};

export const notFound: RequestHandler = (req, res): void => {
  handleResponse(res, 404, "Route not found", {
    path: req.originalUrl,
  });
};

export const errorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  next
): void => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const status =
    typeof (error as { status?: unknown }).status === "number"
      ? ((error as { status: number }).status)
      : 500;

  if (status >= 500) {
    console.error(error);
  }

  const message =
    status >= 500
      ? "Internal Server Error"
      : error instanceof Error
        ? error.message
        : "Request failed";

  handleResponse(res, status, message);
};
