import { query } from "../config/db.js";

export type DeviceRecord = {
  id: string;
  device_key: string;
  name: string;
  status: "pending" | "approved" | "rejected" | "revoked";
  capabilities: unknown[];
  metadata: Record<string, unknown>;
  last_seen_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

const toPublicDevice = (row: DeviceRecord) => ({
  id: row.id,
  device_key: row.device_key,
  name: row.name,
  status: row.status,
  capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
  metadata: row.metadata,
  last_seen_at: row.last_seen_at,
  approved_at: row.approved_at,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export const getDevices = async (): Promise<ReturnType<typeof toPublicDevice>[]> => {
  const result = await query<DeviceRecord>(
    `
      SELECT *
      FROM devices
      ORDER BY created_at DESC
    `,
  );

  return result.rows.map(toPublicDevice);
};

export const getDeviceById = async (
  id: string,
): Promise<ReturnType<typeof toPublicDevice> | null> => {
  const result = await query<DeviceRecord>(
    `
      SELECT *
      FROM devices
      WHERE id = $1
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? toPublicDevice(row) : null;
};

export const getDeviceRecordById = async (id: string): Promise<DeviceRecord | null> => {
  const result = await query<DeviceRecord>(
    `
      SELECT *
      FROM devices
      WHERE id = $1
    `,
    [id],
  );

  return result.rows[0] ?? null;
};

export const createDevice = async (values: {
  device_key: string;
  name: string;
  status?: "pending" | "approved" | "rejected" | "revoked";
  capabilities?: unknown[];
  metadata?: Record<string, unknown>;
}): Promise<ReturnType<typeof toPublicDevice>> => {
  const approvedAt = values.status === "approved" || values.status === undefined ? new Date().toISOString() : null;
  const result = await query<DeviceRecord>(
    `
      INSERT INTO devices (
        device_key,
        name,
        status,
        capabilities,
        metadata,
        approved_at
      )
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
      RETURNING *
    `,
    [
      values.device_key,
      values.name,
      values.status ?? "approved",
      JSON.stringify(values.capabilities ?? []),
      JSON.stringify(values.metadata ?? {}),
      approvedAt,
    ],
  );

  return toPublicDevice(result.rows[0]);
};
