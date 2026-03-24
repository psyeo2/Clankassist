# Whisper STT Service (faster-whisper + FastAPI)

This service provides a simple HTTP API for speech-to-text transcription using faster-whisper, running on GPU (CUDA) with a preloaded model.

## Overview

- Model: Whisper "medium"
- Backend: faster-whisper (CTranslate2)
- API: FastAPI
- Input: audio file (multipart/form-data)
- Output: JSON transcription result

---

## Base URL

```
http://<host>:8001
```

---

## Endpoints

### 1. Health Check

**GET /**

Returns basic service status.

#### Response

```json
{
  "status": "ok"
}
```

---

### 2. Transcribe Audio

**POST /transcribe**

Transcribes an uploaded audio file.

#### Request

- Content-Type: `multipart/form-data`
- Body:
  - `file`: audio file (required)

#### Example (curl)

```bash
curl -X POST http://localhost:8001/transcribe \
  -F "file=@audio.wav"
```

#### Supported formats

Anything supported by PyAV/FFmpeg libraries (e.g.):
- wav
- mp3
- m4a
- flac
- ogg

---

## Response

```json
{
  "text": "add carrots to grocy",
  "language": "en",
  "duration": 3.42
}
```

### Fields

- `text` (string)
  Transcribed text output

- `language` (string)
  Detected language (forced to "en" in current config)

- `duration` (float)
  Duration of processed audio in seconds

---

## Behaviour

- Uses GPU (`cuda`) with FP16 precision
- Language is fixed to English (`language="en"`)
- Beam size is set to 1 for low latency
- Voice Activity Detection (VAD) is enabled to trim silence
- Entire file is processed before returning response (non-streaming)

---

## Notes

- The model is pre-downloaded at build time (no runtime internet required)
- The service is stateless
- Designed for short voice commands (low latency use case)

---

## Future Improvements (optional)

- Streaming transcription
- Batch processing endpoint
- Custom VAD tuning
- Multiple model selection
- Authentication / rate limiting