import crypto from "node:crypto";
import type http from "node:http";
import type { Duplex } from "node:stream";

import { authenticateBearerHeader } from "../helpers/bearerAuth.js";

const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const writeTextFrame = (socket: Duplex, text: string): void => {
  const payload = Buffer.from(text, "utf8");

  if (payload.length >= 126) {
    throw new Error("Stub websocket payload is too large.");
  }

  const frame = Buffer.alloc(2 + payload.length);
  frame[0] = 0x81;
  frame[1] = payload.length;
  payload.copy(frame, 2);
  socket.write(frame);
};

const writeCloseFrame = (socket: Duplex): void => {
  socket.write(Buffer.from([0x88, 0x00]));
};

const rejectUpgrade = (socket: Duplex, status: number, message: string): void => {
  socket.write(
    [
      `HTTP/1.1 ${status} ${message}`,
      "Connection: close",
      "Content-Type: text/plain; charset=utf-8",
      `Content-Length: ${Buffer.byteLength(message)}`,
      "",
      message,
    ].join("\r\n"),
  );
  socket.destroy();
};

export const handleListenUpgrade = async (
  request: http.IncomingMessage,
  socket: Duplex,
  expectedPath: string,
): Promise<boolean> => {
  const requestUrl = request.url ? new URL(request.url, "http://localhost") : null;
  if (!requestUrl || requestUrl.pathname !== expectedPath) {
    return false;
  }

  try {
    await authenticateBearerHeader(
      typeof request.headers.authorization === "string"
        ? request.headers.authorization
        : undefined,
    );
  } catch {
    rejectUpgrade(socket, 401, "Unauthorised");
    return true;
  }

  const key =
    typeof request.headers["sec-websocket-key"] === "string"
      ? request.headers["sec-websocket-key"]
      : null;

  if (!key) {
    rejectUpgrade(socket, 400, "Missing Sec-WebSocket-Key");
    return true;
  }

  const accept = crypto
    .createHash("sha1")
    .update(key + WEBSOCKET_GUID)
    .digest("base64");

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "",
      "",
    ].join("\r\n"),
  );

  writeTextFrame(
    socket,
    JSON.stringify({
      event: "listen_ready",
      mode: "stub",
      wake_word_detection: "pending",
      vad: "pending",
      message: "Streaming listen pipeline is not implemented yet.",
    }),
  );
  writeCloseFrame(socket);
  socket.end();
  return true;
};
