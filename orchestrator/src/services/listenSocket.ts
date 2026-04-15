import { randomUUID } from "node:crypto";
import type http from "node:http";
import type { Duplex } from "node:stream";

import WebSocket, { WebSocketServer, type RawData } from "ws";

import { getAppAuthState } from "../db/appAuthState.js";
import { authenticateDeviceHeader } from "../helpers/deviceAuth.js";
import { synthesiseSpeech } from "../services/piperApi.js";
import { executeBufferedAudioSpeech } from "../services/respondPipeline.js";
import {
  appendVadAudio,
  createSileroVadState,
  estimateSileroChunkDurationMs,
  type SileroVadState,
} from "../services/sileroVad.js";
import { logEvent } from "../utils/logger.js";

type DeviceAuth = Awaited<ReturnType<typeof authenticateDeviceHeader>>;

type ListenAudioFormat = {
  encoding: "pcm_s16le";
  sampleRateHz: 16000;
  channels: 1;
};

type TurnCaptureState = "capturing" | "server_stop_requested" | "capture_ended";

type TurnVadState = {
  strategy: SileroVadState["strategy"];
  state: TurnCaptureState;
  stopReason: string | null;
  stopRequestedAt: number | null;
  captureState: SileroVadState["captureState"];
  lastSpeechProbability: number | null;
  lastSpeechStartSample: number | null;
  lastSpeechEndSample: number | null;
  runtime: SileroVadState;
};

type AssembledUtterance = {
  pcmBuffer: Buffer;
  wavBuffer: Buffer;
  contentType: "audio/wav";
  filename: string;
  durationMs: number;
};

type ActiveTurn = {
  turnId: string;
  startedAt: number;
  output: "json" | "text" | "audio";
  preRollMs: number;
  audioFormat: ListenAudioFormat;
  audioChunks: Buffer[];
  audioBytesReceived: number;
  audioFrameCount: number;
  lastAudioFrameAt: number | null;
  maxAudioBytes: number;
  maxFrameBytes: number;
  captureEndedAt: number | null;
  captureEndReason: string | null;
  vad: TurnVadState;
};

type ListenSession = {
  connectionId: string;
  device: DeviceAuth;
  hello: Record<string, unknown> | null;
  activeTurn: ActiveTurn | null;
  processingTurnId: string | null;
  messageQueue: Promise<void>;
};

const listenServer = new WebSocketServer({ noServer: true });

const DEFAULT_AUDIO_FORMAT: ListenAudioFormat = {
  encoding: "pcm_s16le",
  sampleRateHz: 16000,
  channels: 1,
};

const PCM_BYTES_PER_SAMPLE = 2;
const MAX_CAPTURE_MS = 15000;
const MAX_TURN_AUDIO_BYTES =
  (DEFAULT_AUDIO_FORMAT.sampleRateHz *
    DEFAULT_AUDIO_FORMAT.channels *
    PCM_BYTES_PER_SAMPLE *
    MAX_CAPTURE_MS) /
  1000;
const MAX_AUDIO_FRAME_BYTES = 32 * 1024;

const READY_MESSAGE =
  "WebSocket session ready. Streaming audio capture and server-side Silero VAD are active, but transcription and response generation are still stubbed.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getByteLength = (payload: RawData): number => {
  if (typeof payload === "string") {
    return Buffer.byteLength(payload);
  }

  if (payload instanceof ArrayBuffer) {
    return payload.byteLength;
  }

  if (Array.isArray(payload)) {
    return payload.reduce((total, part) => total + part.length, 0);
  }

  return payload.length;
};

const toBuffer = (payload: RawData): Buffer => {
  if (typeof payload === "string") {
    return Buffer.from(payload, "utf8");
  }

  if (payload instanceof ArrayBuffer) {
    return Buffer.from(payload);
  }

  if (Array.isArray(payload)) {
    return Buffer.concat(payload);
  }

  return payload;
};

const estimateDurationMs = (byteLength: number, audioFormat: ListenAudioFormat): number => {
  const bytesPerSecond =
    audioFormat.sampleRateHz * audioFormat.channels * PCM_BYTES_PER_SAMPLE;

  return Math.round((byteLength / bytesPerSecond) * 1000);
};

const createTurnFilename = (turnId: string): string => `${turnId}.wav`;

