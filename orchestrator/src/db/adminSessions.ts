import type { QueryResultRow } from "pg";

import { query } from "../config/db.js";

export type AdminSessionRecord = {
  id: string;
  access_prefix: string;
  access_key_hash: string;
  access_salt: string;
  refresh_prefix: string;
  refresh_key_hash: string;
  refresh_salt: string;
  refresh_version: number;
  status: "active" | "revoked" | "expired";
  last_used_at: string | null;
  revoked_at: string | null;
  access_expires_at: string;
  refresh_expires_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const toPublicSession = (row: AdminSessionRecord) => ({
  id: row.id,
  status: row.status,
  last_used_at: row.last_used_at,
  revoked_at: row.revoked_at,
  access_expires_at: row.access_expires_at,
  refresh_expires_at: row.refresh_expires_at,
  metadata: row.metadata,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export const createAdminSession = async (values: {
  access_prefix: string;
  access_key_hash: string;
  access_salt: string;
  refresh_prefix: string;
  refresh_key_hash: string;
  refresh_salt: string;
  refresh_version: number;
  access_expires_at: string;
  refresh_expires_at: string;
  metadata?: Record<string, unknown>;
}): Promise<ReturnType<typeof toPublicSession>> => {
  const result = await query<AdminSessionRecord>(
    `
      INSERT INTO admin_sessions (
        access_prefix,
        access_key_hash,
        access_salt,
        refresh_prefix,
        refresh_key_hash,
        refresh_salt,
        refresh_version,
        access_expires_at,
        refresh_expires_at,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
      RETURNING *
    `,
    [
      values.access_prefix,
      values.access_key_hash,
      values.access_salt,
      values.refresh_prefix,
      values.refresh_key_hash,
      values.refresh_salt,
      values.refresh_version,
      values.access_expires_at,
      values.refresh_expires_at,
      JSON.stringify(values.metadata ?? {}),
    ],
  );

  return toPublicSession(result.rows[0]);
};

export const getAdminSessionByAccessPrefix = async (
  prefix: string,
): Promise<AdminSessionRecord | null> => {
  const result = await query<AdminSessionRecord>(
    `
      SELECT *
      FROM admin_sessions
      WHERE access_prefix = $1
    `,
    [prefix],
  );

  return result.rows[0] ?? null;
};

export const getAdminSessionByRefreshPrefix = async (
  prefix: string,
): Promise<AdminSessionRecord | null> => {
  const result = await query<AdminSessionRecord>(
    `
      SELECT *
      FROM admin_sessions
      WHERE refresh_prefix = $1
    `,
    [prefix],
  );

  return result.rows[0] ?? null;
};

export const revokeAdminSessionById = async (
  id: string,
  reason?: string,
): Promise<ReturnType<typeof toPublicSession> | null> => {
  const result = await query<AdminSessionRecord>(
    `
      UPDATE admin_sessions
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
  return row ? toPublicSession(row) : null;
};

export const markAdminSessionUsed = async (id: string): Promise<void> => {
  await query<QueryResultRow>(
    `
      UPDATE admin_sessions
      SET
        last_used_at = now(),
        updated_at = now()
      WHERE id = $1
    `,
    [id],
  );
};
