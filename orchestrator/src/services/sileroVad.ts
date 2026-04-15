import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { InferenceSession, Tensor } from "onnxruntime-node";

import { logEvent } from "../utils/logger.js";

export type SileroVadCaptureState = "idle" | "speaking" | "waiting_for_silence" | "ended";

export type SileroVadState = {
  strategy: "silero_vad_16k_op15";
  captureState: SileroVadCaptureState;
  threshold: number;
  negativeThreshold: number;
  minSilenceSamples: number;
  speechPadSamples: number;
  windowSizeSamples: number;
  contextSizeSamples: number;
  currentSample: number;
  tempEndSample: number;
  triggered: boolean;
  lastSpeechProbability: number | null;
  lastSpeechStartSample: number | null;
  lastSpeechEndSample: number | null;
  pendingPcm: Buffer;
  modelState: Float32Array;
  context: Float32Array;
};

export type SileroVadChunkEvent =
  | {
      type: "speech_start";
      atSample: number;
      speechProbability: number;
    }
  | {
      type: "speech_end";
      atSample: number;
      speechProbability: number;
    };

export type SileroVadProcessingResult = {
  chunkEvents: SileroVadChunkEvent[];
  lastSpeechProbability: number | null;
  captureState: SileroVadCaptureState;
};

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);

const DEFAULT_MODEL_PATH = resolve(
  currentDirectory,
  "..",
  "..",
  "models",
  "silero",
  "silero_vad_16k_op15.onnx",
);

const SAMPLE_RATE = 16000;
const WINDOW_SIZE_SAMPLES = 512;
const CONTEXT_SIZE_SAMPLES = 64;
const PCM_BYTES_PER_SAMPLE = 2;
const CHUNK_BYTES = WINDOW_SIZE_SAMPLES * PCM_BYTES_PER_SAMPLE;
const MIN_SILENCE_DURATION_MS = 100;
const SPEECH_PAD_MS = 30;

const MODEL_INPUT_NAME = "input";
const MODEL_STATE_NAME = "state";
const MODEL_SR_NAME = "sr";
const MODEL_OUTPUT_NAME = "output";
const MODEL_STATE_OUTPUT_NAME = "stateN";

let sessionPromise: Promise<InferenceSession> | null = null;
let loggedModelPath = false;

const resolveModelPath = (): string => {
  const configuredPath = process.env.SILERO_VAD_MODEL_PATH?.trim();
  return configuredPath ? resolve(process.cwd(), configuredPath) : DEFAULT_MODEL_PATH;
};

const getSession = async (): Promise<InferenceSession> => {
  if (!sessionPromise) {
    const modelPath = resolveModelPath();

    if (!loggedModelPath) {
      loggedModelPath = true;
      logEvent("silero_vad_model_loading", {
        modelPath,
      });
    }

    sessionPromise = InferenceSession.create(modelPath, {
      executionProviders: ["cpu"],
      interOpNumThreads: 1,
      intraOpNumThreads: 1,
      graphOptimizationLevel: "all",
    });
  }

  return sessionPromise;
};

const pcm16ToFloat32 = (buffer: Buffer): Float32Array => {
  const int16 = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
  const float32 = new Float32Array(int16.length);

  for (let i = 0; i < int16.length; i += 1) {
    float32[i] = int16[i] / 32768;
  }

  return float32;
};

const runChunk = async (
  state: SileroVadState,
  chunk: Buffer,
): Promise<number> => {
  const session = await getSession();
  const chunkFloat32 = pcm16ToFloat32(chunk);
  const input = new Float32Array(state.contextSizeSamples + state.windowSizeSamples);
  input.set(state.context, 0);
  input.set(chunkFloat32, state.contextSizeSamples);

  const feeds = {
    [MODEL_INPUT_NAME]: new Tensor("float32", input, [1, input.length]),
    [MODEL_STATE_NAME]: new Tensor("float32", state.modelState, [2, 1, 128]),
    [MODEL_SR_NAME]: new Tensor("int64", new BigInt64Array([BigInt(SAMPLE_RATE)]), [1]),
  };

  const results = await session.run(feeds);
  const output = results[MODEL_OUTPUT_NAME];
  const nextState = results[MODEL_STATE_OUTPUT_NAME];
  const outputData = output.data as Float32Array;
  const nextStateData = nextState.data as Float32Array;

  const speechProbability = outputData[0];
  state.modelState.set(nextStateData);
  state.context.set(input.subarray(input.length - state.contextSizeSamples));

  return speechProbability;
};

