import { getAppAuthState } from "../db/appAuthState.js";
import { getAdminSessionByAccessPrefix, getAdminSessionByRefreshPrefix, markAdminSessionUsed } from "../db/adminSessions.js";
import { verifyOpaqueToken } from "./token.js";
import { HttpError } from "../utils/errors.js";

type TokenKind = "access" | "refresh";

const parseBearerToken = (authHeader: string | undefined): { prefix: string; key: string } => {
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

  return { prefix, key };
};

export const authenticateAdminSessionHeader = async (
  authHeader: string | undefined,
  kind: TokenKind = "access",
): Promise<{ id: string; status: string }> => {
  const state = await getAppAuthState();
  if (!state.setup_completed_at) {
    throw new HttpError(503, "Initial setup is required.");
  }

  const { prefix, key } = parseBearerToken(authHeader);
  const session =
    kind === "access"
      ? await getAdminSessionByAccessPrefix(prefix)
      : await getAdminSessionByRefreshPrefix(prefix);

  if (!session) {
    throw new HttpError(401, "Unauthorised: Session not found");
  }

  if (session.status !== "active") {
    throw new HttpError(401, `Unauthorised: Session is ${session.status}`);
  }

  if (session.refresh_version !== state.refresh_token_version) {
    throw new HttpError(401, "Unauthorised: Session is no longer current");
  }

  const expiresAt =
    kind === "access" ? session.access_expires_at : session.refresh_expires_at;
  if (new Date(expiresAt).getTime() <= Date.now()) {
    throw new HttpError(401, "Unauthorised: Session is expired");
  }

  const salt = kind === "access" ? session.access_salt : session.refresh_salt;
  const hash = kind === "access" ? session.access_key_hash : session.refresh_key_hash;
  if (!verifyOpaqueToken(key, salt, hash)) {
    throw new HttpError(401, "Unauthorised: Session could not be verified");
  }

  await markAdminSessionUsed(session.id);

  return {
    id: session.id,
    status: session.status,
  };
};
