# MCP Server

`mcp-server/` is the blank MCP tool server for Diakonos-Assist.

Current scope:

- expose a minimal stdio MCP server
- provide placeholder tools for connectivity testing
- load published tool and resource metadata from Postgres when configured
- fall back to built-in definitions when Postgres is not configured or the catalog views are unavailable

Implemented tools:

- `system.health`
- `system.echo`

When Postgres is configured, the server attempts to read:

- `published_tool_catalog`
- `published_resource_catalog`

Expected env vars:

- `PG_HOST`
- `PG_PORT`
- `PG_USER`
- `PG_PASSWORD`
- `PG_DB`

## Scripts

- `npm run build`
- `npm run start`
- `npm run typecheck`

## Notes

This server uses stdio transport so it can be launched locally by the orchestrator.
