import type { QueryResultRow } from "pg";

import { query } from "../config/db.js";

export type DeviceTokenRecord = {
  id: string;
  device_id: string;
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
  device_name?: string;
  device_key?: string;
};

const toPublicToken = (row: DeviceTokenRecord) => ({
  id: row.id,
  device_id: row.device_id,
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
  device_name: row.device_name,
  device_key: row.device_key,
});

export const getDeviceTokenByPrefix = async (
  prefix: string,
): Promise<DeviceTokenRecord | null> => {
  const result = await query<DeviceTokenRecord>(
    `
      SELECT dt.*, d.name AS device_name, d.device_key
      FROM device_tokens dt
      INNER JOIN devices d
        ON d.id = dt.device_id
      WHERE dt.prefix = $1
    `,
    [prefix],
  );

  return result.rows[0] ?? null;
};

export const createDeviceToken = async (values: {
  device_id: string;
  prefix: string;
  key_hash: string;
  salt: string;
  name: string;
  created_by: string;
  expires_at?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<ReturnType<typeof toPublicToken>> => {
  const result = await query<DeviceTokenRecord>(
    `
      INSERT INTO device_tokens (
        device_id,
        prefix,
        key_hash,
        salt,
        name,
        created_by,
        expires_at,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      RETURNING *
    `,
    [
      values.device_id,
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

export const markDeviceTokenUsed = async (id: string): Promise<void> => {
  await query<QueryResultRow>(
    `
      UPDATE device_tokens
      SET
        last_used_at = now(),
        updated_at = now()
      WHERE id = $1
    `,
    [id],
  );
};
