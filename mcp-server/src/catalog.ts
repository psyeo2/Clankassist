import { Pool } from "pg";

export type CatalogToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  resultSchema: Record<string, unknown>;
  integrationKey: string;
  executionSummary: string | null;
  executionMode: "http";
  executionSpec: Record<string, unknown>;
  transport: "http";
  baseUrlEnvVar: string;
  authStrategy:
    | "none"
    | "bearer_env"
    | "api_key_header_env"
    | "api_key_query_env"
    | "basic_env";
  authConfig: Record<string, unknown>;
  defaultHeaders: Record<string, unknown>;
  allowedHosts: unknown[];
  timeoutMs: number;
  integrationMetadata: Record<string, unknown>;
  toolMetadata: Record<string, unknown>;
};

export type CatalogResourceDefinition = {
  uri: string;
  name: string;
  mimeType: string | null;
  description: string;
  text: string | null;
  loadMode: "static" | "http";
  loadSpec: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type CatalogSnapshot = {
  source: "builtin" | "postgres";
  tools: CatalogToolDefinition[];
  resources: CatalogResourceDefinition[];
};

const hasPostgresConfig = (): boolean =>
  [
    process.env.PG_HOST,
    process.env.PG_PORT,
    process.env.PG_USER,
    process.env.PG_DB,
  ].every((value) => typeof value === "string" && value.trim() !== "");

const createPool = (): Pool =>
  new Pool({
    host: process.env.PG_HOST,
    port:
      typeof process.env.PG_PORT === "string" && process.env.PG_PORT.trim() !== ""
        ? Number.parseInt(process.env.PG_PORT, 10)
        : undefined,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DB,
  });

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export const loadCatalogSnapshot = async (): Promise<CatalogSnapshot> => {
  if (!hasPostgresConfig()) {
    return {
      source: "builtin",
      tools: [],
      resources: [],
    };
  }

  const pool = createPool();

  try {
    const toolResult = await pool.query<{
      name: string;
      description: string;
      input_schema: Record<string, unknown> | null;
      result_schema: Record<string, unknown> | null;
      integration_key: string;
      execution_summary: string | null;
      execution_mode: "http";
      execution_spec: Record<string, unknown> | null;
      transport: "http";
      base_url_env_var: string;
      auth_strategy:
        | "none"
        | "bearer_env"
        | "api_key_header_env"
        | "api_key_query_env"
        | "basic_env";
      auth_config: Record<string, unknown> | null;
      default_headers: Record<string, unknown> | null;
      allowed_hosts: unknown[] | null;
      timeout_ms: number;
      integration_metadata: Record<string, unknown> | null;
      tool_metadata: Record<string, unknown> | null;
    }>(`
      select
        name,
        description,
        input_schema,
        result_schema,
        integration_key,
        execution_summary,
        execution_mode,
        execution_spec,
        transport,
        base_url_env_var,
        auth_strategy,
        auth_config,
        default_headers,
        allowed_hosts,
        timeout_ms,
        integration_metadata,
        tool_metadata
      from published_tool_catalog
      order by name asc
    `);

    const resourceResult = await pool.query<{
      uri: string;
      name: string;
      mime_type: string | null;
      description: string;
      text: string | null;
      load_mode: "static" | "http";
      load_spec: Record<string, unknown> | null;
      metadata: Record<string, unknown> | null;
    }>(`
      select
        uri,
        name,
        mime_type,
        description,
        text,
        load_mode,
        load_spec,
        metadata
      from published_resource_catalog
      order by uri asc
    `);

    return {
      source: "postgres",
      tools: toolResult.rows.map((row) => ({
        name: row.name,
        description: row.description,
        inputSchema: row.input_schema ?? {},
        resultSchema: row.result_schema ?? {},
        integrationKey: row.integration_key,
        executionSummary: row.execution_summary,
        executionMode: row.execution_mode,
        executionSpec: asRecord(row.execution_spec),
        transport: row.transport,
        baseUrlEnvVar: row.base_url_env_var,
        authStrategy: row.auth_strategy,
        authConfig: asRecord(row.auth_config),
        defaultHeaders: asRecord(row.default_headers),
        allowedHosts: asArray(row.allowed_hosts),
        timeoutMs: row.timeout_ms,
        integrationMetadata: asRecord(row.integration_metadata),
        toolMetadata: asRecord(row.tool_metadata),
      })),
      resources: resourceResult.rows.map((row) => ({
        uri: row.uri,
        name: row.name,
        mimeType: row.mime_type,
        description: row.description,
        text: row.text,
        loadMode: row.load_mode,
        loadSpec: asRecord(row.load_spec),
        metadata: asRecord(row.metadata),
      })),
    };
  } catch (error) {
    console.error("Failed to load MCP catalog from Postgres. Falling back to built-in definitions.", error);

    return {
      source: "builtin",
      tools: [],
      resources: [],
    };
  } finally {
    await pool.end();
  }
};
