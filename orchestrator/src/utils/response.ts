import type { Response } from "express";

export type JsonResponsePayload<T = unknown> = {
  status: number;
  message: string;
  data: T | null;
};

type ResponseMeta = {
  bytes: number;
  kind: "json" | "binary";
  message: string;
  payload?: Record<string, unknown>;
};

const setResponseMeta = (response: Response, meta: ResponseMeta): void => {
  response.locals.responseMeta = meta;
};

export const handleResponse = <T = unknown>(
  response: Response,
  status: number,
  message: string,
  data: T | null = null,
): void => {
  const payload: JsonResponsePayload<T> = {
    status,
    message,
    data,
  };

  const serialisedPayload = JSON.stringify(payload);

  setResponseMeta(response, {
    bytes: Buffer.byteLength(serialisedPayload),
    kind: "json",
    message,
    payload: payload as Record<string, unknown>,
  });

  response.status(status).json(payload);
};

export const handleBinaryResponse = (
  response: Response,
  status: number,
  body: Buffer,
  options: {
    contentType: string;
    message?: string;
  },
): void => {
  const message = options.message ?? "Binary response";

  setResponseMeta(response, {
    bytes: body.length,
    kind: "binary",
    message,
  });

  response.setHeader("Content-Type", options.contentType);
  response.status(status).send(body);
};
