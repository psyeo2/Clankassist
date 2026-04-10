import { addDays, addHours } from "../utils/time.js";
import { createAdminSession } from "../db/adminSessions.js";
import { getAppAuthState } from "../db/appAuthState.js";
import { generateOpaqueToken } from "./token.js";

export const issueAdminSession = async (
  metadata: Record<string, unknown> = {},
): Promise<{
  session: {
    id: string;
    status: string;
    last_used_at: string | null;
    revoked_at: string | null;
    access_expires_at: string;
    refresh_expires_at: string;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  };
  accessToken: string;
  refreshToken: string;
}> => {
  const state = await getAppAuthState();
  const access = generateOpaqueToken("adm_acc_");
  const refresh = generateOpaqueToken("adm_ref_");

  const session = await createAdminSession({
    access_prefix: access.prefix,
    access_key_hash: access.keyHash,
    access_salt: access.salt,
    refresh_prefix: refresh.prefix,
    refresh_key_hash: refresh.keyHash,
    refresh_salt: refresh.salt,
    refresh_version: state.refresh_token_version,
    access_expires_at: addHours(8).toISOString(),
    refresh_expires_at: addDays(30).toISOString(),
    metadata,
  });

  return {
    session,
    accessToken: access.userToken,
    refreshToken: refresh.userToken,
  };
};
