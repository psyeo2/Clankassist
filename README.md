# Diakonos-Assist

Diakonos-Assist is a small homelab voice-assistant stack.

At a high level, the system is split into:

- speech-to-text on an AI host
- LLM planning on an AI host
- text-to-speech on an AI host
- an audio-in, audio-out pipeline service
- a process/orchestration API that can run almost anywhere
- optional internal services such as GPU metrics and Jellyseerr

## Current Components

### `process-api/`

The main orchestration API.

This is the part that:

- accepts text requests
- sends speech requests to oLLaMa for tool selection
- validates tool selections
- executes local service integrations
- returns structured JSON plus a voice-friendly response string

This service does not need a GPU.

It can run on:

- a desktop
- a VM
- a low-power server
- any machine that can reach the configured upstream services over the network

See:

- [Process API README](./process-api/README.md)
- [Process API Service Guide](./process-api/docs/add-service.md)

### `pipeline-server/`

Server-side voice pipeline orchestration.

This is the simplest service for an onboard device to talk to:

- it accepts audio
- it sends that audio to `whisper-api`
- it sends the transcript to `process-api`
- it sends the response text to `piper-api`
- it returns the generated audio back to the caller

This service does not need a GPU. It is just HTTP orchestration across the voice stack.

See:

- [Pipeline Server README](./pipeline-server/README.md)

### `ollama/`

Docker Compose for oLLaMa.

This should be copied to and run on a machine with a GPU if you want local LLM inference with decent latency.

### `whisper-api/`

FastAPI speech-to-text service built on `faster-whisper`.

This should also be copied to and run on a machine with a GPU.

It is intended to accept uploaded audio and return text for downstream processing.

See:

- [Whisper API README](./whisper-api/README.md)

### `piper-api/`

Text-to-speech service built around Piper's own HTTP server.

This is the opposite side of `whisper-api`:

- it accepts text
- it returns WAV audio
- it is intended to speak the response string produced by `process-api`

Unlike `whisper-api`, this is a thin deployment wrapper rather than a custom app. It installs Piper from PyPI, bakes the local Cori voice into the image, and runs Piper's own HTTP server.

The current default setup serves:

- `piper-api/cori-high/en_GB-cori-high.onnx`
- on `http://<host>:8002`
- with no required environment variables

See:

- [Piper API README](./piper-api/README.md)

## Deployment Guidance

The practical deployment split is:

### Put these on a GPU machine

- `ollama/`
- `whisper-api/`
- `piper-api/`

Reason:

- these are the voice and model-serving parts of the stack
- `ollama/` and `whisper-api/` materially benefit from GPU acceleration
- `piper-api/` is lighter and can run on CPU, but it still makes sense to keep it on the same AI host for a simple voice pipeline
- `piper-api/` is standalone, so it can be copied on its own like `whisper-api/`

### Run this wherever convenient

- `pipeline-server/`
- `process-api/`

Reason:

- these are mostly HTTP orchestration services
- they do not require local GPU inference
- it only needs network access to:
  - Piper
  - oLLaMa
  - whisper, if your wider system uses it
  - any integrated services such as Jellyseerr or GPU exporter

In practice, `process-api` and `pipeline-server` can live on the same GPU host, but they do not have to.

## Suggested Request Flow

The intended device-facing voice flow is:

1. Audio is captured somewhere upstream.
2. The audio is sent to `pipeline-server`.
3. `pipeline-server` sends the audio to `whisper-api`.
4. `pipeline-server` sends the transcript to `process-api`.
5. `process-api` sends the text and available tools to oLLaMa.
6. oLLaMa chooses a tool and arguments.
7. `process-api` executes that tool and returns a spoken response string.
8. `pipeline-server` sends that response string to `piper-api`.
9. `pipeline-server` returns WAV audio for playback.

For the current repo setup, `piper-api` uses the baked-in Cori voice by default.

## Repository Layout

```text
.
├── docs/                 Top-level architecture and planning docs
├── ollama/               Docker Compose for local LLM inference
├── piper-api/            Piper-based text-to-speech service
├── pipeline-server/      Audio-in, audio-out orchestration service
├── process-api/          Main orchestration / tool-execution API
├── whisper-api/          GPU-backed speech-to-text service
└── test-audio/           Example audio files
```

## Documentation

Top-level docs:

- [Architecture](./docs/ARCHITECTURE.md)
- [Deployment Notes](./docs/DEPLOYMENT.md)
- [Tool Registry Future](./docs/TOOL-REGISTRY-FUTURE.md)

Process API docs:

- [Process API Overview](./process-api/README.md)
- [Adding a Service](./process-api/docs/add-service.md)

Pipeline docs:

- [Pipeline Server README](./pipeline-server/README.md)

Voice service docs:

- [Whisper API README](./whisper-api/README.md)
- [Piper API README](./piper-api/README.md)

## Current Status

The main implemented application layer in this repo is `process-api`.

That API now supports:

- direct tool execution
- speech-mode tool planning via oLLaMa
- tool availability filtering based on env configuration
- request-scoped logging with configurable log levels
- current integrations for:
  - GPU status
  - Jellyseerr

The wider end-to-end voice system still depends on how you connect:

- audio capture
- speech-to-text
- pipeline orchestration
- process orchestration
- text-to-speech

## Notes

- `process-api` expects text, not raw audio.
- `pipeline-server` is the service that turns audio in into audio out.
- The GPU machine split is a deployment recommendation, not a hard requirement.
- If you want to extend the assistant, start in `process-api` and follow the service-addition guide.
