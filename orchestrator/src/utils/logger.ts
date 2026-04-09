import { AsyncLocalStorage } from "node:async_hooks";

type LogLevel = "NONE" | "ERROR" | "SHORT" | "INFO";

type RequestLogContext = {
  requestId: string;
  method: string;
  path: string;
  headerLine: string;
  bufferedLines: string[];
};

const requestContextStorage = new AsyncLocalStorage<RequestLogContext>();

const DETAIL_PREFIX = "            | ";
const END_PREFIX = "            └ ";
const MAX_LOG_VALUE_LENGTH = 1200;

const truncate = (value: string): string =>
  value.length > MAX_LOG_VALUE_LENGTH
    ? `${value.slice(0, MAX_LOG_VALUE_LENGTH)}...<truncated>`
    : value;

const timestamp = (): string => {
  const now = new Date();
  const date = now.toISOString().replace("T", " ");
  return date.replace("Z", " UTC");
};

const getLogLevel = (): LogLevel => {
  const rawLevel = process.env.LOG_LEVEL?.trim().toUpperCase();

  switch (rawLevel) {
    case "NONE":
      return "NONE";
    case "ERROR":
      return "ERROR";
    case "SHORT":
    case "SUMMARY":
      return "SHORT";
    case "INFO":
    default:
      return "INFO";
  }
};

const shouldBufferDetails = (): boolean => getLogLevel() === "ERROR";
const shouldLogInfo = (): boolean => getLogLevel() === "INFO";

export const serialiseForLog = (value: unknown): string => {
  if (value === undefined) {
    return "";
  }

  if (Buffer.isBuffer(value)) {
    return `<Buffer ${value.length} bytes>`;
  }

  if (typeof value === "string") {
    return truncate(value);
  }

  try {
    return truncate(JSON.stringify(value));
  } catch {
    return truncate(String(value));
  }
};

const formatValue = (value: unknown): string =>
  typeof value === "string" && value !== ""
    ? `"${serialiseForLog(value)}"`
    : serialiseForLog(value);

const buildFields = (details: Record<string, unknown>): string[] =>
  Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${formatValue(value)}`);

const emitLine = (line: string): void => {
  console.log(line);
};

const getRequestContext = (): RequestLogContext | undefined =>
  requestContextStorage.getStore();

export const runWithRequestContext = <T>(
  context: RequestLogContext,
  callback: () => T,
): T => requestContextStorage.run(context, callback);

export const createRequestContext = (
  requestId: string,
  method: string,
  path: string,
): RequestLogContext => ({
  requestId,
  method,
  path,
  headerLine: `[${timestamp()}] ${method} ${path}`,
  bufferedLines: [],
});

const writeDetailLine = (line: string): void => {
  if (shouldLogInfo()) {
    emitLine(line);
    return;
  }

  if (!shouldBufferDetails()) {
    return;
  }

  const context = getRequestContext();
  if (context) {
    context.bufferedLines.push(line);
  }
};

export const logRequestStart = (details: Record<string, unknown> = {}): void => {
  const level = getLogLevel();
  if (level === "NONE" || level === "SHORT") {
    return;
  }

  const context = getRequestContext();
  if (!context) {
    return;
  }

  if (level === "INFO") {
    emitLine(context.headerLine);
  }

  const fields = buildFields({
    requestId: context.requestId,
    ...details,
  });

  if (fields.length > 0) {
    writeDetailLine(`${DETAIL_PREFIX}${fields.join(" ")}`);
  }
};

export const logEvent = (
  message: string,
  details: Record<string, unknown> = {},
): void => {
  const level = getLogLevel();
  if (level === "NONE" || level === "SHORT") {
    return;
  }

  const fields = buildFields(details);
  const suffix = fields.length > 0 ? ` ${fields.join(" ")}` : "";
  const context = getRequestContext();

  if (!context) {
    if (level === "INFO") {
      emitLine(`[${timestamp()}] ${message}${suffix}`);
    }
    return;
  }

  writeDetailLine(`${DETAIL_PREFIX}${message}${suffix}`);
};

export const logRequestCompletion = (details: {
  status: number;
  durationMs: number;
  responseBytes?: number;
  message?: string;
  kind?: string;
}): void => {
  const level = getLogLevel();
  const context = getRequestContext();
  const method = context?.method ?? "UNKNOWN";
  const path = context?.path ?? "/";
  const status = details.status;
  const failed = status >= 400;
  const fields = buildFields({
    status,
    durationMs: `${details.durationMs}ms`,
    responseBytes: details.responseBytes,
    responseKind: details.kind,
    message: details.message,
  });

  if (level === "NONE") {
    return;
  }

  if (level === "SHORT") {
    emitLine(
      `[${timestamp()}] ${method} ${path} -> ${status} ${details.durationMs}ms${
        details.responseBytes !== undefined ? ` ${details.responseBytes}B` : ""
      }`,
    );
    return;
  }

  const endLine = `${END_PREFIX}${fields.join(" ")}`;

  if (level === "INFO") {
    emitLine(endLine);
    return;
  }

  if (level === "ERROR" && failed && context) {
    emitLine(context.headerLine);
    for (const line of context.bufferedLines) {
      emitLine(line);
    }
    emitLine(endLine);
  }
};

export const logStartup = (message: string, details: Record<string, unknown> = {}): void => {
  if (getLogLevel() === "NONE") {
    return;
  }

  const fields = buildFields(details);
  const suffix = fields.length > 0 ? ` ${fields.join(" ")}` : "";
  emitLine(`[${timestamp()}] ${message}${suffix}`);
};
