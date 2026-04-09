import { URL } from "node:url";

import { CatalogToolDefinition } from "./catalog.js";

type ExecutionContext = {
  args: Record<string, unknown>;
  integration: Pick<
    CatalogToolDefinition,
    | "integrationKey"
    | "transport"
    | "baseUrlEnvVar"
    | "authStrategy"
    | "authConfig"
    | "defaultHeaders"
    | "allowedHosts"
    | "timeoutMs"
    | "integrationMetadata"
  >;
  tool: Pick<
    CatalogToolDefinition,
    | "name"
    | "description"
    | "executionSummary"
    | "executionMode"
    | "executionSpec"
    | "toolMetadata"
  >;
};

type JsonObject = Record<string, unknown>;

type HttpExecutionResult = {
  structuredContent: Record<string, unknown>;
  contentText: string;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const isPrimitive = (value: unknown): value is string | number | boolean | null =>
  value === null ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

const readEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Required environment variable "${name}" is not set.`);
  }

  return value;
};

const getPathValue = (source: unknown, path: string): unknown => {
  if (path === "") {
    return source;
  }

  return path.split(".").reduce<unknown>((current, segment) => {
    if (Array.isArray(current)) {
      const index = Number.parseInt(segment, 10);
      return Number.isNaN(index) ? undefined : current[index];
    }

    if (typeof current === "object" && current !== null) {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, source);
};

const interpolateString = (template: string, context: Record<string, unknown>): string =>
  template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, expression: string) => {
    const value = getPathValue(context, expression.trim());

    if (value === undefined || value === null) {
      return "";
    }

    return typeof value === "string" ? value : JSON.stringify(value);
  });

const resolveValue = (value: unknown, context: Record<string, unknown>): unknown => {
  if (typeof value === "string") {
    return interpolateString(value, context);
  }

  if (isPrimitive(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, context));
  }

  const record = asRecord(value);

  if (typeof record.$env === "string") {
    return readEnv(record.$env);
  }

  if (typeof record.$ref === "string") {
    return getPathValue(context, record.$ref);
  }

  if (typeof record.$template === "string") {
    return interpolateString(record.$template, context);
  }

  const resolved: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(record)) {
    resolved[key] = resolveValue(nestedValue, context);
  }

  return resolved;
};

const toQueryEntries = (
  queryDefinition: Record<string, unknown>,
  context: Record<string, unknown>,
): Array<[string, string]> => {
  const entries: Array<[string, string]> = [];

  for (const [key, rawValue] of Object.entries(queryDefinition)) {
    const value = resolveValue(rawValue, context);
    if (value === undefined || value === null || value === "") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) {
          entries.push([key, String(item)]);
        }
      }
      continue;
    }

    entries.push([key, String(value)]);
  }

  return entries;
};

const parsePrometheusMetricValue = (
  metricName: string,
  payload: string,
  labelMatchers: Record<string, string> = {},
): number | null => {
  const lines = payload.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([^{\s]+)(?:\{([^}]*)\})?\s+([^\s]+)$/);
    if (!match) {
      continue;
    }

    const [, name, labelsText, valueText] = match;
    if (name !== metricName) {
      continue;
    }

    const labels: Record<string, string> = {};
    if (labelsText) {
      for (const part of labelsText.split(",")) {
        const labelMatch = part.match(/^\s*([^=]+)="(.*)"\s*$/);
        if (labelMatch) {
          labels[labelMatch[1]] = labelMatch[2];
        }
      }
    }

    const labelsMatch = Object.entries(labelMatchers).every(
      ([key, expected]) => labels[key] === expected,
    );
    if (!labelsMatch) {
      continue;
    }

    const numericValue = Number.parseFloat(valueText);
    if (!Number.isNaN(numericValue)) {
      return numericValue;
    }
  }

  return null;
};

const resolveAuthHeaders = (
  tool: CatalogToolDefinition,
  url: URL,
  headers: Headers,
): void => {
  const authConfig = asRecord(tool.authConfig);

  switch (tool.authStrategy) {
    case "none":
      return;
    case "bearer_env": {
      const tokenEnvVar =
        typeof authConfig.token_env_var === "string"
          ? authConfig.token_env_var
          : typeof authConfig.env_var === "string"
            ? authConfig.env_var
            : null;

      if (!tokenEnvVar) {
        throw new Error(`Integration "${tool.integrationKey}" is missing token env var config.`);
      }

      headers.set("Authorization", `Bearer ${readEnv(tokenEnvVar)}`);
      return;
    }
    case "api_key_header_env": {
      const envVar =
        typeof authConfig.env_var === "string" ? authConfig.env_var : null;
      const headerName =
        typeof authConfig.header_name === "string" ? authConfig.header_name : "X-API-Key";

      if (!envVar) {
        throw new Error(`Integration "${tool.integrationKey}" is missing API key env var config.`);
      }

      headers.set(headerName, readEnv(envVar));
      return;
    }
    case "api_key_query_env": {
      const envVar =
        typeof authConfig.env_var === "string" ? authConfig.env_var : null;
      const paramName =
        typeof authConfig.param_name === "string" ? authConfig.param_name : "api_key";

      if (!envVar) {
        throw new Error(`Integration "${tool.integrationKey}" is missing API key env var config.`);
      }

      url.searchParams.set(paramName, readEnv(envVar));
      return;
    }
    case "basic_env": {
      const usernameEnvVar =
        typeof authConfig.username_env_var === "string" ? authConfig.username_env_var : null;
      const passwordEnvVar =
        typeof authConfig.password_env_var === "string" ? authConfig.password_env_var : null;

      if (!usernameEnvVar || !passwordEnvVar) {
        throw new Error(`Integration "${tool.integrationKey}" is missing basic auth config.`);
      }

      const credentials = Buffer.from(
        `${readEnv(usernameEnvVar)}:${readEnv(passwordEnvVar)}`,
      ).toString("base64");
      headers.set("Authorization", `Basic ${credentials}`);
      return;
    }
    default:
      throw new Error(`Unsupported auth strategy "${tool.authStrategy}".`);
  }
};

const ensureAllowedHost = (tool: CatalogToolDefinition, url: URL): void => {
  const allowedHosts = asStringArray(tool.allowedHosts);
  if (allowedHosts.length === 0) {
    return;
  }

  if (!allowedHosts.includes(url.host)) {
    throw new Error(
      `Host "${url.host}" is not allowed for integration "${tool.integrationKey}".`,
    );
  }
};

const buildRequest = (
  tool: CatalogToolDefinition,
  args: Record<string, unknown>,
): {
  url: URL;
  init: RequestInit;
  requestContext: Record<string, unknown>;
} => {
  if (tool.executionMode !== "http" || tool.transport !== "http") {
    throw new Error(`Tool "${tool.name}" is not configured for HTTP execution.`);
  }

  const executionSpec = asRecord(tool.executionSpec);
  const requestSpec = asRecord(executionSpec.request);
  const baseUrl = readEnv(tool.baseUrlEnvVar);
  const method =
    typeof requestSpec.method === "string" ? requestSpec.method.toUpperCase() : "GET";
  const context: Record<string, unknown> = {
    args,
    env: process.env,
    integration: {
      key: tool.integrationKey,
      metadata: tool.integrationMetadata,
    },
    tool: {
      name: tool.name,
      metadata: tool.toolMetadata,
    },
  };

  const rawPath =
    typeof requestSpec.path === "string"
      ? requestSpec.path
      : typeof requestSpec.path_template === "string"
        ? requestSpec.path_template
        : "/";
  const resolvedPath = interpolateString(rawPath, context);
  const url = new URL(
    resolvedPath.startsWith("/") ? resolvedPath : `/${resolvedPath}`,
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
  );

  for (const [key, value] of toQueryEntries(asRecord(requestSpec.query), context)) {
    url.searchParams.append(key, value);
  }

  const headers = new Headers();
  const mergedHeaders = {
    ...tool.defaultHeaders,
    ...asRecord(requestSpec.headers),
  };

  for (const [key, rawValue] of Object.entries(mergedHeaders)) {
    const resolvedValue = resolveValue(rawValue, context);
    if (resolvedValue !== undefined && resolvedValue !== null && resolvedValue !== "") {
      headers.set(key, String(resolvedValue));
    }
  }

  resolveAuthHeaders(tool, url, headers);
  ensureAllowedHost(tool, url);

  let body: BodyInit | undefined;
  const resolvedBody = resolveValue(requestSpec.body, context);
  if (resolvedBody !== undefined) {
    const bodyMode =
      typeof requestSpec.body_mode === "string" ? requestSpec.body_mode : "json";

    if (bodyMode === "json") {
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      body = JSON.stringify(resolvedBody);
    } else if (bodyMode === "text") {
      body = typeof resolvedBody === "string" ? resolvedBody : JSON.stringify(resolvedBody);
    } else {
      throw new Error(`Unsupported body_mode "${bodyMode}" for tool "${tool.name}".`);
    }
  }

  const timeoutMs =
    typeof requestSpec.timeout_ms === "number" ? requestSpec.timeout_ms : tool.timeoutMs;
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  const init: RequestInit = {
    method,
    headers,
    body,
    signal: abortController.signal,
  };

  context.request = {
    method,
    url: url.toString(),
  };

  return {
    url,
    init: {
      ...init,
      signal: init.signal,
    },
    requestContext: {
      ...context,
      __timeout: timeout,
    },
  };
};

const readResponseBody = async (
  response: Response,
  executionSpec: Record<string, unknown>,
): Promise<{ rawText: string; parsedJson?: unknown }> => {
  const responseSpec = asRecord(executionSpec.response);
  const mode =
    typeof responseSpec.format === "string"
      ? responseSpec.format
      : typeof responseSpec.extractor === "string"
        ? responseSpec.extractor
        : "json_path";

  const rawText = await response.text();

  if (mode === "text" || mode === "prometheus_metric") {
    return { rawText };
  }

  try {
    return {
      rawText,
      parsedJson: rawText === "" ? null : JSON.parse(rawText),
    };
  } catch (error) {
    throw new Error(
      `Expected JSON response but could not parse body: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
};

