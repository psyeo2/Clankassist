# MCP Server

`mcp-server/` is the blank MCP tool server for Diakonos-Assist.

Current scope:

- expose a minimal stdio MCP server
- provide placeholder tools for connectivity testing
- leave Postgres-backed tool loading for the next step

Implemented tools:

- `system.health`
- `system.echo`

## Scripts

- `npm run build`
- `npm run start`
- `npm run typecheck`

## Notes

This server uses stdio transport so it can be launched locally by the orchestrator.
