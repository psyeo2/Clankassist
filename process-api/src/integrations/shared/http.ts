import { logEvent, serialiseForLog } from "../../utils/logger";

export class HttpServiceError extends Error {
  status: number;
  responseBody: unknown;

  constructor(message: string, status = 502, responseBody: unknown = null) {
    super(message);
    this.name = "HttpServiceError";
    this.status = status;
    this.responseBody = responseBody;
  }
}

const ensureHttpProtocol = (value: string): string =>
  /^https?:\/\//i.test(value) ? value : `http://${value}`;

export const normaliseBaseUrl = (value: string, serviceName: string): string => {
  const trimmed = value.trim();

  if (trimmed === "") {
    throw new HttpServiceError(`${serviceName} base URL is not configured.`, 500);
  }

  return ensureHttpProtocol(trimmed).replace(/\/+$/, "");
};

export const buildUrl = (
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined>
): string => {
  const url = new URL(path, `${baseUrl}/`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, `${value}`);
      }
    }
  }

  return url.toString();
};

const parseErrorBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();

  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const getErrorMessage = (
  serviceName: string,
  response: Response,
  parsedBody: unknown
): string => {
  if (
    parsedBody &&
    typeof parsedBody === "object" &&
    typeof (parsedBody as { message?: unknown }).message === "string"
  ) {
    return `${serviceName} request failed: ${(parsedBody as { message: string }).message}`;
  }

  if (typeof parsedBody === "string") {
    return `${serviceName} request failed: ${parsedBody}`;
  }

  return `${serviceName} request failed with status ${response.status}.`;
};

export const requestJson = async <T>(
  serviceName: string,
  url: string,
  init?: RequestInit,
  options?: {
    logBody?: boolean;
  }
): Promise<T> => {
  const method = init?.method ?? "GET";
  const startedAt = Date.now();
  const requestBody =
    options?.logBody === false
      ? undefined
      : typeof init?.body === "string"
      ? init.body
      : init?.body !== undefined
        ? serialiseForLog(init.body)
        : undefined;

  logEvent("outbound_api_request", {
    service: serviceName,
    method,
    url,
    body: requestBody,
  });

  let response: Response;

  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new HttpServiceError(
      `${serviceName} request failed: ${(error as Error).message}`,
      502
    );
  }

  if (!response.ok) {
    const parsedBody = await parseErrorBody(response);
    logEvent("outbound_api_response", {
      service: serviceName,
      method,
      url,
      status: response.status,
      durationMs: Date.now() - startedAt,
      body: requestBody,
      error: parsedBody,
    });

    throw new HttpServiceError(
      getErrorMessage(serviceName, response, parsedBody),
      response.status,
      parsedBody
    );
  }

  const payload = (await response.json()) as T;

  logEvent("outbound_api_response", {
    service: serviceName,
    method,
    url,
    status: response.status,
    durationMs: Date.now() - startedAt,
    body: requestBody,
  });

  return payload;
};

export const requestText = async (
  serviceName: string,
  url: string,
  init?: RequestInit,
  options?: {
    logBody?: boolean;
  }
): Promise<string> => {
  const method = init?.method ?? "GET";
  const startedAt = Date.now();
  const requestBody =
    options?.logBody === false
      ? undefined
      : typeof init?.body === "string"
      ? init.body
      : init?.body !== undefined
        ? serialiseForLog(init.body)
        : undefined;

  logEvent("outbound_api_request", {
    service: serviceName,
    method,
    url,
    body: requestBody,
  });

  let response: Response;

  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new HttpServiceError(
      `${serviceName} request failed: ${(error as Error).message}`,
      502
    );
  }

  if (!response.ok) {
    const parsedBody = await parseErrorBody(response);
    logEvent("outbound_api_response", {
      service: serviceName,
      method,
      url,
      status: response.status,
      durationMs: Date.now() - startedAt,
      body: requestBody,
      error: parsedBody,
    });

    throw new HttpServiceError(
      getErrorMessage(serviceName, response, parsedBody),
      response.status,
      parsedBody
    );
  }

  const payload = await response.text();

  logEvent("outbound_api_response", {
    service: serviceName,
    method,
    url,
    status: response.status,
    durationMs: Date.now() - startedAt,
    body: requestBody,
  });

  return payload;
};
