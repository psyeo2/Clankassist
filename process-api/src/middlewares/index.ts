import { randomUUID } from "node:crypto";

import type { ErrorRequestHandler, RequestHandler } from "express";

import { handleResponse } from "../utils/responseHandler";
import {
  logEvent,
  logRequestStart,
  logSummary,
  runWithRequestContext,
  serialiseForLog,
} from "../utils/logger";

export const logRequest: RequestHandler = (req, res, next): void => {
  const startedAt = Date.now();
  const requestId = randomUUID();

  res.locals.requestId = requestId;

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const payload = res.locals.responsePayload as
      | {
          message?: unknown;
          data?: unknown;
        }
      | undefined;
    const data =
      payload?.data && typeof payload.data === "object"
        ? (payload.data as Record<string, unknown>)
        : undefined;

    logSummary(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`, {
      message: payload?.message,
      error: data?.error,
      response: data?.response,
    });
  });

  runWithRequestContext(
    {
      requestId,
      method: req.method,
      path: req.originalUrl,
    },
    () => {
      logRequestStart("incoming_request", {
        method: req.method,
        path: req.originalUrl,
        body: req.body && Object.keys(req.body).length > 0 ? serialiseForLog(req.body) : undefined,
      });
      next();
    }
  );
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

  const message =
    status >= 500
      ? "Internal Server Error"
      : error instanceof Error
        ? error.message
        : "Request failed";

  if (status >= 500) {
    logEvent("unhandled_error", {
      status,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  handleResponse(res, status, message);
};
