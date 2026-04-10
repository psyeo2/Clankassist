import type { PoolClient } from "pg";

import { pool, query } from "../config/db.js";
import { HttpError } from "../utils/errors.js";

type IntegrationRecord = {
  id: string;
  key: string;
  display_name: string;
  description: string;
  transport: "http";
  base_url_env_var: string;
  auth_strategy:
    | "none"
    | "bearer_env"
    | "api_key_header_env"
    | "api_key_query_env"
    | "basic_env";
  auth_config: Record<string, unknown>;
  default_headers: Record<string, unknown>;
  allowed_hosts: unknown[];
  timeout_ms: number;
  metadata: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

type ToolRecord = {
  id: string;
  name: string;
  integration_id: string;
  current_published_version_id: string | null;
  enabled: boolean;
  planner_visible: boolean;
  created_at: string;
  updated_at: string;
};

type ToolVersionRecord = {
  id: string;
  tool_id: string;
  version_number: number;
  description: string;
  input_schema: Record<string, unknown>;
  result_schema: Record<string, unknown>;
  execution_summary: string | null;
  execution_mode: "http";
  execution_spec: Record<string, unknown>;
  metadata: Record<string, unknown>;
  status: "draft" | "validated" | "published" | "archived";
  created_at: string;
  updated_at: string;
};

type ResourceRecord = {
  id: string;
  uri: string;
  name: string;
  mime_type: string | null;
  description: string;
  current_published_version_id: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

type ResourceVersionRecord = {
  id: string;
  resource_id: string;
  version_number: number;
  text_content: string | null;
  blob_content: Buffer | null;
  load_mode: "static" | "http";
  load_spec: Record<string, unknown>;
  metadata: Record<string, unknown>;
  status: "draft" | "validated" | "published" | "archived";
  created_at: string;
  updated_at: string;
};

type IntegrationInput = {
  key: string;
  displayName: string;
  description?: string;
  transport: "http";
  baseUrlEnvVar: string;
  authStrategy:
    | "none"
    | "bearer_env"
    | "api_key_header_env"
    | "api_key_query_env"
    | "basic_env";
  authConfig?: Record<string, unknown>;
  defaultHeaders?: Record<string, unknown>;
  allowedHosts?: string[];
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
  enabled?: boolean;
};

type ToolInput = {
  name: string;
  integrationId?: string;
  integrationKey?: string;
  enabled?: boolean;
  plannerVisible?: boolean;
};

type ToolVersionInput = {
  description: string;
  inputSchema?: Record<string, unknown>;
  resultSchema?: Record<string, unknown>;
  executionSummary?: string | null;
  executionMode?: "http";
  executionSpec?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  status?: "draft" | "validated" | "archived";
};

type ResourceInput = {
  uri: string;
  name: string;
  mimeType?: string | null;
  description?: string;
  enabled?: boolean;
};

type ResourceVersionInput = {
  textContent?: string | null;
  blobContent?: Buffer | null;
  loadMode?: "static" | "http";
  loadSpec?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  status?: "draft" | "validated" | "archived";
};

const withTransaction = async <T>(callback: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const getIntegrationById = async (
  client: PoolClient,
  integrationId: string,
): Promise<IntegrationRecord | null> => {
  const result = await client.query<IntegrationRecord>(
    `
      SELECT *
      FROM integrations
      WHERE id = $1
    `,
    [integrationId],
  );

  return result.rows[0] ?? null;
};

const getIntegrationByKey = async (
  client: PoolClient,
  integrationKey: string,
): Promise<IntegrationRecord | null> => {
  const result = await client.query<IntegrationRecord>(
    `
      SELECT *
      FROM integrations
      WHERE key = $1
    `,
    [integrationKey],
  );

  return result.rows[0] ?? null;
};

const getToolById = async (client: PoolClient, toolId: string): Promise<ToolRecord | null> => {
  const result = await client.query<ToolRecord>(
    `
      SELECT *
      FROM tools
      WHERE id = $1
    `,
    [toolId],
  );

  return result.rows[0] ?? null;
};

const getResourceById = async (
  client: PoolClient,
  resourceId: string,
): Promise<ResourceRecord | null> => {
  const result = await client.query<ResourceRecord>(
    `
      SELECT *
      FROM resources
      WHERE id = $1
    `,
    [resourceId],
  );

  return result.rows[0] ?? null;
};

const resolveIntegrationId = async (
  client: PoolClient,
  input: ToolInput,
): Promise<string> => {
  if (input.integrationId) {
    const integration = await getIntegrationById(client, input.integrationId);
    if (!integration) {
      throw new HttpError(404, "Integration not found.");
    }

    return integration.id;
  }

  if (input.integrationKey) {
    const integration = await getIntegrationByKey(client, input.integrationKey);
    if (!integration) {
      throw new HttpError(404, "Integration not found.");
    }

    return integration.id;
  }

  throw new HttpError(400, "Provide either 'integration_id' or 'integration_key'.");
};

const getNextToolVersionNumber = async (
  client: PoolClient,
  toolId: string,
): Promise<number> => {
  const result = await client.query<{ next_version: number }>(
    `
      SELECT COALESCE(MAX(version_number) + 1, 1) AS next_version
      FROM tool_versions
      WHERE tool_id = $1
    `,
    [toolId],
  );

  return result.rows[0]?.next_version ?? 1;
};

const getNextResourceVersionNumber = async (
  client: PoolClient,
  resourceId: string,
): Promise<number> => {
  const result = await client.query<{ next_version: number }>(
    `
      SELECT COALESCE(MAX(version_number) + 1, 1) AS next_version
      FROM resource_versions
      WHERE resource_id = $1
    `,
    [resourceId],
  );

  return result.rows[0]?.next_version ?? 1;
};

const getToolVersionTarget = async (
  client: PoolClient,
  toolId: string,
  selector: { versionId?: string; versionNumber?: number },
): Promise<ToolVersionRecord> => {
  const result = await client.query<ToolVersionRecord>(
    `
      SELECT *
      FROM tool_versions
      WHERE tool_id = $1
        AND (
          ($2::bigint IS NOT NULL AND id = $2::bigint)
          OR
          ($3::integer IS NOT NULL AND version_number = $3::integer)
        )
      LIMIT 1
    `,
    [toolId, selector.versionId ?? null, selector.versionNumber ?? null],
  );

  const row = result.rows[0];
  if (!row) {
    throw new HttpError(404, "Tool version not found.");
  }

  return row;
};

const getResourceVersionTarget = async (
  client: PoolClient,
  resourceId: string,
  selector: { versionId?: string; versionNumber?: number },
): Promise<ResourceVersionRecord> => {
  const result = await client.query<ResourceVersionRecord>(
    `
      SELECT *
      FROM resource_versions
      WHERE resource_id = $1
        AND (
          ($2::bigint IS NOT NULL AND id = $2::bigint)
          OR
          ($3::integer IS NOT NULL AND version_number = $3::integer)
        )
      LIMIT 1
    `,
    [resourceId, selector.versionId ?? null, selector.versionNumber ?? null],
  );

  const row = result.rows[0];
  if (!row) {
    throw new HttpError(404, "Resource version not found.");
  }

  return row;
};

export const createIntegrationRecord = async (
  input: IntegrationInput,
): Promise<IntegrationRecord> => {
  const result = await query<IntegrationRecord>(
    `
      INSERT INTO integrations (
        key,
        display_name,
        description,
        transport,
        base_url_env_var,
        auth_strategy,
        auth_config,
        default_headers,
        allowed_hosts,
        timeout_ms,
        metadata,
        enabled
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11::jsonb, $12)
      RETURNING *
    `,
    [
      input.key,
      input.displayName,
      input.description ?? "",
      input.transport,
      input.baseUrlEnvVar,
      input.authStrategy,
      JSON.stringify(input.authConfig ?? {}),
      JSON.stringify(input.defaultHeaders ?? {}),
      JSON.stringify(input.allowedHosts ?? []),
      input.timeoutMs ?? 10000,
      JSON.stringify(input.metadata ?? {}),
      input.enabled ?? true,
    ],
  );

  return result.rows[0];
};

export const createToolRecord = async (input: ToolInput): Promise<ToolRecord> =>
  withTransaction(async (client) => {
    const integrationId = await resolveIntegrationId(client, input);
    const result = await client.query<ToolRecord>(
      `
        INSERT INTO tools (
          name,
          integration_id,
          enabled,
          planner_visible
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [
        input.name,
        integrationId,
        input.enabled ?? true,
        input.plannerVisible ?? true,
      ],
    );

    return result.rows[0];
  });

export const createToolVersionRecord = async (
  toolId: string,
  input: ToolVersionInput,
): Promise<ToolVersionRecord> =>
  withTransaction(async (client) => {
    const tool = await getToolById(client, toolId);
    if (!tool) {
      throw new HttpError(404, "Tool not found.");
    }

    const versionNumber = await getNextToolVersionNumber(client, toolId);
    const result = await client.query<ToolVersionRecord>(
      `
        INSERT INTO tool_versions (
          tool_id,
          version_number,
          description,
          input_schema,
          result_schema,
          execution_summary,
          execution_mode,
          execution_spec,
          metadata,
          status
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8::jsonb, $9::jsonb, $10)
        RETURNING *
      `,
      [
        toolId,
        versionNumber,
        input.description,
        JSON.stringify(input.inputSchema ?? {}),
        JSON.stringify(input.resultSchema ?? {}),
        input.executionSummary ?? null,
        input.executionMode ?? "http",
        JSON.stringify(input.executionSpec ?? {}),
        JSON.stringify(input.metadata ?? {}),
        input.status ?? "draft",
      ],
    );

    return result.rows[0];
  });

export const publishToolVersionRecord = async (
  toolId: string,
  selector: { versionId?: string; versionNumber?: number },
  actor: string,
  note?: string,
): Promise<{ tool: ToolRecord; version: ToolVersionRecord; action: "publish" | "rollback" }> =>
  withTransaction(async (client) => {
    const tool = await getToolById(client, toolId);
    if (!tool) {
      throw new HttpError(404, "Tool not found.");
    }

    const targetVersion = await getToolVersionTarget(client, toolId, selector);

    let currentVersion: ToolVersionRecord | null = null;
    if (tool.current_published_version_id) {
      const currentResult = await client.query<ToolVersionRecord>(
        `
          SELECT *
          FROM tool_versions
          WHERE id = $1
        `,
        [tool.current_published_version_id],
      );
      currentVersion = currentResult.rows[0] ?? null;
    }

    const action: "publish" | "rollback" =
      currentVersion && targetVersion.version_number < currentVersion.version_number
        ? "rollback"
        : "publish";

    await client.query(
      `
        UPDATE tool_versions
        SET
          status = CASE
            WHEN id = $2 THEN 'published'
            WHEN status = 'published' THEN 'archived'
            ELSE status
          END,
          updated_at = now()
        WHERE tool_id = $1
      `,
      [toolId, targetVersion.id],
    );

    const updatedToolResult = await client.query<ToolRecord>(
      `
        UPDATE tools
        SET
          current_published_version_id = $2,
          updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [toolId, targetVersion.id],
    );

    await client.query(
      `
        INSERT INTO tool_publish_events (
          tool_id,
          tool_version_id,
          action,
          actor,
          note
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [toolId, targetVersion.id, action, actor, note ?? null],
    );

    const updatedVersionResult = await client.query<ToolVersionRecord>(
      `
        SELECT *
        FROM tool_versions
        WHERE id = $1
      `,
      [targetVersion.id],
    );

    return {
      tool: updatedToolResult.rows[0],
      version: updatedVersionResult.rows[0],
      action,
    };
  });

export const createResourceRecord = async (input: ResourceInput): Promise<ResourceRecord> => {
  const result = await query<ResourceRecord>(
    `
      INSERT INTO resources (
        uri,
        name,
        mime_type,
        description,
        enabled
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [
      input.uri,
      input.name,
      input.mimeType ?? null,
      input.description ?? "",
      input.enabled ?? true,
    ],
  );

  return result.rows[0];
};

export const createResourceVersionRecord = async (
  resourceId: string,
  input: ResourceVersionInput,
): Promise<ResourceVersionRecord> =>
  withTransaction(async (client) => {
    const resource = await getResourceById(client, resourceId);
    if (!resource) {
      throw new HttpError(404, "Resource not found.");
    }

    const versionNumber = await getNextResourceVersionNumber(client, resourceId);
    const result = await client.query<ResourceVersionRecord>(
      `
        INSERT INTO resource_versions (
          resource_id,
          version_number,
          text_content,
          blob_content,
          load_mode,
          load_spec,
          metadata,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
        RETURNING *
      `,
      [
        resourceId,
        versionNumber,
        input.textContent ?? null,
        input.blobContent ?? null,
        input.loadMode ?? "static",
        JSON.stringify(input.loadSpec ?? {}),
        JSON.stringify(input.metadata ?? {}),
        input.status ?? "draft",
      ],
    );

    return result.rows[0];
  });

export const publishResourceVersionRecord = async (
  resourceId: string,
  selector: { versionId?: string; versionNumber?: number },
  actor: string,
  note?: string,
): Promise<{ resource: ResourceRecord; version: ResourceVersionRecord; action: "publish" | "rollback" }> =>
  withTransaction(async (client) => {
    const resource = await getResourceById(client, resourceId);
    if (!resource) {
      throw new HttpError(404, "Resource not found.");
    }

    const targetVersion = await getResourceVersionTarget(client, resourceId, selector);

    let currentVersion: ResourceVersionRecord | null = null;
    if (resource.current_published_version_id) {
      const currentResult = await client.query<ResourceVersionRecord>(
        `
          SELECT *
          FROM resource_versions
          WHERE id = $1
        `,
        [resource.current_published_version_id],
      );
      currentVersion = currentResult.rows[0] ?? null;
    }

    const action: "publish" | "rollback" =
      currentVersion && targetVersion.version_number < currentVersion.version_number
        ? "rollback"
        : "publish";

    await client.query(
      `
        UPDATE resource_versions
        SET
          status = CASE
            WHEN id = $2 THEN 'published'
            WHEN status = 'published' THEN 'archived'
            ELSE status
          END,
          updated_at = now()
        WHERE resource_id = $1
      `,
      [resourceId, targetVersion.id],
    );

    const updatedResourceResult = await client.query<ResourceRecord>(
      `
        UPDATE resources
        SET
          current_published_version_id = $2,
          updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [resourceId, targetVersion.id],
    );

    await client.query(
      `
        INSERT INTO resource_publish_events (
          resource_id,
          resource_version_id,
          action,
          actor,
          note
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [resourceId, targetVersion.id, action, actor, note ?? null],
    );

    const updatedVersionResult = await client.query<ResourceVersionRecord>(
      `
        SELECT *
        FROM resource_versions
        WHERE id = $1
      `,
      [targetVersion.id],
    );

    return {
      resource: updatedResourceResult.rows[0],
      version: updatedVersionResult.rows[0],
      action,
    };
  });