const updateCaptureState = (
  state: SileroVadState,
  speechProbability: number,
): SileroVadChunkEvent | null => {
  state.currentSample += state.windowSizeSamples;
  state.lastSpeechProbability = speechProbability;

  if (speechProbability >= state.threshold && state.tempEndSample !== 0) {
    state.tempEndSample = 0;
  }

  if (speechProbability >= state.threshold && !state.triggered) {
    state.triggered = true;
    state.captureState = "speaking";
    const speechStart = Math.max(
      0,
      state.currentSample - state.speechPadSamples - state.windowSizeSamples,
    );
    state.lastSpeechStartSample = speechStart;

    return {
      type: "speech_start",
      atSample: speechStart,
      speechProbability,
    };
  }

  if (speechProbability < state.negativeThreshold && state.triggered) {
    if (state.tempEndSample === 0) {
      state.tempEndSample = state.currentSample;
      state.captureState = "waiting_for_silence";
    }

    if (state.currentSample - state.tempEndSample >= state.minSilenceSamples) {
      const speechEnd =
        state.tempEndSample + state.speechPadSamples - state.windowSizeSamples;

      state.tempEndSample = 0;
      state.triggered = false;
      state.captureState = "ended";
      state.lastSpeechEndSample = speechEnd;

      return {
        type: "speech_end",
        atSample: speechEnd,
        speechProbability,
      };
    }
  }

  if (state.triggered) {
    state.captureState = "speaking";
  } else if (state.captureState !== "ended") {
    state.captureState = "idle";
  }

  return null;
};

export const createSileroVadState = (): SileroVadState => ({
  strategy: "silero_vad_16k_op15",
  captureState: "idle",
  threshold: 0.5,
  negativeThreshold: 0.35,
  minSilenceSamples: (SAMPLE_RATE * MIN_SILENCE_DURATION_MS) / 1000,
  speechPadSamples: (SAMPLE_RATE * SPEECH_PAD_MS) / 1000,
  windowSizeSamples: WINDOW_SIZE_SAMPLES,
  contextSizeSamples: CONTEXT_SIZE_SAMPLES,
  currentSample: 0,
  tempEndSample: 0,
  triggered: false,
  lastSpeechProbability: null,
  lastSpeechStartSample: null,
  lastSpeechEndSample: null,
  pendingPcm: Buffer.alloc(0),
  modelState: new Float32Array(2 * 1 * 128),
  context: new Float32Array(CONTEXT_SIZE_SAMPLES),
});

export const appendVadAudio = async (
  state: SileroVadState,
  audioBuffer: Buffer,
): Promise<SileroVadProcessingResult> => {
  state.pendingPcm =
    state.pendingPcm.length === 0
      ? Buffer.from(audioBuffer)
      : Buffer.concat([state.pendingPcm, audioBuffer]);

  const chunkEvents: SileroVadChunkEvent[] = [];

  while (state.pendingPcm.length >= CHUNK_BYTES) {
    const chunk = state.pendingPcm.subarray(0, CHUNK_BYTES);
    state.pendingPcm = state.pendingPcm.subarray(CHUNK_BYTES);

    const speechProbability = await runChunk(state, chunk);
    const event = updateCaptureState(state, speechProbability);
    if (event) {
      chunkEvents.push(event);
    }
  }

  return {
    chunkEvents,
    lastSpeechProbability: state.lastSpeechProbability,
    captureState: state.captureState,
  };
};

export const estimateSileroChunkDurationMs = (): number =>
  Math.round((WINDOW_SIZE_SAMPLES / SAMPLE_RATE) * 1000);