const resolveStructuredContent = (
  responseSpec: Record<string, unknown>,
  context: Record<string, unknown>,
  fallbackExtracted: unknown,
): Record<string, unknown> => {
  const structuredTemplate = responseSpec.structured_content;
  const resolved =
    structuredTemplate !== undefined
      ? resolveValue(structuredTemplate, context)
      : { result: fallbackExtracted };

  return asRecord(resolved);
};

const resolveContentText = (
  responseSpec: Record<string, unknown>,
  context: Record<string, unknown>,
  fallbackExtracted: unknown,
): string => {
  if (typeof responseSpec.content_text === "string") {
    return interpolateString(responseSpec.content_text, context);
  }

  if (typeof fallbackExtracted === "string") {
    return fallbackExtracted;
  }

  return JSON.stringify(fallbackExtracted, null, 2);
};

const extractResponseValue = (
  tool: CatalogToolDefinition,
  responseSpec: Record<string, unknown>,
  responseBody: { rawText: string; parsedJson?: unknown },
  context: Record<string, unknown>,
): unknown => {
  const extractor =
    typeof responseSpec.extractor === "string"
      ? responseSpec.extractor
      : typeof responseSpec.format === "string"
        ? responseSpec.format
        : "json_path";

  if (extractor === "text") {
    return responseBody.rawText;
  }

  if (extractor === "json_path") {
    const path =
      typeof responseSpec.path === "string"
        ? responseSpec.path
        : typeof responseSpec.extract_path === "string"
          ? responseSpec.extract_path
          : "";

    if (path === "") {
      return responseBody.parsedJson;
    }

    return getPathValue(responseBody.parsedJson, path);
  }

  if (extractor === "prometheus_metric") {
    const metricNameValue =
      responseSpec.metric_name ??
      (typeof responseSpec.metric_name_template === "string"
        ? responseSpec.metric_name_template
        : null) ??
      (typeof responseSpec.metric_name_env_var === "string"
        ? { $env: responseSpec.metric_name_env_var }
        : null);

    const metricName = resolveValue(metricNameValue, context);
    if (typeof metricName !== "string" || metricName.trim() === "") {
      throw new Error(`Tool "${tool.name}" is missing a valid prometheus metric name.`);
    }

    const labels = asRecord(resolveValue(responseSpec.labels, context));
    const labelMatchers = Object.fromEntries(
      Object.entries(labels)
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([key, value]) => [key, String(value)]),
    );

    const extracted = parsePrometheusMetricValue(metricName, responseBody.rawText, labelMatchers);
    if (extracted === null) {
      throw new Error(
        `Metric "${metricName}" could not be found in the Prometheus payload for tool "${tool.name}".`,
      );
    }

    return extracted;
  }

  throw new Error(`Unsupported extractor "${extractor}" for tool "${tool.name}".`);
};

