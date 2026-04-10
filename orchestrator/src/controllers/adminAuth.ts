import type { RequestHandler } from "express";

import { bumpRefreshTokenVersion, completeInitialSetup, getAppAuthState } from "../db/appAuthState.js";
import { revokeAdminSessionById } from "../db/adminSessions.js";
import { authenticateAdminSessionHeader } from "../helpers/adminSessionAuth.js";
import { issueAdminSession } from "../helpers/adminSessionTokens.js";
import { createPasswordHash, verifyPassword } from "../helpers/token.js";
import { HttpError } from "../utils/errors.js";
import { handleResponse } from "../utils/response.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getPassword = (value: unknown): string => {
  if (typeof value !== "string" || value.trim().length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters long.");
  }

  return value.trim();
};

export const getSetupStatus: RequestHandler = async (_request, response): Promise<void> => {
  const state = await getAppAuthState();

  handleResponse(response, 200, "Ok", {
    setup_required: !state.setup_completed_at,
    setup_completed_at: state.setup_completed_at,
  });
};

export const setupAdminPassword: RequestHandler = async (request, response): Promise<void> => {
  const state = await getAppAuthState();
  if (state.setup_completed_at) {
    throw new HttpError(409, "Initial setup has already been completed.");
  }

  const body = isRecord(request.body) ? request.body : {};
  const password = getPassword(body.password);
  const passwordConfirmation = getPassword(body.password_confirmation ?? body.password);

  if (password !== passwordConfirmation) {
    throw new HttpError(400, "Password confirmation does not match.");
  }

  const passwordHash = createPasswordHash(password);
  await completeInitialSetup(passwordHash);
  const session = await issueAdminSession({
    created_by: "initial_setup",
  });

  handleResponse(response, 201, "Initial admin password created", {
    setup_required: false,
    session: session.session,
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });
};

export const loginAdmin: RequestHandler = async (request, response): Promise<void> => {
  const state = await getAppAuthState();
  if (!state.setup_completed_at || !state.password_hash || !state.password_salt) {
    throw new HttpError(503, "Initial setup is required.", {
      setup_required: true,
    });
  }

  const body = isRecord(request.body) ? request.body : {};
  const password = getPassword(body.password);

  if (!verifyPassword(password, state.password_salt, state.password_hash)) {
    throw new HttpError(401, "Unauthorised: Invalid password");
  }

  const session = await issueAdminSession({
    created_by: "login",
  });

  handleResponse(response, 200, "Admin login successful", {
    session: session.session,
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });
};

export const refreshAdminSession: RequestHandler = async (request, response): Promise<void> => {
  const body = isRecord(request.body) ? request.body : {};
  const token =
    typeof body.refresh_token === "string" && body.refresh_token.trim() !== ""
      ? body.refresh_token.trim()
      : null;

  if (!token) {
    throw new HttpError(400, "Missing required field 'refresh_token'.");
  }

  const session = await authenticateAdminSessionHeader(`Bearer ${token}`, "refresh");
  await revokeAdminSessionById(session.id, "rotated");
  const replacement = await issueAdminSession({
    created_by: "refresh",
  });

  handleResponse(response, 200, "Admin session refreshed", {
    session: replacement.session,
    access_token: replacement.accessToken,
    refresh_token: replacement.refreshToken,
  });
};

export const logoutAdmin: RequestHandler = async (_request, response): Promise<void> => {
  const session = response.locals.adminSession as { id: string } | undefined;
  if (!session) {
    throw new HttpError(401, "Unauthorised: Missing admin session");
  }

  await revokeAdminSessionById(session.id, "logout");

  handleResponse(response, 200, "Admin session revoked", null);
};

export const revokeAllAdminSessions: RequestHandler = async (_request, response): Promise<void> => {
  const state = await bumpRefreshTokenVersion();

  handleResponse(response, 200, "All admin sessions invalidated", {
    refresh_token_version: state.refresh_token_version,
  });
};
