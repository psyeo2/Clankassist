import { closePool, query } from "./db.js";

const statements: string[] = [
  `
    CREATE TABLE IF NOT EXISTS tools (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
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
    CREATE TABLE IF NOT EXISTS app_auth_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      setup_completed_at TIMESTAMPTZ,
      password_hash TEXT,
      password_salt TEXT,
      password_updated_at TIMESTAMPTZ,
      refresh_token_version INTEGER NOT NULL DEFAULT 1 CHECK (refresh_token_version > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (
        (setup_completed_at IS NULL AND password_hash IS NULL AND password_salt IS NULL)
        OR
        (setup_completed_at IS NOT NULL AND password_hash IS NOT NULL AND password_salt IS NOT NULL)
      )
    );
  `,
  `
    INSERT INTO app_auth_state (id)
    VALUES (1)
    ON CONFLICT (id) DO NOTHING;
  `,
  `
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id BIGSERIAL PRIMARY KEY,
      access_prefix TEXT NOT NULL UNIQUE,
      access_key_hash TEXT NOT NULL UNIQUE,
      access_salt TEXT NOT NULL,
      refresh_prefix TEXT NOT NULL UNIQUE,
      refresh_key_hash TEXT NOT NULL UNIQUE,
      refresh_salt TEXT NOT NULL,
      refresh_version INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'revoked', 'expired')),
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      access_expires_at TIMESTAMPTZ NOT NULL,
      refresh_expires_at TIMESTAMPTZ NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS devices (
      id BIGSERIAL PRIMARY KEY,
      device_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'approved'
        CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
      capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      last_seen_at TIMESTAMPTZ,
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS device_tokens (
      id BIGSERIAL PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
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
    CREATE INDEX IF NOT EXISTS idx_tool_versions_tool_id_status
      ON tool_versions (tool_id, status);
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_resource_versions_resource_id_status
      ON resource_versions (resource_id, status);
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_device_tokens_status
      ON device_tokens (status);
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_device_tokens_device_id
      ON device_tokens (device_id);
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_admin_sessions_status
      ON admin_sessions (status);
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_devices_status
      ON devices (status);
  `,
  `
    CREATE OR REPLACE VIEW published_tool_catalog AS
    SELECT
      t.name,
      tv.description,
      tv.input_schema,
      tv.result_schema,
      t.name AS integration_key,
      tv.execution_summary,
      tv.execution_mode,
      tv.execution_spec,
      'http'::text AS transport,
      COALESCE(tv.execution_spec ->> 'base_url', '') AS base_url,
      COALESCE(tv.execution_spec ->> 'auth_strategy', 'none') AS auth_strategy,
      COALESCE(tv.execution_spec -> 'auth_config', '{}'::jsonb) AS auth_config,
      COALESCE(tv.execution_spec -> 'default_headers', '{}'::jsonb) AS default_headers,
      COALESCE(tv.execution_spec -> 'allowed_hosts', '[]'::jsonb) AS allowed_hosts,
      COALESCE(NULLIF(tv.execution_spec ->> 'timeout_ms', '')::integer, 10000) AS timeout_ms,
      COALESCE(tv.execution_spec -> 'integration_metadata', '{}'::jsonb) AS integration_metadata,
      tv.metadata AS tool_metadata
    FROM tools t
    INNER JOIN tool_versions tv
      ON tv.id = t.current_published_version_id
    WHERE
      t.enabled = TRUE
      AND t.planner_visible = TRUE
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
