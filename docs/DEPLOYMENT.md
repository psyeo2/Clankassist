# Deployment Notes

## Recommended Split

The current recommended split is:

### AI / media host

Copy and run:

- `whisper-api/`
- `piper-api/`
- an OpenAI-compatible LLM endpoint if you self-host one

These are the inference-heavy or media-serving parts of the stack.

Important distinctions:

- `whisper-api/` is the component that most clearly benefits from a GPU
- `piper-api/` can run on CPU, but often belongs on the same host for operational simplicity
- the LLM endpoint is external from the orchestrator's point of view, even if you self-host it

### App host

Run:

- `orchestrator/`
- local `mcp-server/` subprocess
- `postgres`
- optionally `clankassist-frontend/`

These services can run on almost any machine that has network access to:

- the configured `LLM_URL`
- `whisper-api`
- `piper-api`
- Postgres
- the internal services your published MCP tools call

## Why The Orchestrator Does Not Need To Be On The AI Host

`orchestrator` mainly performs:

- input validation
- request routing
- planner prompts and LLM calls
- MCP client calls
- auth and admin API handling
- websocket session handling
- server-side VAD coordination for `/listen`
- response shaping and logging

`mcp-server` mainly performs:

- published catalog loading
- tool validation
- declarative HTTP execution
- result shaping

That work is light compared with STT and LLM inference.

## Example Layout

### Machine A: AI / media host

- external or self-hosted OpenAI-compatible LLM endpoint
- `whisper-api` on port `8001`
- `piper-api` on port `8002`

In the current repo state, `piper-api` serves the baked-in Cori model at:

- `piper-api/cori-high/en_GB-cori-high.onnx`

### Machine B: app host

- `orchestrator` on port `3000`
- local `mcp-server` subprocess
- Postgres
- optional `clankassist-frontend`

### Internal service hosts

- GPU exporter
- Jellyseerr
- future homelab services

## Minimum Networking Requirements

`orchestrator` must be able to reach:

- `LLM_URL`
- `WHISPER_URL`
- `PIPER_URL`
- Postgres
- the local `mcp-server` subprocess

`mcp-server` must be able to reach:

- each published tool's allowed upstream endpoints

Edge devices or other callers that use the assistant must be able to reach:

- `orchestrator`

## Environment Configuration

At minimum, `orchestrator` needs:

- `PORT`
- `API_VERSION`
- `LOG_LEVEL`
- `MCP_SERVER_SCRIPT`
- `LLM_URL`
- `LLM_KEY`
- `LLM_MODEL`
- `WHISPER_URL`
- `PIPER_URL`
- `SILERO_VAD_MODEL_PATH`
- `PG_HOST`
- `PG_PORT`
- `PG_USER`
- `PG_PASSWORD`
- `PG_DB`

Tool-specific auth and endpoint values are only needed for the tools you actually publish.

## Operational Advice

- keep the orchestrator separate from the AI host if you want cleaner failure isolation
- keep `LOG_LEVEL=SHORT` or `LOG_LEVEL=INFO` in development
- use `LOG_LEVEL=NONE` only if you have another observability path
- treat optional tools and integrations as optional at deployment time
- keep the Silero model file deployed alongside the orchestrator if you use `/listen`

If a service is not configured, published tools or voice flows that depend on it should not be advertised as healthy.
