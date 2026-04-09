import type { QueryResultRow } from "pg";

import { query } from "../config/db.js";

export type BearerTokenRecord = {
  id: string;
  prefix: string;
  key_hash: string;
  salt: string;
  name: string;
  created_by: string;
  status: "active" | "revoked" | "expired";
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type NewBearerToken = {
  prefix: string;
  key_hash: string;
  salt: string;
  name: string;
  created_by: string;
  expires_at?: string | null;
  metadata?: Record<string, unknown>;
};

const toPublicToken = (row: BearerTokenRecord) => ({
  id: row.id,
  prefix: row.prefix,
  name: row.name,
  created_by: row.created_by,
  status: row.status,
  last_used_at: row.last_used_at,
  revoked_at: row.revoked_at,
  expires_at: row.expires_at,
  metadata: row.metadata,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export const getBearerTokens = async (): Promise<ReturnType<typeof toPublicToken>[]> => {
  const result = await query<BearerTokenRecord>(
    `
      SELECT *
      FROM bearer_tokens
      ORDER BY created_at DESC
    `,
  );

  return result.rows.map(toPublicToken);
};

export const getBearerTokenById = async (
  id: string,
): Promise<ReturnType<typeof toPublicToken> | null> => {
  const result = await query<BearerTokenRecord>(
    `
      SELECT *
      FROM bearer_tokens
      WHERE id = $1
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? toPublicToken(row) : null;
};

export const getBearerTokenByPrefix = async (
  prefix: string,
): Promise<BearerTokenRecord | null> => {
  const result = await query<BearerTokenRecord>(
    `
      SELECT *
      FROM bearer_tokens
      WHERE prefix = $1
    `,
    [prefix],
  );

  return result.rows[0] ?? null;
};

export const createBearerToken = async (
  values: NewBearerToken,
): Promise<ReturnType<typeof toPublicToken>> => {
  const result = await query<BearerTokenRecord>(
    `
      INSERT INTO bearer_tokens (
        prefix,
        key_hash,
        salt,
        name,
        created_by,
        expires_at,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      RETURNING *
    `,
    [
      values.prefix,
      values.key_hash,
      values.salt,
      values.name,
      values.created_by,
      values.expires_at ?? null,
      JSON.stringify(values.metadata ?? {}),
    ],
  );

  return toPublicToken(result.rows[0]);
};

export const updateBearerTokenById = async (
  id: string,
  updates: {
    name?: string;
    expires_at?: string | null;
    metadata?: Record<string, unknown>;
    status?: "active" | "revoked" | "expired";
  },
): Promise<ReturnType<typeof toPublicToken> | null> => {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push(`name = $${values.length + 1}`);
    values.push(updates.name);
  }

  if (updates.expires_at !== undefined) {
    fields.push(`expires_at = $${values.length + 1}`);
    values.push(updates.expires_at);
  }

  if (updates.metadata !== undefined) {
    fields.push(`metadata = $${values.length + 1}::jsonb`);
    values.push(JSON.stringify(updates.metadata));
  }

  if (updates.status !== undefined) {
    fields.push(`status = $${values.length + 1}`);
    values.push(updates.status);
  }

  if (fields.length === 0) {
    return getBearerTokenById(id);
  }

  fields.push(`updated_at = now()`);
  values.push(id);

  const result = await query<BearerTokenRecord>(
    `
      UPDATE bearer_tokens
      SET ${fields.join(", ")}
      WHERE id = $${values.length}
      RETURNING *
    `,
    values,
  );

  const row = result.rows[0];
  return row ? toPublicToken(row) : null;
};

export const deleteBearerTokenById = async (
  id: string,
): Promise<ReturnType<typeof toPublicToken> | null> => {
  const result = await query<BearerTokenRecord>(
    `
      DELETE FROM bearer_tokens
      WHERE id = $1
      RETURNING *
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? toPublicToken(row) : null;
};

export const revokeBearerToken = async (
  id: string,
  reason?: string,
): Promise<ReturnType<typeof toPublicToken> | null> => {
  const result = await query<BearerTokenRecord>(
    `
      UPDATE bearer_tokens
      SET
        status = 'revoked',
        revoked_at = now(),
        updated_at = now(),
        metadata = CASE
          WHEN $2::text IS NULL THEN metadata
          ELSE jsonb_set(metadata, '{revocation_reason}', to_jsonb($2::text), true)
        END
      WHERE id = $1
      RETURNING *
    `,
    [id, reason ?? null],
  );

  const row = result.rows[0];
  return row ? toPublicToken(row) : null;
};

export const markBearerTokenUsed = async (id: string): Promise<void> => {
  await query<QueryResultRow>(
    `
      UPDATE bearer_tokens
      SET
        last_used_at = now(),
        updated_at = now()
      WHERE id = $1
    `,
    [id],
  );
};
