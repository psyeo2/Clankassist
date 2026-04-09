# Deployment Notes

## Recommended Split

The current recommended deployment split is:

### AI / service host

Copy and run:

- `whisper-api/`
- `piper-api/`

These are the voice-serving parts of the stack.

Important distinction:

- `whisper-api/` is the component that most clearly needs the GPU
- `piper-api/` can run on CPU, but it usually belongs on the same AI host for operational simplicity
- the LLM endpoint is external and user-managed, as long as it exposes an OpenAI-compatible API

`piper-api/` is designed to be copied and run on its own, similar to `whisper-api/`. It does not depend on a vendored Piper source tree being present beside it.

The current `piper-api/` setup is intentionally minimal:

- `docker compose up --build`
- Piper installed from PyPI
- local Cori model baked into the image
- default host port `8002`
- no required env configuration

### Any convenient machine

Run:

- `orchestrator/`
- `mcp-server/` is started by the orchestrator as a local subprocess
- `postgres/`

These services can run on almost any machine that has network access to:

- the configured LLM endpoint
- `whisper-api`
- `piper-api`
- the services it integrates with
- any caller that needs to reach it

## Why The Orchestrator Does Not Need To Be On The AI Host

`orchestrator` mainly performs:

- input validation
- prompt assembly and planner calls
- MCP client calls
- service orchestration
- logging
- auth and admin API handling

`mcp-server` mainly performs:

- tool discovery
- validation
- declarative HTTP execution
- result shaping

That work is light compared with STT and LLM inference.

## Example Layout

### Machine A: AI / service host

- external or self-hosted OpenAI-compatible LLM endpoint
- whisper-api on port `8001`
- piper-api on port `8002`

In the current repo state, `piper-api` serves the baked-in model at:

- `piper-api/cori-high/en_GB-cori-high.onnx`

### Machine B: orchestration host

- orchestrator on port `3000`
- local mcp-server subprocess
- postgres

### Internal service hosts

- GPU exporter
- Jellyseerr
- future homelab services

## Minimum Networking Requirements

`orchestrator` must be able to reach:

- `LLM_URL`
- `WHISPER_URL`
- `PIPER_URL`
- postgres
- the local `mcp-server` subprocess

`mcp-server` must be able to reach:

- each configured integration endpoint

If your wider system uses `whisper-api`, the caller or upstream layer must also be able to reach that service.

If you use `piper-api` for playback, the caller or downstream voice layer must also be able to reach that service.

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
- `PG_HOST`
- `PG_PORT`
- `PG_USER`
- `PG_PASSWORD`
- `PG_DB`

Integration-specific variables are only needed for the services you actually want enabled.

## Operational Advice

- keep the orchestrator separate from the AI host if you want cleaner failure isolation
- keep `LOG_LEVEL=SUMMARY` or `LOG_LEVEL=INFO` in development
- use `LOG_LEVEL=NONE` only if you have another observability path
- treat optional integrations as optional at deployment time

If a service is not configured, speech mode should not advertise it to the planner.
