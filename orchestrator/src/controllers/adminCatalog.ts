import type { RequestHandler } from "express";

import {
  createResourceRecord,
  createResourceVersionRecord,
  createToolRecord,
  createToolVersionRecord,
  listResourceRecords,
  listResourceVersionRecords,
  listToolRecords,
  listToolVersionRecords,
  publishResourceVersionRecord,
  publishToolVersionRecord,
} from "../db/adminCatalog.js";
import { mcpClient } from "../services/mcpClient.js";
import { HttpError } from "../utils/errors.js";
import { handleResponse } from "../utils/response.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getString = (
  value: unknown,
  fieldName: string,
  options: { required?: boolean; allowEmpty?: boolean } = {},
): string | undefined => {
  if (value === undefined || value === null) {
    if (options.required) {
      throw new HttpError(400, `Missing required field '${fieldName}'.`);
    }

    return undefined;
  }

  if (typeof value !== "string") {
    throw new HttpError(400, `Field '${fieldName}' must be a string.`);
  }

  const trimmed = value.trim();
  if (!options.allowEmpty && trimmed === "") {
    if (options.required) {
      throw new HttpError(400, `Missing required field '${fieldName}'.`);
    }

    return undefined;
  }

  return trimmed;
};

const getBoolean = (value: unknown, fieldName: string): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new HttpError(400, `Field '${fieldName}' must be a boolean.`);
  }

  return value;
};

const getIntegerParam = (value: string | string[] | undefined, fieldName: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `Missing route parameter '${fieldName}'.`);
  }

  if (!/^\d+$/.test(value.trim())) {
    throw new HttpError(400, `Route parameter '${fieldName}' must be a numeric id.`);
  }

  return value.trim();
};

const getJsonObject = (value: unknown, fieldName: string): Record<string, unknown> | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new HttpError(400, `Field '${fieldName}' must be an object.`);
  }

  return value;
};

const getStringArray = (value: unknown, fieldName: string): string[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new HttpError(400, `Field '${fieldName}' must be an array of strings.`);
  }

  return value.map((item) => item.trim()).filter((item) => item !== "");
};

const getPositiveInteger = (value: unknown, fieldName: string): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new HttpError(400, `Field '${fieldName}' must be a positive integer.`);
  }

  return value;
};

const getPublishSelector = (
  body: Record<string, unknown>,
): { versionId?: string; versionNumber?: number } => {
  const versionId = getString(body.version_id, "version_id");
  const versionNumber = getPositiveInteger(body.version_number, "version_number");

  if (!versionId && versionNumber === undefined) {
    throw new HttpError(400, "Provide either 'version_id' or 'version_number'.");
  }

  return {
    versionId,
    versionNumber,
  };
};

export const listTools: RequestHandler = async (_request, response): Promise<void> => {
  const [mcpTools, dbTools] = await Promise.all([mcpClient.listTools(), listToolRecords()]);
  const now = new Date().toISOString();
  const mcpByName = new Map(mcpTools.map((tool) => [tool.name, tool]));

  const merged = dbTools.map((tool) => {
    const inMcp = mcpByName.has(tool.name);

    return {
      ...tool,
      in_mcp: inMcp,
      immutable: false,
      source: "db",
    };
  });

  const mcpOnly = mcpTools
    .filter((tool) => !dbTools.some((dbTool) => dbTool.name === tool.name))
    .map((tool) => ({
      id: `mcp-${tool.name}`,
      name: tool.name,
      current_published_version_id: null,
      published_version_number: null,
      enabled: true,
      planner_visible: !tool.name.startsWith("system."),
      created_at: now,
      updated_at: now,
      in_mcp: true,
      immutable: tool.name.startsWith("system."),
      source: "mcp",
    }));

  const tools = [...mcpOnly, ...merged];

  handleResponse(response, 200, "Ok", { tools });
};

export const listToolVersions: RequestHandler = async (request, response): Promise<void> => {
  const toolId = request.params.toolId as string | undefined;

  if (toolId?.startsWith("mcp-")) {
    handleResponse(response, 200, "Ok", { versions: [] });
    return;
  }

  const versions = await listToolVersionRecords(getIntegerParam(toolId, "toolId"));
  handleResponse(response, 200, "Ok", { versions });
};

export const listResources: RequestHandler = async (_request, response): Promise<void> => {
  const resources = await listResourceRecords();
  handleResponse(response, 200, "Ok", { resources });
};

export const listResourceVersions: RequestHandler = async (
  request,
  response,
): Promise<void> => {
  const versions = await listResourceVersionRecords(
    getIntegerParam(request.params.resourceId, "resourceId"),
  );
  handleResponse(response, 200, "Ok", { versions });
};

