import { getAppAuthState } from "../db/appAuthState.js";
import { getDeviceTokenByPrefix, markDeviceTokenUsed } from "../db/deviceTokens.js";
import { verifyOpaqueToken } from "./token.js";
import { HttpError } from "../utils/errors.js";

export const authenticateDeviceHeader = async (
  authHeader: string | undefined,
): Promise<{ id: string; prefix: string; name: string; status: string; deviceId: string }> => {
  const state = await getAppAuthState();
  if (!state.setup_completed_at) {
    throw new HttpError(503, "Initial setup is required.");
  }

  if (!authHeader) {
    throw new HttpError(401, "Unauthorised: Missing authorisation header");
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    throw new HttpError(401, "Unauthorised: Invalid authorisation format");
  }

  const [prefix, key] = token.split(".");
  if (!prefix || !key) {
    throw new HttpError(401, "Unauthorised: Invalid bearer token format");
  }

  const tokenRecord = await getDeviceTokenByPrefix(prefix);
  if (!tokenRecord) {
    throw new HttpError(401, "Unauthorised: Token not found");
  }

  if (tokenRecord.status !== "active") {
    throw new HttpError(401, `Unauthorised: Token is ${tokenRecord.status}`);
  }

  if (tokenRecord.expires_at && new Date(tokenRecord.expires_at).getTime() <= Date.now()) {
    throw new HttpError(401, "Unauthorised: Token is expired");
  }

  if (!verifyOpaqueToken(key, tokenRecord.salt, tokenRecord.key_hash)) {
    throw new HttpError(401, "Unauthorised: Token could not be verified");
  }

  await markDeviceTokenUsed(tokenRecord.id);

  return {
    id: tokenRecord.id,
    prefix: tokenRecord.prefix,
    name: tokenRecord.name,
    status: tokenRecord.status,
    deviceId: tokenRecord.device_id,
  };
};
