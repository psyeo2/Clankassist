import { HttpError } from "../utils/errors.js";
import { fetchUpstream, getRequiredBaseUrl, joinUrl, readResponsePreview } from "./http.js";

type PiperSynthesisInput = {
  text: string;
  voice?: string;
  speaker?: string;
  speaker_id?: number;
  length_scale?: number;
  noise_scale?: number;
  noise_w_scale?: number;
};

const getPiperBaseUrl = (): string =>
  getRequiredBaseUrl(process.env.PIPER_URL, "PIPER");

export const fetchPiperVoices = async (): Promise<unknown> => {
  const response = await fetchUpstream(
    "piper-api",
    joinUrl(getPiperBaseUrl(), "/voices"),
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    throw new HttpError(502, "Piper voices request failed.", {
      service: "piper-api",
      upstreamStatus: response.status,
      upstreamBody: await readResponsePreview(response),
    });
  }

  return response.json();
};

export const synthesiseSpeech = async (
  payload: PiperSynthesisInput,
): Promise<{ audioBuffer: Buffer; contentType: string }> => {
  const response = await fetchUpstream(
    "piper-api",
    joinUrl(getPiperBaseUrl(), "/"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    {
      textLength: payload.text.length,
      voice: payload.voice,
      speaker: payload.speaker,
    },
  );

  if (!response.ok) {
    throw new HttpError(502, "Piper synthesis request failed.", {
      service: "piper-api",
      upstreamStatus: response.status,
      upstreamBody: await readResponsePreview(response),
    });
  }

  const arrayBuffer = await response.arrayBuffer();

  return {
    audioBuffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type") ?? "audio/wav",
  };
};
