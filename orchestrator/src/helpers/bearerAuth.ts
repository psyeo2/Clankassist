import { getBearerTokenByPrefix, markBearerTokenUsed } from "../db/bearerTokens.js";
import { verifyBearerToken } from "./token.js";
import { HttpError } from "../utils/errors.js";

export const authenticateBearerHeader = async (
  authHeader: string | undefined,
): Promise<{ id: string; prefix: string; name: string; status: string }> => {
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

  const tokenRecord = await getBearerTokenByPrefix(prefix);
  if (!tokenRecord) {
    throw new HttpError(401, "Unauthorised: Token not found");
  }

  if (tokenRecord.status !== "active") {
    throw new HttpError(401, `Unauthorised: Token is ${tokenRecord.status}`);
  }

  if (tokenRecord.expires_at && new Date(tokenRecord.expires_at).getTime() <= Date.now()) {
    throw new HttpError(401, "Unauthorised: Token is expired");
  }

  if (!verifyBearerToken(key, tokenRecord.salt, tokenRecord.key_hash)) {
    throw new HttpError(401, "Unauthorised: Token could not be verified");
  }

  await markBearerTokenUsed(tokenRecord.id);

  return {
    id: tokenRecord.id,
    prefix: tokenRecord.prefix,
    name: tokenRecord.name,
    status: tokenRecord.status,
  };
};
