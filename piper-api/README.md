# Piper TTS Service

`piper-api/` is the text-to-speech counterpart to `whisper-api/`.

This is the simplest possible deployment shape:

- install `piper-tts[http]`
- bake the local Cori voice into the image
- run Piper's own HTTP server

There is no custom FastAPI wrapper here because Piper already provides the endpoint you need.

## What This Directory Contains

- a Dockerfile that installs Piper from PyPI
- the local Cori voice files in `cori-high/`
- a Compose file that runs Piper's built-in HTTP API

## Why This Exists

Piper already exposes a sensible HTTP API for TTS, so building another wrapper service would mostly add noise.

This directory gives you a deployable service that fits the rest of this repo without re-implementing Piper itself.

It is self-contained, so you can copy `piper-api/` to another machine without bundling the rest of the repository.

## Quick Start

1. Make sure `cori-high/en_GB-cori-high.onnx` and `cori-high/en_GB-cori-high.onnx.json` are present.
2. Start the service:

```bash
docker compose up --build
```

That is it. No extra setup is required for the default voice.

## Base URL

By default:

```text
http://<host>:8002
```

## Endpoints

These are Piper's native endpoints.

### 1. Synthesis

**POST /**  
Returns WAV audio bytes.

Example:

```bash
curl -X POST http://localhost:8002/ \
  -H "Content-Type: application/json" \
  -d '{"text":"This is a test."}' \
  --output test.wav
```

Request body:

- `text` required text to speak
- `voice` optional voice name; the server already starts with the baked-in Cori model as default
- `speaker` optional speaker name for multi-speaker voices
- `speaker_id` optional numeric speaker id
- `length_scale` optional speaking speed
- `noise_scale` optional voice variation
- `noise_w_scale` optional phoneme width variation

### 2. Installed Voices

**GET /voices**

Returns the voices currently available in the local data directory.

Example:

```bash
curl http://localhost:8002/voices
```

### 3. All Known Voices

**GET /all-voices**

Returns the upstream Piper voice catalogue.

### 4. Download a Voice

**POST /download**

Example:

```bash
curl -X POST http://localhost:8002/download \
  -H "Content-Type: application/json" \
  -d '{"voice":"en_GB-alan-medium"}'
```

## Environment Variables

None are required for the default setup.

The current Compose file always:

- exposes `8002` on the host
- serves the local model at `/voices/cori-high/en_GB-cori-high.onnx`

## Relationship To The Rest Of The Stack

The expected voice path is:

1. audio is transcribed by `whisper-api`
2. text is planned and executed by `orchestrator` through the local `mcp-server`
3. `orchestrator` produces a short response string
4. that response string is sent to `piper-api`
5. `piper-api` returns WAV audio for playback

## Notes

- Piper can run on CPU, so this service is lighter than `ollama/` or `whisper-api/`
- it still makes sense to keep it on the same AI host for convenience and low-latency voice output
- this service is standalone and does not depend on `piper1-gpl/` being present beside it
- if you want a different default voice later, replace the files in `cori-high/` or adjust the Dockerfile command
