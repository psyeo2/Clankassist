import { HttpError } from "../utils/errors.js";
import { fetchUpstream, getRequiredBaseUrl, joinUrl, readResponsePreview } from "./http.js";

type WhisperTranscriptionInput = {
  audioBuffer: Buffer;
  contentType: string;
  filename: string;
};

type WhisperTranscriptionResult = {
  text: string;
  language?: string;
  duration?: number;
};

const getWhisperBaseUrl = (): string =>
  getRequiredBaseUrl(process.env.WHISPER_URL, "WHISPER");

export const transcribeAudio = async (
  input: WhisperTranscriptionInput,
): Promise<WhisperTranscriptionResult> => {
  const formData = new FormData();
  const audioBlob = new Blob([new Uint8Array(input.audioBuffer)], {
    type: input.contentType,
  });
  formData.append("file", audioBlob, input.filename);

  const url = joinUrl(getWhisperBaseUrl(), "/transcribe");
  const response = await fetchUpstream(
    "whisper-api",
    url,
    {
      method: "POST",
      body: formData,
    },
    {
      contentType: input.contentType,
      filename: input.filename,
      requestBytes: input.audioBuffer.length,
    },
  );

  if (!response.ok) {
    throw new HttpError(502, "Whisper transcription request failed.", {
      service: "whisper-api",
      upstreamStatus: response.status,
      upstreamBody: await readResponsePreview(response),
    });
  }

  return response.json() as Promise<WhisperTranscriptionResult>;
};
