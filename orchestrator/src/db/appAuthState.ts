import { query } from "../config/db.js";

export type AppAuthStateRecord = {
  id: number;
  setup_completed_at: string | null;
  password_hash: string | null;
  password_salt: string | null;
  password_updated_at: string | null;
  refresh_token_version: number;
  created_at: string;
  updated_at: string;
};

export const getAppAuthState = async (): Promise<AppAuthStateRecord> => {
  const result = await query<AppAuthStateRecord>(
    `
      SELECT *
      FROM app_auth_state
      WHERE id = 1
    `,
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("app_auth_state row is missing.");
  }

  return row;
};

export const completeInitialSetup = async (values: {
  passwordHash: string;
  passwordSalt: string;
}): Promise<AppAuthStateRecord> => {
  const result = await query<AppAuthStateRecord>(
    `
      UPDATE app_auth_state
      SET
        password_hash = $1,
        password_salt = $2,
        setup_completed_at = now(),
        password_updated_at = now(),
        updated_at = now()
      WHERE id = 1
        AND setup_completed_at IS NULL
      RETURNING *
    `,
    [values.passwordHash, values.passwordSalt],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Initial setup has already been completed.");
  }

  return row;
};

export const bumpRefreshTokenVersion = async (): Promise<AppAuthStateRecord> => {
  const result = await query<AppAuthStateRecord>(
    `
      UPDATE app_auth_state
      SET
        refresh_token_version = refresh_token_version + 1,
        updated_at = now()
      WHERE id = 1
      RETURNING *
    `,
  );

  return result.rows[0];
};
