import { closePool, query } from "./db.js";

const statements: string[] = [
  `
    CREATE TABLE IF NOT EXISTS integrations (
      id BIGSERIAL PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      transport TEXT NOT NULL CHECK (transport IN ('http')),
      base_url_env_var TEXT NOT NULL,
      auth_strategy TEXT NOT NULL DEFAULT 'none'
        CHECK (
          auth_strategy IN (
            'none',
            'bearer_env',
            'api_key_header_env',
            'api_key_query_env',
            'basic_env'
          )
        ),
      auth_config JSONB NOT NULL DEFAULT '{}'::jsonb,
      default_headers JSONB NOT NULL DEFAULT '{}'::jsonb,
      allowed_hosts JSONB NOT NULL DEFAULT '[]'::jsonb,
      timeout_ms INTEGER NOT NULL DEFAULT 10000 CHECK (timeout_ms > 0),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS tools (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      integration_id BIGINT NOT NULL REFERENCES integrations(id) ON DELETE RESTRICT,
      current_published_version_id BIGINT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      planner_visible BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS tool_versions (
      id BIGSERIAL PRIMARY KEY,
      tool_id BIGINT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      description TEXT NOT NULL,
      input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
      result_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
      execution_summary TEXT,
      execution_mode TEXT NOT NULL DEFAULT 'http'
        CHECK (execution_mode IN ('http')),
      execution_spec JSONB NOT NULL DEFAULT '{}'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL CHECK (status IN ('draft', 'validated', 'published', 'archived')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tool_id, version_number)
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS tool_publish_events (
      id BIGSERIAL PRIMARY KEY,
      tool_id BIGINT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
      tool_version_id BIGINT NOT NULL REFERENCES tool_versions(id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK (action IN ('publish', 'rollback', 'unpublish')),
      actor TEXT,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS resources (
      id BIGSERIAL PRIMARY KEY,
      uri TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      mime_type TEXT,
      description TEXT NOT NULL DEFAULT '',
      current_published_version_id BIGINT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS resource_versions (
      id BIGSERIAL PRIMARY KEY,
      resource_id BIGINT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      text_content TEXT,
      blob_content BYTEA,
      load_mode TEXT NOT NULL DEFAULT 'static'
        CHECK (load_mode IN ('static', 'http')),
      load_spec JSONB NOT NULL DEFAULT '{}'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL CHECK (status IN ('draft', 'validated', 'published', 'archived')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (
        text_content IS NOT NULL
        OR blob_content IS NOT NULL
        OR load_mode <> 'static'
      ),
      UNIQUE (resource_id, version_number)
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS resource_publish_events (
      id BIGSERIAL PRIMARY KEY,
      resource_id BIGINT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      resource_version_id BIGINT NOT NULL REFERENCES resource_versions(id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK (action IN ('publish', 'rollback', 'unpublish')),
      actor TEXT,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS bearer_tokens (
      id BIGSERIAL PRIMARY KEY,
      prefix TEXT NOT NULL UNIQUE,
      key_hash TEXT NOT NULL UNIQUE,
      salt TEXT NOT NULL,
      name TEXT NOT NULL,
      created_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'revoked', 'expired')),
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `,
  `
    ALTER TABLE tools
      DROP CONSTRAINT IF EXISTS tools_current_published_version_id_fkey;
  `,
  `
    ALTER TABLE tools
      ADD CONSTRAINT tools_current_published_version_id_fkey
      FOREIGN KEY (current_published_version_id)
      REFERENCES tool_versions(id)
      ON DELETE SET NULL;
  `,
  `
    ALTER TABLE resources
      DROP CONSTRAINT IF EXISTS resources_current_published_version_id_fkey;
  `,
  `
    ALTER TABLE resources
      ADD CONSTRAINT resources_current_published_version_id_fkey
      FOREIGN KEY (current_published_version_id)
      REFERENCES resource_versions(id)
      ON DELETE SET NULL;
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_tools_integration_id
      ON tools (integration_id);
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_tool_versions_tool_id_status
      ON tool_versions (tool_id, status);
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_integrations_enabled
      ON integrations (enabled);
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_resource_versions_resource_id_status
      ON resource_versions (resource_id, status);
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_bearer_tokens_status
      ON bearer_tokens (status);
  `,
  `
    CREATE OR REPLACE VIEW published_tool_catalog AS
    SELECT
      t.name,
      tv.description,
      tv.input_schema,
      tv.result_schema,
      i.key AS integration_key,
      tv.execution_summary,
      tv.execution_mode,
      tv.execution_spec,
      i.transport,
      i.base_url_env_var,
      i.auth_strategy,
      i.auth_config,
      i.default_headers,
      i.allowed_hosts,
      i.timeout_ms,
      i.metadata AS integration_metadata,
      tv.metadata AS tool_metadata
    FROM tools t
    INNER JOIN integrations i
      ON i.id = t.integration_id
    INNER JOIN tool_versions tv
      ON tv.id = t.current_published_version_id
    WHERE
      t.enabled = TRUE
      AND t.planner_visible = TRUE
      AND i.enabled = TRUE
      AND tv.status = 'published';
  `,
  `
    CREATE OR REPLACE VIEW published_resource_catalog AS
    SELECT
      r.uri,
      r.name,
      r.mime_type,
      r.description,
      rv.text_content AS text,
      rv.load_mode,
      rv.load_spec,
      rv.metadata
    FROM resources r
    INNER JOIN resource_versions rv
      ON rv.id = r.current_published_version_id
    WHERE
      r.enabled = TRUE
      AND rv.status = 'published';
  `,
];

export const createAllTables = async (): Promise<void> => {
  for (const statement of statements) {
    await query(statement);
  }
};

const main = async (): Promise<void> => {
  try {
    await createAllTables();
    console.log("Orchestrator database schema is ready.");
  } finally {
    await closePool();
  }
};

const entryPath = process.argv[1]
  ? new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href
  : "";

if (import.meta.url === entryPath) {
  void main();
}
