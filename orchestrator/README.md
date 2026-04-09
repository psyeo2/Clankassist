# Orchestrator

`orchestrator/` is the HTTP-facing service that will eventually own planning, audio routing, and response shaping.

Current scope:

- connect to the local stdio MCP server
- expose a small HTTP API for health, tool discovery, direct tool execution, and basic Whisper/Piper passthrough routes
- leave planner, speech, Postgres, and upstream service integrations for later

## Logging

`LOG_LEVEL` supports four modes:

- `NONE`: suppress request logs
- `ERROR`: buffer full request traces and only print them for failed requests
- `SHORT`: print one line per request
- `INFO`: print full request blocks including subrequests

## Endpoints

- `GET /api/v1/ping`
- `GET /api/v1/tools`
- `POST /api/v1/process`
- `POST /api/v1/whisper/transcribe`
- `GET /api/v1/piper/voices`
- `POST /api/v1/piper/synthesise`

Direct execution example:

```json
{
  "tool": "system.echo",
  "args": {
    "message": "hello"
  }
}
```

Speech-mode example for now returns `501`:

```json
{
  "speech": "what temp is my gpu?"
}
```

Whisper passthrough example:

```bash
curl -X POST http://localhost:3000/api/v1/whisper/transcribe \
  -H "Content-Type: audio/wav" \
  --data-binary "@test-audio/piper-out/hello.wav"
```

Piper passthrough example:

```json
{
  "text": "This is a test."
}
```

## Scripts

- `npm run build`
- `npm run start`
- `npm run typecheck`

## Startup order

1. Build `mcp-server`
2. Build `orchestrator`
3. Start `orchestrator`

The orchestrator spawns the local MCP server process through stdio using `MCP_SERVER_SCRIPT`.