export const createTool: RequestHandler = async (request, response): Promise<void> => {
  const body = isRecord(request.body) ? request.body : {};
  const tool = await createToolRecord({
    name: getString(body.name, "name", { required: true }) as string,
    enabled: getBoolean(body.enabled, "enabled"),
    plannerVisible: getBoolean(body.planner_visible, "planner_visible"),
  });

  handleResponse(response, 201, "Tool created", tool);
};

export const createToolVersion: RequestHandler = async (
  request,
  response,
): Promise<void> => {
  const body = isRecord(request.body) ? request.body : {};
  const status = getString(body.status, "status");

  if (
    status !== undefined &&
    status !== "draft" &&
    status !== "validated" &&
    status !== "archived"
  ) {
    throw new HttpError(400, "Field 'status' must be 'draft', 'validated', or 'archived'.");
  }

  const version = await createToolVersionRecord(getIntegerParam(request.params.toolId, "toolId"), {
    description: getString(body.description, "description", { required: true }) as string,
    inputSchema: getJsonObject(body.input_schema, "input_schema"),
    resultSchema: getJsonObject(body.result_schema, "result_schema"),
    executionSummary: getString(body.execution_summary, "execution_summary", {
      allowEmpty: true,
    }) ?? null,
    executionMode: "http",
    executionSpec: getJsonObject(body.execution_spec, "execution_spec"),
    metadata: getJsonObject(body.metadata, "metadata"),
    status: status as "draft" | "validated" | "archived" | undefined,
  });

  handleResponse(response, 201, "Tool version created", version);
};

export const publishToolVersion: RequestHandler = async (
  request,
  response,
): Promise<void> => {
  const body = isRecord(request.body) ? request.body : {};
  const adminSession = response.locals.adminSession as { id: string } | undefined;
  const published = await publishToolVersionRecord(
    getIntegerParam(request.params.toolId, "toolId"),
    getPublishSelector(body),
    adminSession?.id ?? "admin_session",
    getString(body.note, "note", { allowEmpty: true }),
  );

  handleResponse(response, 200, "Tool version published", published);
};

export const createResource: RequestHandler = async (request, response): Promise<void> => {
  const body = isRecord(request.body) ? request.body : {};
  const resource = await createResourceRecord({
    uri: getString(body.uri, "uri", { required: true }) as string,
    name: getString(body.name, "name", { required: true }) as string,
    mimeType: getString(body.mime_type, "mime_type", { allowEmpty: true }) ?? null,
    description: getString(body.description, "description", { allowEmpty: true }),
    enabled: getBoolean(body.enabled, "enabled"),
  });

  handleResponse(response, 201, "Resource created", resource);
};

export const createResourceVersion: RequestHandler = async (
  request,
  response,
): Promise<void> => {
  const body = isRecord(request.body) ? request.body : {};
  const status = getString(body.status, "status");
  const loadMode = getString(body.load_mode, "load_mode");

  if (
    status !== undefined &&
    status !== "draft" &&
    status !== "validated" &&
    status !== "archived"
  ) {
    throw new HttpError(400, "Field 'status' must be 'draft', 'validated', or 'archived'.");
  }

  if (loadMode !== undefined && loadMode !== "static" && loadMode !== "http") {
    throw new HttpError(400, "Field 'load_mode' must be 'static' or 'http'.");
  }

  const blobBase64 = getString(body.blob_content_base64, "blob_content_base64", {
    allowEmpty: true,
  });
  const textContent = getString(body.text_content, "text_content", { allowEmpty: true }) ?? null;
  const blobContent = blobBase64 ? Buffer.from(blobBase64, "base64") : null;
  const resolvedLoadMode = (loadMode ?? "static") as "static" | "http";

  if (resolvedLoadMode === "static" && !textContent && !blobContent) {
    throw new HttpError(
      400,
      "Static resource versions require either 'text_content' or 'blob_content_base64'.",
    );
  }

  const version = await createResourceVersionRecord(
    getIntegerParam(request.params.resourceId, "resourceId"),
    {
      textContent,
      blobContent,
      loadMode: resolvedLoadMode,
      loadSpec: getJsonObject(body.load_spec, "load_spec"),
      metadata: getJsonObject(body.metadata, "metadata"),
      status: status as "draft" | "validated" | "archived" | undefined,
    },
  );

  handleResponse(response, 201, "Resource version created", version);
};

export const publishResourceVersion: RequestHandler = async (
  request,
  response,
): Promise<void> => {
  const body = isRecord(request.body) ? request.body : {};
  const adminSession = response.locals.adminSession as { id: string } | undefined;
  const published = await publishResourceVersionRecord(
    getIntegerParam(request.params.resourceId, "resourceId"),
    getPublishSelector(body),
    adminSession?.id ?? "admin_session",
    getString(body.note, "note", { allowEmpty: true }),
  );

  handleResponse(response, 200, "Resource version published", published);
};