const createWavBuffer = (pcmBuffer: Buffer, audioFormat: ListenAudioFormat): Buffer => {
  const header = Buffer.alloc(44);
  const byteRate =
    audioFormat.sampleRateHz * audioFormat.channels * PCM_BYTES_PER_SAMPLE;
  const blockAlign = audioFormat.channels * PCM_BYTES_PER_SAMPLE;

  header.write("RIFF", 0, 4, "ascii");
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write("WAVE", 8, 4, "ascii");
  header.write("fmt ", 12, 4, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(audioFormat.channels, 22);
  header.writeUInt32LE(audioFormat.sampleRateHz, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(PCM_BYTES_PER_SAMPLE * 8, 34);
  header.write("data", 36, 4, "ascii");
  header.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([header, pcmBuffer]);
};

const assembleUtterance = (turn: ActiveTurn): AssembledUtterance => {
  const pcmBuffer = Buffer.concat(turn.audioChunks);
  const wavBuffer = createWavBuffer(pcmBuffer, turn.audioFormat);

  return {
    pcmBuffer,
    wavBuffer,
    contentType: "audio/wav",
    filename: createTurnFilename(turn.turnId),
    durationMs: estimateDurationMs(pcmBuffer.length, turn.audioFormat),
  };
};

const cleanupTurnBuffers = (turn: ActiveTurn): void => {
  turn.audioChunks.length = 0;
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

const sendJson = (socket: WebSocket, payload: Record<string, unknown>): void => {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(payload));
};

const getActiveTurnId = (session: ListenSession): string | undefined =>
  session.activeTurn?.turnId ?? session.processingTurnId ?? undefined;

const sendTurnComplete = (
  socket: WebSocket,
  turnId: string,
  payload: Record<string, unknown>,
): void => {
  sendJson(socket, {
    event: "turn_complete",
    turn_id: turnId,
    ...payload,
  });
};

const sendProtocolError = (
  socket: WebSocket,
  session: ListenSession,
  options: {
    code: string;
    message: string;
    turnId?: string;
    recoverable?: boolean;
    details?: Record<string, unknown>;
  },
): void => {
  logEvent("listen_protocol_error", {
    connectionId: session.connectionId,
    deviceId: session.device.deviceId,
    turnId: options.turnId ?? getActiveTurnId(session),
    code: options.code,
    error: options.message,
    details: options.details,
  });

  sendJson(socket, {
    event: "error",
    code: options.code,
    message: options.message,
    turn_id: options.turnId ?? getActiveTurnId(session),
    recoverable: options.recoverable ?? true,
    details: options.details ?? null,
  });
};

const logProtocolViolation = (
  session: ListenSession,
  message: string,
  details: Record<string, unknown> = {},
): void => {
  logEvent("listen_protocol_violation", {
    connectionId: session.connectionId,
    deviceId: session.device.deviceId,
    turnId: session.activeTurn?.turnId,
    message,
    ...details,
  });
};

const getVadPayload = (turn: ActiveTurn): Record<string, unknown> => ({
  strategy: turn.vad.strategy,
  state: turn.vad.state,
  capture_state: turn.vad.captureState,
  stop_reason: turn.vad.stopReason,
  last_speech_probability: turn.vad.lastSpeechProbability,
  last_speech_start_sample: turn.vad.lastSpeechStartSample,
  last_speech_end_sample: turn.vad.lastSpeechEndSample,
  chunk_duration_ms: estimateSileroChunkDurationMs(),
});

const syncVadRuntimeState = (turn: ActiveTurn): void => {
  turn.vad.strategy = turn.vad.runtime.strategy;
  turn.vad.captureState = turn.vad.runtime.captureState;
  turn.vad.lastSpeechProbability = turn.vad.runtime.lastSpeechProbability;
  turn.vad.lastSpeechStartSample = turn.vad.runtime.lastSpeechStartSample;
  turn.vad.lastSpeechEndSample = turn.vad.runtime.lastSpeechEndSample;
};

const parseJsonMessage = (payload: RawData): Record<string, unknown> | null => {
  const text =
    typeof payload === "string"
      ? payload
      : payload instanceof ArrayBuffer
        ? Buffer.from(payload).toString("utf8")
        : Array.isArray(payload)
          ? Buffer.concat(payload).toString("utf8")
          : payload.toString("utf8");

  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const parseOutputMode = (value: unknown): "json" | "text" | "audio" => {
  if (typeof value !== "string" || value.trim() === "") {
    return "audio";
  }

  const parsed = value.trim().toLowerCase();
  if (parsed === "json" || parsed === "text" || parsed === "audio") {
    return parsed;
  }

  throw new Error("Unsupported output mode. Expected 'json', 'text', or 'audio'.");
};

const parsePreRollMs = (value: unknown): number => {
  if (value === undefined) {
    return 0;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("Invalid pre_roll_ms. Expected a non-negative number.");
  }

  return value;
};

const parseAudioFormat = (value: unknown): ListenAudioFormat => {
  if (value === undefined) {
    return DEFAULT_AUDIO_FORMAT;
  }

  if (!isRecord(value)) {
    throw new Error("Invalid audio format payload.");
  }

  const encoding = value.encoding;
  const sampleRate =
    typeof value.sample_rate_hz === "number"
      ? value.sample_rate_hz
      : typeof value.sampleRateHz === "number"
        ? value.sampleRateHz
        : undefined;
  const channels = value.channels;

  if (
    encoding !== DEFAULT_AUDIO_FORMAT.encoding ||
    sampleRate !== DEFAULT_AUDIO_FORMAT.sampleRateHz ||
    channels !== DEFAULT_AUDIO_FORMAT.channels
  ) {
    throw new Error("Unsupported audio format. Expected pcm_s16le mono at 16000Hz.");
  }

  return DEFAULT_AUDIO_FORMAT;
};

const handleHello = (
  socket: WebSocket,
  session: ListenSession,
  payload: Record<string, unknown>,
): void => {
  session.hello = payload;

  logEvent("listen_hello_received", {
    connectionId: session.connectionId,
    deviceId: session.device.deviceId,
    firmwareVersion:
      typeof payload.firmware_version === "string" ? payload.firmware_version : undefined,
  });

  sendJson(socket, {
    event: "hello_ack",
    connection_id: session.connectionId,
    device_id: session.device.deviceId,
  });
};

const requestStopCapture = (
  socket: WebSocket,
  session: ListenSession,
  turn: ActiveTurn,
  reason: string,
): void => {
  if (turn.vad.state !== "capturing") {
    return;
  }

  const requestedAt = Date.now();
  syncVadRuntimeState(turn);
  turn.vad = {
    ...turn.vad,
    state: "server_stop_requested",
    stopReason: reason,
    stopRequestedAt: requestedAt,
  };

  logEvent("listen_stop_capture_requested", {
    connectionId: session.connectionId,
    deviceId: session.device.deviceId,
    turnId: turn.turnId,
    reason,
    audioBytesReceived: turn.audioBytesReceived,
    audioFrameCount: turn.audioFrameCount,
    durationMs: estimateDurationMs(turn.audioBytesReceived, turn.audioFormat),
    speechProbability: turn.vad.lastSpeechProbability,
  });

  sendJson(socket, {
    event: "stop_capture",
    turn_id: turn.turnId,
    reason,
    audio_bytes_received: turn.audioBytesReceived,
    audio_frame_count: turn.audioFrameCount,
    duration_ms: estimateDurationMs(turn.audioBytesReceived, turn.audioFormat),
    vad: getVadPayload(turn),
  });
};

const handleStartTurn = (
  socket: WebSocket,
  session: ListenSession,
  payload: Record<string, unknown>,
): void => {
  if (session.processingTurnId) {
    sendProtocolError(socket, session, {
      code: "turn_processing_in_progress",
      message: "A previous turn is still processing for this connection.",
      turnId: session.processingTurnId,
    });
    return;
  }

  if (session.activeTurn) {
    sendProtocolError(socket, session, {
      code: "turn_already_active",
      message: "A turn is already active for this connection.",
      turnId: session.activeTurn.turnId,
    });
    return;
  }

  const turnId = typeof payload.turn_id === "string" ? payload.turn_id.trim() : "";
  if (turnId === "") {
    sendProtocolError(socket, session, {
      code: "invalid_turn_id",
      message: "start_turn requires a non-empty turn_id.",
    });
    return;
  }

  try {
    const output = parseOutputMode(payload.output);
    const preRollMs = parsePreRollMs(payload.pre_roll_ms);
    const audioFormat = parseAudioFormat(payload.audio_format);

    session.activeTurn = {
      turnId,
      startedAt: Date.now(),
      output,
      preRollMs,
      audioFormat,
      audioChunks: [],
      audioBytesReceived: 0,
      audioFrameCount: 0,
      lastAudioFrameAt: null,
      maxAudioBytes: MAX_TURN_AUDIO_BYTES,
      maxFrameBytes: MAX_AUDIO_FRAME_BYTES,
      captureEndedAt: null,
      captureEndReason: null,
      vad: {
        strategy: "silero_vad_16k_op15",
        state: "capturing",
        stopReason: null,
        stopRequestedAt: null,
        captureState: "idle",
        lastSpeechProbability: null,
        lastSpeechStartSample: null,
        lastSpeechEndSample: null,
        runtime: createSileroVadState(),
      },
    };

    logEvent("listen_turn_started", {
      connectionId: session.connectionId,
      deviceId: session.device.deviceId,
      turnId,
      output,
      preRollMs,
    });

    sendJson(socket, {
      event: "turn_started",
      turn_id: turnId,
      output,
      audio_format: {
        encoding: audioFormat.encoding,
        sample_rate_hz: audioFormat.sampleRateHz,
        channels: audioFormat.channels,
      },
      capture: {
        server_stop_capture_enabled: true,
        client_end_capture_required: true,
        max_capture_ms: MAX_CAPTURE_MS,
        max_audio_bytes: MAX_TURN_AUDIO_BYTES,
        max_frame_bytes: MAX_AUDIO_FRAME_BYTES,
      },
      vad: getVadPayload(session.activeTurn),
      message:
        "Turn accepted. Audio buffering is active and the server will issue stop_capture based on Silero VAD or the hard capture limit.",
    });
  } catch (error) {
    sendProtocolError(socket, session, {
      code: "invalid_start_turn",
      message: error instanceof Error ? error.message : "Invalid start_turn payload.",
      turnId,
    });
  }
};

const handleEndCapture = async (
  socket: WebSocket,
  session: ListenSession,
  payload: Record<string, unknown>,
): Promise<void> => {
  if (!session.activeTurn) {
    sendProtocolError(socket, session, {
      code: "no_active_turn",
      message: "end_capture was received without an active turn.",
    });
    return;
  }

  const turnId = typeof payload.turn_id === "string" ? payload.turn_id.trim() : "";
  if (turnId === "" || turnId !== session.activeTurn.turnId) {
    sendProtocolError(socket, session, {
      code: "turn_id_mismatch",
      message: "end_capture turn_id does not match the active turn.",
      turnId: session.activeTurn.turnId,
      details: {
        receivedTurnId: turnId || null,
      },
    });
    return;
  }

  if (session.activeTurn.captureEndedAt !== null) {
    sendProtocolError(socket, session, {
      code: "capture_already_ended",
      message: "end_capture was already received for the active turn.",
      turnId,
    });
    return;
  }

  const reason =
    typeof payload.reason === "string" && payload.reason.trim() !== ""
      ? payload.reason.trim()
      : "client_end_capture";
  syncVadRuntimeState(session.activeTurn);
  session.activeTurn.captureEndedAt = Date.now();
  session.activeTurn.captureEndReason = reason;
  session.activeTurn.vad = {
    ...session.activeTurn.vad,
    state: "capture_ended",
    stopReason:
      session.activeTurn.vad.stopReason ??
      (reason === "server_stop_capture" ? reason : null),
    stopRequestedAt: session.activeTurn.vad.stopRequestedAt,
  };

  const completedTurn = session.activeTurn;
  const utterance = assembleUtterance(completedTurn);
  session.activeTurn = null;
  session.processingTurnId = turnId;

  logEvent("listen_capture_ended", {
    connectionId: session.connectionId,
    deviceId: session.device.deviceId,
    turnId,
    reason,
    audioBytesReceived: completedTurn.audioBytesReceived,
    audioFrameCount: completedTurn.audioFrameCount,
    durationMs: utterance.durationMs,
    filename: utterance.filename,
  });

  sendJson(socket, {
    event: "turn_processing",
    turn_id: turnId,
    reason,
    audio_bytes_received: completedTurn.audioBytesReceived,
    audio_frame_count: completedTurn.audioFrameCount,
    duration_ms: utterance.durationMs,
    utterance: {
      filename: utterance.filename,
      content_type: utterance.contentType,
      wav_bytes: utterance.wavBuffer.length,
      pcm_bytes: utterance.pcmBuffer.length,
    },
    vad: getVadPayload(completedTurn),
  });

  try {
    const { transcript, execution } = await executeBufferedAudioSpeech({
      audioBuffer: utterance.wavBuffer,
      contentType: utterance.contentType,
      filename: utterance.filename,
    });

    sendJson(socket, {
      event: "transcript",
      turn_id: turnId,
      transcript,
    });

    sendJson(socket, {
      event: "turn_result",
      turn_id: turnId,
      mode: "listen_turn",
      output: completedTurn.output,
      unsupported: execution.unsupported,
      transcript,
      selection: execution.selection,
      response: execution.responseText,
      result: execution.result ?? null,
      utterance: {
        filename: utterance.filename,
        content_type: utterance.contentType,
        wav_bytes: utterance.wavBuffer.length,
        pcm_bytes: utterance.pcmBuffer.length,
      },
      vad: getVadPayload(completedTurn),
    });

    if (completedTurn.output === "audio") {
      const audio = await synthesiseSpeech({
        text: execution.responseText,
      });

      sendJson(socket, {
        event: "output_audio_start",
        turn_id: turnId,
        content_type: audio.contentType,
        bytes: audio.audioBuffer.length,
      });
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(audio.audioBuffer);
      }
      sendJson(socket, {
        event: "output_audio_end",
        turn_id: turnId,
        content_type: audio.contentType,
        bytes: audio.audioBuffer.length,
      });
    }

    sendTurnComplete(socket, turnId, {
      status: execution.unsupported ? "unsupported" : "completed",
      capture_end_reason: reason,
      audio_bytes_received: completedTurn.audioBytesReceived,
      audio_frame_count: completedTurn.audioFrameCount,
      duration_ms: utterance.durationMs,
      utterance: {
        filename: utterance.filename,
        content_type: utterance.contentType,
        wav_bytes: utterance.wavBuffer.length,
        pcm_bytes: utterance.pcmBuffer.length,
      },
      vad: getVadPayload(completedTurn),
      message: execution.responseText,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown listen pipeline failure.";

    logEvent("listen_turn_failed", {
      connectionId: session.connectionId,
      deviceId: session.device.deviceId,
      turnId,
      error: message,
    });

    sendProtocolError(socket, session, {
      code: "turn_processing_failed",
      message: "Turn processing failed.",
      turnId,
      recoverable: false,
      details: {
        error: message,
      },
    });

    sendTurnComplete(socket, turnId, {
      status: "failed",
      capture_end_reason: reason,
      audio_bytes_received: completedTurn.audioBytesReceived,
      audio_frame_count: completedTurn.audioFrameCount,
      duration_ms: utterance.durationMs,
      utterance: {
        filename: utterance.filename,
        content_type: utterance.contentType,
        wav_bytes: utterance.wavBuffer.length,
        pcm_bytes: utterance.pcmBuffer.length,
      },
      vad: getVadPayload(completedTurn),
      message: "Turn processing failed.",
    });
  } finally {
    session.processingTurnId = null;
    cleanupTurnBuffers(completedTurn);
  }
};

const handleCancelTurn = (
  socket: WebSocket,
  session: ListenSession,
  payload: Record<string, unknown>,
): void => {
  if (!session.activeTurn) {
    sendProtocolError(socket, session, {
      code: "no_active_turn",
      message: "cancel_turn was received without an active turn.",
    });
    return;
  }

  const turnId = typeof payload.turn_id === "string" ? payload.turn_id.trim() : "";
  if (turnId === "" || turnId !== session.activeTurn.turnId) {
    sendProtocolError(socket, session, {
      code: "turn_id_mismatch",
      message: "cancel_turn turn_id does not match the active turn.",
      turnId: session.activeTurn.turnId,
      details: {
        receivedTurnId: turnId || null,
      },
    });
    return;
  }

  const cancelledTurn = session.activeTurn;
  session.activeTurn = null;

  logEvent("listen_turn_cancelled", {
    connectionId: session.connectionId,
    deviceId: session.device.deviceId,
    turnId,
    audioBytesReceived: cancelledTurn.audioBytesReceived,
    audioFrameCount: cancelledTurn.audioFrameCount,
  });

  sendJson(socket, {
    event: "turn_complete",
    turn_id: turnId,
    status: "cancelled",
    audio_bytes_received: cancelledTurn.audioBytesReceived,
    audio_frame_count: cancelledTurn.audioFrameCount,
    message: "Turn cancelled by client.",
  });

  cleanupTurnBuffers(cancelledTurn);
};

const handleTextMessage = async (
  socket: WebSocket,
  session: ListenSession,
  payload: RawData,
): Promise<void> => {
  const message = parseJsonMessage(payload);
  if (!message) {
    sendProtocolError(socket, session, {
      code: "invalid_json",
      message: "Text frames must contain a JSON object.",
    });
    return;
  }

  const event = message.event;
  if (typeof event !== "string" || event.trim() === "") {
    sendProtocolError(socket, session, {
      code: "missing_event",
      message: "Control messages must include an event string.",
    });
    return;
  }

  switch (event) {
    case "hello":
      handleHello(socket, session, message);
      return;
    case "ping":
      sendJson(socket, {
        event: "pong",
        connection_id: session.connectionId,
      });
      return;
    case "pong":
      return;
    case "start_turn":
      handleStartTurn(socket, session, message);
      return;
    case "end_capture":
      await handleEndCapture(socket, session, message);
      return;
    case "cancel_turn":
      handleCancelTurn(socket, session, message);
      return;
    default:
      sendProtocolError(socket, session, {
        code: "unknown_event",
        message: `Unsupported event '${event}'.`,
      });
  }
};

const handleBinaryMessage = async (
  socket: WebSocket,
  session: ListenSession,
  payload: RawData,
): Promise<void> => {
  if (!session.activeTurn) {
    logProtocolViolation(session, "Binary audio frame received without an active turn.");
    return;
  }

  if (session.activeTurn.captureEndedAt !== null) {
    logProtocolViolation(session, "Binary audio frame received after end_capture.");
    return;
  }

  if (session.activeTurn.vad.state === "server_stop_requested") {
    logProtocolViolation(session, "Binary audio frame received after stop_capture.", {
      payloadBytes: getByteLength(payload),
    });
    return;
  }

  const audioBuffer = toBuffer(payload);
  if (audioBuffer.length === 0) {
    logProtocolViolation(session, "Empty binary audio frame received.");
    return;
  }

  if (audioBuffer.length > session.activeTurn.maxFrameBytes) {
    sendProtocolError(socket, session, {
      code: "audio_frame_too_large",
      message: "Audio frame exceeded the maximum allowed size.",
      details: {
        frameBytes: audioBuffer.length,
        maxFrameBytes: session.activeTurn.maxFrameBytes,
      },
    });
    return;
  }

  if (audioBuffer.length % PCM_BYTES_PER_SAMPLE !== 0) {
    sendProtocolError(socket, session, {
      code: "invalid_audio_frame_alignment",
      message: "PCM audio frames must be aligned to 16-bit samples.",
      details: {
        frameBytes: audioBuffer.length,
      },
    });
    return;
  }

  session.activeTurn.audioChunks.push(audioBuffer);
  session.activeTurn.audioBytesReceived += audioBuffer.length;
  session.activeTurn.audioFrameCount += 1;
  session.activeTurn.lastAudioFrameAt = Date.now();

  const vadResult = await appendVadAudio(session.activeTurn.vad.runtime, audioBuffer);
  syncVadRuntimeState(session.activeTurn);

  for (const event of vadResult.chunkEvents) {
    logEvent("listen_vad_event", {
      connectionId: session.connectionId,
      deviceId: session.device.deviceId,
      turnId: session.activeTurn.turnId,
      type: event.type,
      atSample: event.atSample,
      speechProbability: event.speechProbability,
    });

    if (event.type === "speech_end") {
      requestStopCapture(socket, session, session.activeTurn, "vad_silence_detected");
      break;
    }
  }

  if (session.activeTurn.audioBytesReceived > session.activeTurn.maxAudioBytes) {
    requestStopCapture(
      socket,
      session,
      session.activeTurn,
      "max_duration_reached",
    );
  }
};

const attachSession = (
  socket: WebSocket,
  device: DeviceAuth,
  request: http.IncomingMessage,
): void => {
  const session: ListenSession = {
    connectionId: randomUUID(),
    device,
    hello: null,
    activeTurn: null,
    processingTurnId: null,
    messageQueue: Promise.resolve(),
  };

  logEvent("listen_connection_opened", {
    connectionId: session.connectionId,
    deviceId: device.deviceId,
    tokenId: device.id,
    path: request.url ?? "",
  });

  sendJson(socket, {
    event: "listen_ready",
    connection_id: session.connectionId,
    device_id: device.deviceId,
    mode: "session",
    wake_word_detection: "edge",
    supported_audio_formats: [
      {
        encoding: DEFAULT_AUDIO_FORMAT.encoding,
        sample_rate_hz: DEFAULT_AUDIO_FORMAT.sampleRateHz,
        channels: DEFAULT_AUDIO_FORMAT.channels,
      },
    ],
    capture: {
      server_stop_capture_enabled: true,
      client_end_capture_required: true,
      max_capture_ms: MAX_CAPTURE_MS,
      max_audio_bytes: MAX_TURN_AUDIO_BYTES,
      max_frame_bytes: MAX_AUDIO_FRAME_BYTES,
    },
    vad: {
      strategy: "silero_vad_16k_op15",
      state: "idle",
      capture_state: "idle",
      chunk_duration_ms: estimateSileroChunkDurationMs(),
    },
    message: READY_MESSAGE,
  });

  socket.on("message", (payload: RawData, isBinary: boolean) => {
    session.messageQueue = session.messageQueue
      .then(async () => {
        if (isBinary) {
          await handleBinaryMessage(socket, session, payload);
          return;
        }

        await handleTextMessage(socket, session, payload);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unknown listen error";

        logEvent("listen_message_processing_failed", {
          connectionId: session.connectionId,
          deviceId: session.device.deviceId,
          turnId: session.activeTurn?.turnId,
          error: message,
        });

        sendProtocolError(socket, session, {
          code: "listen_processing_failed",
          message: "Listen processing failed.",
          recoverable: false,
          details: {
            error: message,
          },
        });
      });
  });

  socket.on("close", (code: number, reason: Buffer) => {
    const abandonedTurn = session.activeTurn;
    if (abandonedTurn) {
      logEvent("listen_turn_disconnected", {
        connectionId: session.connectionId,
        deviceId: device.deviceId,
        turnId: abandonedTurn.turnId,
        audioBytesReceived: abandonedTurn.audioBytesReceived,
        audioFrameCount: abandonedTurn.audioFrameCount,
      });
      cleanupTurnBuffers(abandonedTurn);
      session.activeTurn = null;
    }

    logEvent("listen_connection_closed", {
      connectionId: session.connectionId,
      deviceId: device.deviceId,
      closeCode: code,
      reason:
        typeof reason === "string"
          ? reason
          : reason instanceof Buffer
            ? reason.toString("utf8")
            : "",
      activeTurnId: abandonedTurn?.turnId,
    });
  });

  socket.on("error", (error: Error) => {
    logEvent("listen_connection_error", {
      connectionId: session.connectionId,
      deviceId: device.deviceId,
      error: error.message,
    });
  });
};

export const handleListenUpgrade = async (
  request: http.IncomingMessage,
  socket: Duplex,
  head: Buffer,
  expectedPath: string,
): Promise<boolean> => {
  const requestUrl = request.url ? new URL(request.url, "http://localhost") : null;
  if (!requestUrl || requestUrl.pathname !== expectedPath) {
    return false;
  }

  let device: DeviceAuth;

  try {
    const state = await getAppAuthState();
    if (!state.setup_completed_at) {
      rejectUpgrade(socket, 503, "Initial setup is required");
      return true;
    }

    device = await authenticateDeviceHeader(
      typeof request.headers.authorization === "string"
        ? request.headers.authorization
        : undefined,
    );
  } catch {
    rejectUpgrade(socket, 401, "Unauthorised");
    return true;
  }

  listenServer.handleUpgrade(request, socket, head, (ws: WebSocket) => {
    attachSession(ws, device, request);
  });

  return true;
};