export const executeTool = async (
  tool: CatalogToolDefinition,
  args: Record<string, unknown>,
): Promise<HttpExecutionResult> => {
  const executionSpec = asRecord(tool.executionSpec);
  const successStatuses = Array.isArray(executionSpec.success_statuses)
    ? executionSpec.success_statuses.filter(
        (value): value is number => typeof value === "number",
      )
    : [];

  const { url, init, requestContext } = buildRequest(tool, args);
  const timeout = requestContext.__timeout as ReturnType<typeof setTimeout> | undefined;

  try {
    const response = await fetch(url, init);
    const ok =
      successStatuses.length > 0 ? successStatuses.includes(response.status) : response.ok;

    const responseBody = await readResponseBody(response, executionSpec);
    if (!ok) {
      throw new Error(
        `Upstream request failed with status ${response.status}: ${responseBody.rawText}`,
      );
    }

    const responseSpec = asRecord(executionSpec.response);
    const context = {
      ...requestContext,
      response: {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        text: responseBody.rawText,
        json: responseBody.parsedJson,
      },
    };
    const extracted = extractResponseValue(tool, responseSpec, responseBody, context);
    const outputContext = {
      ...context,
      extract: {
        value: extracted,
      },
    };

    return {
      structuredContent: resolveStructuredContent(responseSpec, outputContext, extracted),
      contentText: resolveContentText(responseSpec, outputContext, extracted),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Tool "${tool.name}" timed out after ${tool.timeoutMs}ms.`);
    }

    throw error;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};
