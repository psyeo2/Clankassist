# Orchestrator

`orchestrator/` is the HTTP-facing service for Diakonos Assist. It owns request intake, LLM planning, audio routing, response shaping, and MCP client communication.

Current scope:

- spawn and connect to the local stdio MCP server
- fetch tools from MCP and ask an OpenAI-compatible LLM API to choose the correct one for speech requests
- expose a public `respond` endpoint for text/audio input and `json|text|audio` output
- expose a real WebSocket `listen` endpoint for wake-word/VAD-driven voice turns
- provide helper routes for health, tools, direct process calls, Whisper, and Piper passthrough

## Logging

`LOG_LEVEL` supports four modes:

- `NONE`: suppress request logs
- `ERROR`: buffer full request traces and only print them for failed requests
- `SHORT`: print one line per request
- `INFO`: print full request blocks including subrequests

## Endpoints

- `GET /api/v1/ping`
- `POST /api/v1/respond?output=json|text|audio`
- `WS /api/v1/listen`
- `GET /api/v1/tools`
- `POST /api/v1/process`
- `POST /api/v1/whisper/transcribe`
- `GET /api/v1/piper/voices`
- `POST /api/v1/piper/synthesise`

## Auth

Admin auth now uses password setup plus logged-in session tokens.

- `GET /api/v1/admin/setup/status` reports whether setup is still required
- `POST /api/v1/admin/setup` creates the initial admin password
- `POST /api/v1/admin/login` returns admin access and refresh tokens
- `/api/v1/admin/*` management routes require an admin bearer token
- device-facing routes such as `/api/v1/respond` and `/api/v1/listen` require a device bearer token

Canonical `device_id` values are orchestrator-issued and stored against device records. Unpaired devices should use temporary bootstrap handles or pairing codes, not MAC addresses, during discovery.

## Examples

Direct tool execution:

```json
{
  "tool": "system.echo",
  "args": {
    "message": "hello"
  }
}
```

Speech planning through the configured LLM:

```json
{
  "speech": "what temp is my gpu?"
}
```

`respond` with `text/plain` input:

```bash
curl -X POST "http://localhost:3000/api/v1/respond?output=text" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: text/plain" \
  --data "what temp is my gpu?"
```

`respond` with raw audio:

```bash
curl -X POST "http://localhost:3000/api/v1/respond?output=json&filename=question.wav" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: audio/wav" \
  --data-binary "@test-audio/piper-out/hello.wav"
```

Whisper passthrough:

```bash
curl -X POST http://localhost:3000/api/v1/whisper/transcribe \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: audio/wav" \
  --data-binary "@test-audio/piper-out/hello.wav"
```

Piper passthrough:

```json
{
  "text": "This is a test."
}
```

## Required Env

- `MCP_SERVER_SCRIPT`
- `LLM_URL`
- `LLM_KEY`
- `LLM_MODEL`
- `WHISPER_URL`
- `PIPER_URL`
- `SILERO_VAD_MODEL_PATH` optional, defaults to the bundled model path
- `PG_HOST`
- `PG_PORT`
- `PG_USER`
- `PG_PASSWORD`
- `PG_DB`

## Scripts

- `npm run build`
- `npm run start`
- `npm run typecheck`

## Startup order

1. Build `mcp-server`
2. Build `orchestrator`
3. Start `orchestrator`

The orchestrator spawns the local MCP server process through stdio using `MCP_SERVER_SCRIPT`.
