# Orchestrator

`orchestrator/` is the HTTP-facing service that will eventually own planning, audio routing, and response shaping.

Current scope:

- connect to the local stdio MCP server
- expose a small HTTP API for health, tool discovery, and direct tool execution
- leave planner, speech, Postgres, and upstream service integrations for later

## Endpoints

- `GET /api/v1/ping`
- `GET /api/v1/tools`
- `POST /api/v1/process`

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

## Scripts

- `npm run build`
- `npm run start`
- `npm run typecheck`

## Startup order

1. Build `mcp-server`
2. Build `orchestrator`
3. Start `orchestrator`

The orchestrator spawns the local MCP server process through stdio using `MCP_SERVER_SCRIPT`.
