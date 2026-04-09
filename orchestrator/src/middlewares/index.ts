import { randomUUID } from "node:crypto";

import type { ErrorRequestHandler, RequestHandler } from "express";

import { isHttpError } from "../utils/errors.js";
import {
  createRequestContext,
  logEvent,
  logRequestCompletion,
  logRequestStart,
  runWithRequestContext,
  serialiseForLog,
} from "../utils/logger.js";
import { handleResponse } from "../utils/response.js";

const getRequestBodySummary = (body: unknown): string | undefined => {
  if (body === undefined || body === null) {
    return undefined;
  }

  if (Buffer.isBuffer(body)) {
    return `${body.length} bytes`;
  }

  if (typeof body === "object" && Object.keys(body as Record<string, unknown>).length === 0) {
    return undefined;
  }

  return serialiseForLog(body);
};

export const logRequest: RequestHandler = (request, response, next): void => {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const context = createRequestContext(requestId, request.method, request.originalUrl);

  response.locals.requestId = requestId;

  response.on("finish", () => {
    runWithRequestContext(context, () => {
      const responseMeta = response.locals.responseMeta as
        | {
            bytes?: number;
            kind?: string;
            message?: string;
          }
        | undefined;

      logRequestCompletion({
        status: response.statusCode,
        durationMs: Date.now() - startedAt,
        responseBytes: responseMeta?.bytes,
        message: responseMeta?.message,
        kind: responseMeta?.kind,
      });
    });
  });

  runWithRequestContext(context, () => {
    logRequestStart({
      contentType: request.header("content-type"),
      contentLength: request.header("content-length"),
      body: getRequestBodySummary(request.body),
    });

    next();
  });
};

export const notFound: RequestHandler = (request, response): void => {
  handleResponse(response, 404, "Route not found", {
    path: request.originalUrl,
  });
};

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  next,
): void => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (isHttpError(error)) {
    logEvent("request_failed", {
      status: error.status,
      error: error.message,
      data: error.data,
    });

    handleResponse(response, error.status, error.message, error.data);
    return;
  }

  logEvent("unhandled_error", {
    error: error instanceof Error ? error.message : "Unknown error",
  });

  handleResponse(response, 500, "Internal Server Error", null);
};
