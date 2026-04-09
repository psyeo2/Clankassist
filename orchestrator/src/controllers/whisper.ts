import type { RequestHandler } from "express";

import { transcribeAudio } from "../services/whisperApi.js";
import { handleResponse } from "../utils/response.js";

const getFilename = (request: Parameters<RequestHandler>[0]): string => {
  const fromHeader = request.header("x-file-name");
  if (typeof fromHeader === "string" && fromHeader.trim() !== "") {
    return fromHeader.trim();
  }

  if (typeof request.query.filename === "string" && request.query.filename.trim() !== "") {
    return request.query.filename.trim();
  }

  return "audio.wav";
};

export const transcribe: RequestHandler = async (request, response): Promise<void> => {
  if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
    handleResponse(
      response,
      400,
      "Invalid input: send raw audio bytes with Content-Type audio/* or application/octet-stream.",
      null,
    );
    return;
  }

  const mimeType = request.header("content-type") ?? "application/octet-stream";
  const transcription = await transcribeAudio({
    audioBuffer: request.body,
    contentType: mimeType,
    filename: getFilename(request),
  });

  handleResponse(response, 200, "Ok", transcription);
};
