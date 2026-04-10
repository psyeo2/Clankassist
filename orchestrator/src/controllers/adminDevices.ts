import type { RequestHandler } from "express";

import { createDevice, getDeviceById, getDevices, getDeviceRecordById } from "../db/devices.js";
import { createDeviceToken } from "../db/deviceTokens.js";
import { generateOpaqueToken } from "../helpers/token.js";
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

export const listDevices: RequestHandler = async (_request, response): Promise<void> => {
  const devices = await getDevices();
  handleResponse(response, 200, "Ok", { devices });
};

export const createManagedDevice: RequestHandler = async (request, response): Promise<void> => {
  const body = isRecord(request.body) ? request.body : {};
  const name = typeof body.name === "string" && body.name.trim() !== "" ? body.name.trim() : null;
  const deviceKey =
    typeof body.device_key === "string" && body.device_key.trim() !== ""
      ? body.device_key.trim()
      : null;

  if (!name) {
    throw new HttpError(400, "Missing required field 'name'.");
  }

  if (!deviceKey) {
    throw new HttpError(400, "Missing required field 'device_key'.");
  }

  const status =
    body.status === "pending" ||
    body.status === "approved" ||
    body.status === "rejected" ||
    body.status === "revoked"
      ? body.status
      : "approved";

  const device = await createDevice({
    name,
    device_key: deviceKey,
    status,
    capabilities: Array.isArray(body.capabilities) ? body.capabilities : [],
    metadata: isRecord(body.metadata) ? body.metadata : {},
  });

  handleResponse(response, 201, "Device created", device);
};

export const getManagedDevice: RequestHandler = async (request, response): Promise<void> => {
  const deviceId = getParam(request.params.id, "id");
  const device = await getDeviceById(deviceId);
  if (!device) {
    throw new HttpError(404, "Device not found.");
  }

  handleResponse(response, 200, "Ok", device);
};

export const issueManagedDeviceToken: RequestHandler = async (
  request,
  response,
): Promise<void> => {
  const deviceId = getParam(request.params.id, "id");
  const body = isRecord(request.body) ? request.body : {};
  const device = await getDeviceRecordById(deviceId);
  if (!device) {
    throw new HttpError(404, "Device not found.");
  }

  if (device.status !== "approved") {
    throw new HttpError(409, "Device must be approved before issuing tokens.");
  }

  const name =
    typeof body.name === "string" && body.name.trim() !== ""
      ? body.name.trim()
      : `${device.name} token`;
  const adminSession = response.locals.adminSession as { id: string } | undefined;
  const token = generateOpaqueToken("dev_tok_");

  const created = await createDeviceToken({
    device_id: deviceId,
    prefix: token.prefix,
    key_hash: token.keyHash,
    salt: token.salt,
    name,
    created_by: adminSession?.id ?? "admin_session",
    expires_at:
      typeof body.expires_at === "string" && body.expires_at.trim() !== ""
        ? body.expires_at.trim()
        : null,
    metadata: isRecord(body.metadata) ? body.metadata : {},
  });

  handleResponse(response, 201, "Device token created", {
    token: created,
    bearer_token: token.userToken,
  });
};
