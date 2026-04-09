import type { RequestHandler } from "express";

import {
  createBearerToken,
  deleteBearerTokenById,
  getBearerTokenById,
  getBearerTokens,
  revokeBearerToken,
  updateBearerTokenById,
} from "../db/bearerTokens.js";
import { generateBearerToken } from "../helpers/token.js";
import { HttpError } from "../utils/errors.js";
import { handleResponse } from "../utils/response.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getParam = (value: string | string[] | undefined, name: string): string => {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }

  throw new HttpError(400, `Missing route parameter '${name}'.`);
};

export const getAllTokens: RequestHandler = async (_request, response): Promise<void> => {
  const tokens = await getBearerTokens();
  handleResponse(response, 200, "Ok", { tokens });
};

export const getToken: RequestHandler = async (request, response): Promise<void> => {
  const tokenId = getParam(request.params.id, "id");
  const token = await getBearerTokenById(tokenId);
  if (!token) {
    throw new HttpError(404, "Bearer token not found.");
  }

  handleResponse(response, 200, "Ok", token);
};

export const createToken: RequestHandler = async (request, response): Promise<void> => {
  const body = isRecord(request.body) ? request.body : {};
  const name = typeof body.name === "string" && body.name.trim() !== "" ? body.name.trim() : null;
  const createdBy =
    typeof body.created_by === "string" && body.created_by.trim() !== ""
      ? body.created_by.trim()
      : "admin";

  if (!name) {
    throw new HttpError(400, "Missing required field 'name'.");
  }

  const token = generateBearerToken();
  const expiresAt =
    typeof body.expires_at === "string" && body.expires_at.trim() !== ""
      ? body.expires_at
      : null;
  const metadata = isRecord(body.metadata) ? body.metadata : {};

  const created = await createBearerToken({
    prefix: token.fullPrefix,
    key_hash: token.keyHash,
    salt: token.salt,
    name,
    created_by: createdBy,
    expires_at: expiresAt,
    metadata,
  });

  handleResponse(response, 201, "Bearer token created", {
    token: created,
    bearer_token: token.userToken,
  });
};

export const updateToken: RequestHandler = async (request, response): Promise<void> => {
  const body = isRecord(request.body) ? request.body : {};
  const tokenId = getParam(request.params.id, "id");

  const updated = await updateBearerTokenById(tokenId, {
    name: typeof body.name === "string" ? body.name : undefined,
    expires_at:
      typeof body.expires_at === "string" || body.expires_at === null
        ? (body.expires_at as string | null)
        : undefined,
    metadata: isRecord(body.metadata) ? body.metadata : undefined,
    status:
      body.status === "active" || body.status === "revoked" || body.status === "expired"
        ? body.status
        : undefined,
  });

  if (!updated) {
    throw new HttpError(404, "Bearer token not found.");
  }

  handleResponse(response, 200, "Bearer token updated", updated);
};

export const deleteToken: RequestHandler = async (request, response): Promise<void> => {
  const tokenId = getParam(request.params.id, "id");
  const deleted = await deleteBearerTokenById(tokenId);
  if (!deleted) {
    throw new HttpError(404, "Bearer token not found.");
  }

  handleResponse(response, 200, "Bearer token deleted", deleted);
};

export const revokeToken: RequestHandler = async (request, response): Promise<void> => {
  const body = isRecord(request.body) ? request.body : {};
  const reason = typeof body.reason === "string" ? body.reason : undefined;
  const tokenId = getParam(request.params.id, "id");

  const revoked = await revokeBearerToken(tokenId, reason);
  if (!revoked) {
    throw new HttpError(404, "Bearer token not found.");
  }

  handleResponse(response, 200, "Bearer token revoked", revoked);
};
