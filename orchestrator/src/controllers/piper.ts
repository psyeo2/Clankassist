import type { RequestHandler } from "express";

import { fetchPiperVoices, synthesiseSpeech } from "../services/piperApi.js";
import { handleBinaryResponse, handleResponse } from "../utils/response.js";

type PiperSynthesisBody = {
  text?: unknown;
  voice?: unknown;
  speaker?: unknown;
  speaker_id?: unknown;
  length_scale?: unknown;
  noise_scale?: unknown;
  noise_w_scale?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const listVoices: RequestHandler = async (_request, response): Promise<void> => {
  const voices = await fetchPiperVoices();

  handleResponse(response, 200, "Ok", {
    voices,
  });
};

export const synthesise: RequestHandler = async (request, response): Promise<void> => {
  const body = isRecord(request.body) ? (request.body as PiperSynthesisBody) : {};

  if (typeof body.text !== "string" || body.text.trim() === "") {
    handleResponse(response, 400, "Invalid input: provide a non-empty 'text' string.", null);
    return;
  }

  const result = await synthesiseSpeech({
    text: body.text,
    voice: typeof body.voice === "string" ? body.voice : undefined,
    speaker: typeof body.speaker === "string" ? body.speaker : undefined,
    speaker_id: typeof body.speaker_id === "number" ? body.speaker_id : undefined,
    length_scale: typeof body.length_scale === "number" ? body.length_scale : undefined,
    noise_scale: typeof body.noise_scale === "number" ? body.noise_scale : undefined,
    noise_w_scale: typeof body.noise_w_scale === "number" ? body.noise_w_scale : undefined,
  });

  handleBinaryResponse(response, 200, result.audioBuffer, {
    contentType: result.contentType,
    message: "Piper synthesis completed",
  });
};
