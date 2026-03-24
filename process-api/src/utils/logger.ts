import { AsyncLocalStorage } from "node:async_hooks";

interface RequestContext {
  requestId: string;
  method?: string;
  path?: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

const MAX_LOG_VALUE_LENGTH = 1200;
const TRACE_PREFIX = "            | ";

type LogLevel = "info" | "summary" | "none";

const truncate = (value: string): string =>
  value.length > MAX_LOG_VALUE_LENGTH
    ? `${value.slice(0, MAX_LOG_VALUE_LENGTH)}...<truncated>`
    : value;

const getLogLevel = (): LogLevel => {
  const rawLevel = globalThis.process.env.LOG_LEVEL?.trim().toUpperCase();

  switch (rawLevel) {
    case "NONE":
      return "none";
    case "SUMMARY":
      return "summary";
    case "INFO":
    default:
      return "info";
  }
};

const shouldLogInfo = (): boolean => getLogLevel() === "info";
const shouldLogSummary = (): boolean => {
  const logLevel = getLogLevel();
  return logLevel === "info" || logLevel === "summary";
};

export const serialiseForLog = (value: unknown): string => {
  if (value === undefined) {
    return "";
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

export const runWithRequestContext = (
  context: RequestContext,
  callback: () => void
): void => {
  requestContextStorage.run(context, callback);
};

export const getRequestContext = (): RequestContext | undefined =>
  requestContextStorage.getStore();

const buildFields = (
  details: Record<string, unknown>,
  includeRequestId: boolean
): string[] => {
  const context = getRequestContext();
  const fields: string[] = [];

  if (includeRequestId && context?.requestId) {
    fields.push(`requestId=${context.requestId}`);
  }

  for (const [key, value] of Object.entries(details)) {
    if (value === undefined || value === "") {
      continue;
    }

    fields.push(`${key}=${formatValue(value)}`);
  }

  return fields;
};

export const logRequestStart = (
  message: string,
  details: Record<string, unknown> = {}
): void => {
  if (!shouldLogInfo()) {
    return;
  }

  const fields = buildFields(details, true);
  const suffix = fields.length > 0 ? ` ${fields.join(" ")}` : "";

  console.log(`[${new Date().toISOString()}] ${message}${suffix}`);
};

export const logEvent = (
  message: string,
  details: Record<string, unknown> = {}
): void => {
  if (!shouldLogInfo()) {
    return;
  }

  const fields = buildFields(details, true);
  const suffix = fields.length > 0 ? ` ${fields.join(" ")}` : "";

  console.log(`${TRACE_PREFIX}${message}${suffix}`);
};

export const logSummary = (
  message: string,
  details: Record<string, unknown> = {}
): void => {
  if (!shouldLogSummary()) {
    return;
  }

  const fields = buildFields(details, true);
  const suffix = fields.length > 0 ? ` ${fields.join(" ")}` : "";

  console.log(`[${new Date().toISOString()}] ${message}${suffix}`);
};
