import { Pool } from "pg";

export type CatalogToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  integrationKey: string;
  executionSummary: string | null;
};

export type CatalogResourceDefinition = {
  uri: string;
  name: string;
  mimeType: string | null;
  text: string | null;
};

type CatalogSnapshot = {
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
      integration_key: string;
      execution_summary: string | null;
    }>(`
      select
        name,
        description,
        input_schema,
        integration_key,
        execution_summary
      from published_tool_catalog
      order by name asc
    `);

    const resourceResult = await pool.query<{
      uri: string;
      name: string;
      mime_type: string | null;
      text: string | null;
    }>(`
      select
        uri,
        name,
        mime_type,
        text
      from published_resource_catalog
      order by uri asc
    `);

    return {
      source: "postgres",
      tools: toolResult.rows.map((row) => ({
        name: row.name,
        description: row.description,
        inputSchema: row.input_schema ?? {},
        integrationKey: row.integration_key,
        executionSummary: row.execution_summary,
      })),
      resources: resourceResult.rows.map((row) => ({
        uri: row.uri,
        name: row.name,
        mimeType: row.mime_type,
        text: row.text,
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
