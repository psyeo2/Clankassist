# Diakonos-Assist

Diakonos-Assist is a small homelab voice-assistant stack.

At a high level, the system is split into:

- speech-to-text on a GPU machine
- LLM planning on a GPU machine
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

### `ollama/`

Docker Compose for oLLaMa.

This should be copied to and run on a machine with a GPU if you want local LLM inference with decent latency.

### `whisper-api/`

FastAPI speech-to-text service built on `faster-whisper`.

This should also be copied to and run on a machine with a GPU.

It is intended to accept uploaded audio and return text for downstream processing.

See:

- [Whisper API README](./whisper-api/README.md)

### `piper/`

Vendored Piper sources and related files.

This repository currently includes Piper assets and source, but the active orchestration work in this repo is centred around:

- `process-api`
- `ollama`
- `whisper-api`

Treat `piper/` as a bundled dependency/work area rather than the main application entrypoint.

## Deployment Guidance

The practical deployment split is:

### Put these on a GPU machine

- `ollama/`
- `whisper-api/`

Reason:

- both are AI inference workloads
- both benefit strongly from CUDA/GPU acceleration
- both are heavier than the orchestration layer

### Run this wherever convenient

- `process-api/`

Reason:

- it is mostly HTTP orchestration, validation, and tool execution
- it does not require local GPU inference
- it only needs network access to:
  - oLLaMa
  - whisper, if your wider system uses it
  - any integrated services such as Jellyseerr or GPU exporter

In practice, `process-api` can live on the same GPU host, but it does not have to.

## Suggested Request Flow

The intended voice flow is:

1. Audio is captured somewhere upstream.
2. `whisper-api` transcribes that audio into text.
3. The text is sent to `process-api`.
4. `process-api` sends the text and available tools to oLLaMa.
5. oLLaMa chooses a tool and arguments.
6. `process-api` executes that tool.
7. `process-api` returns structured data and a short spoken response.
8. A TTS layer can then speak that response.

## Repository Layout

```text
.
├── docs/                 Top-level architecture and planning docs
├── ollama/               Docker Compose for local LLM inference
├── process-api/          Main orchestration / tool-execution API
├── whisper-api/          GPU-backed speech-to-text service
├── piper/                Bundled Piper sources/assets
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
- process orchestration
- text-to-speech

## Notes

- `process-api` expects text, not raw audio.
- The GPU machine split is a deployment recommendation, not a hard requirement.
- If you want to extend the assistant, start in `process-api` and follow the service-addition guide.
