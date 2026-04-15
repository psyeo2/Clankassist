# Diakonos-Assist

Diakonos-Assist is a homelab assistant stack centred on a single public application service: `orchestrator/`.

The current architecture is:

- `orchestrator/` owns HTTP and websocket intake, auth, planning, voice-pipeline coordination, and response shaping
- `mcp-server/` is spawned by the orchestrator over stdio and executes published tools from Postgres
- `whisper-api/` provides speech-to-text
- `piper-api/` provides text-to-speech
- `postgres` stores admin auth state, devices, tokens, tools, versions, resources, and publication state
- `clankassist-frontend/` is the admin/user web UI
- `esp/` is the edge-device area for voice-node work

## Current Components

### `orchestrator/`

The main application service.

It currently:

- exposes `POST /api/v1/respond` for text and uploaded audio
- exposes `WS /api/v1/listen` for long-lived device voice sessions
- handles admin auth and device auth
- plans tool selection with an OpenAI-compatible LLM API
- calls the local MCP server for tool execution
- calls `whisper-api` and `piper-api` when needed

See:

- [Orchestrator README](./orchestrator/README.md)

### `mcp-server/`

The runtime MCP server.

It currently:

- loads the published tool and resource catalog from Postgres
- registers built-in system tools plus published catalog tools
- validates tool inputs
- executes declarative HTTP-backed tool definitions
- returns structured MCP results to the orchestrator

### `whisper-api/`

GPU-oriented speech-to-text using `faster-whisper`.

It accepts uploaded audio and returns a transcription JSON payload.

See:

- [Whisper API README](./whisper-api/README.md)

### `piper-api/`

Piper-based text-to-speech, exposed through Piper's own HTTP server.

It accepts text and returns WAV audio.

See:

- [Piper API README](./piper-api/README.md)

### `clankassist-frontend/`

The web frontend for admin flows and manual interaction with the orchestrator.

### `ollama/`

Optional local LLM deployment helper.

This repo does not require Ollama specifically. The orchestrator only requires an OpenAI-compatible LLM endpoint.

## Current Request Flow

### HTTP text or audio

1. A caller sends text or audio to `orchestrator`.
2. If audio is provided, `orchestrator` sends it to `whisper-api`.
3. `orchestrator` asks the configured LLM to choose a tool and draft a response.
4. `orchestrator` calls `mcp-server`.
5. `mcp-server` executes the selected tool against the published catalog.
6. `orchestrator` returns JSON, plain text, or generated audio.

### Streaming voice device

1. A paired edge device opens `WS /api/v1/listen`.
2. Wake-word detection happens on the device.
3. The device starts a turn and streams pre-roll plus live PCM audio.
4. `orchestrator` runs server-side VAD and sends `stop_capture` when the utterance is complete.
5. `orchestrator` reuses the same transcription, planning, MCP, and TTS pipeline used by `/respond`.
6. Transcript, result, and optional output audio are returned over the websocket.

## Deployment Guidance

### AI / media host

Recommended:

- `whisper-api/`
- `piper-api/`
- an OpenAI-compatible LLM endpoint, if self-hosted

### App host

Run:

- `orchestrator/`
- local `mcp-server/` subprocess
- `postgres`
- optionally `clankassist-frontend/`

See:

- [Deployment Notes](./docs/DEPLOYMENT.md)

## Repository Layout

```text
.
├── clankassist-frontend/  Web UI
├── docs/                  Architecture and product docs
├── esp/                   Edge-device work
├── mcp-server/            MCP runtime server
├── ollama/                Optional local LLM deployment helper
├── orchestrator/          Main public application service
├── piper-api/             Piper-based TTS deployment
├── test-audio/            Audio fixtures and samples
├── voice-models/          Local voice-model assets
└── whisper-api/           Whisper-based STT service
```

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Auth And Discovery](./docs/AUTH-AND-DISCOVERY.md)
- [Deployment Notes](./docs/DEPLOYMENT.md)
- [Voice Node Requirements](./docs/VOICE_NODE_REQS.md)
- [Voice Node Protocol Examples](./docs/VOICE_NODE_PROTOCOL_EXAMPLES.md)

## Current Status

The old `process-api` and `pipeline-server` split has been retired.

The current product direction is:

- one public orchestrator
- one local MCP runtime
- one shared speech pipeline reused by HTTP `/respond` and websocket `/listen`
- admin-managed published tool catalog in Postgres
- edge-device wake-word capture with orchestrator-side VAD

## Notes

- `WS /api/v1/listen` is for paired devices, not browsers or admin clients
- the orchestrator expects an OpenAI-compatible LLM API, not a specific provider
- `mcp-server` is intentionally not exposed as a separate public network service
