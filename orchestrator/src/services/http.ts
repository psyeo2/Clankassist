import { HttpError } from "../utils/errors.js";
import { logEvent, serialiseForLog } from "../utils/logger.js";

const normaliseBaseUrl = (rawUrl: string, serviceName: string): string => {
  const trimmed = rawUrl.trim();
  if (trimmed === "") {
    throw new Error(`${serviceName} URL must not be empty.`);
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};

export const getRequiredBaseUrl = (
  rawUrl: string | undefined,
  serviceName: string,
): string => {
  if (typeof rawUrl !== "string") {
    throw new Error(`${serviceName} URL is not configured.`);
  }

  return normaliseBaseUrl(rawUrl, serviceName);
};

export const joinUrl = (baseUrl: string, path: string): string => {
  if (path === "") {
    return baseUrl;
  }

  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
};

export const readResponsePreview = async (response: Response): Promise<string | null> => {
  const contentType = response.headers.get("content-type") ?? "";
  if (
    contentType.startsWith("audio/") ||
    contentType.startsWith("application/octet-stream")
  ) {
    return null;
  }

  try {
    return serialiseForLog(await response.clone().text());
  } catch {
    return null;
  }
};

export const fetchUpstream = async (
  service: string,
  url: string,
  init: RequestInit,
  details: Record<string, unknown> = {},
): Promise<Response> => {
  const method = init.method ?? "GET";
  const startedAt = Date.now();

  logEvent("subrequest", {
    service,
    method,
    url,
    ...details,
  });

  try {
    const response = await fetch(url, init);

    logEvent("subresponse", {
      service,
      method,
      url,
      status: response.status,
      durationMs: `${Date.now() - startedAt}ms`,
      contentType: response.headers.get("content-type"),
      contentLength: response.headers.get("content-length"),
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    logEvent("subrequest_failed", {
      service,
      method,
      url,
      durationMs: `${Date.now() - startedAt}ms`,
      error: message,
    });

    throw new HttpError(502, `${service} could not be reached.`, {
      service,
      url,
      error: message,
    });
  }
};
