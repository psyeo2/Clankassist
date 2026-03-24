# Deployment Notes

## Recommended Split

The current recommended deployment split is:

### GPU machine

Copy and run:

- `ollama/`
- `whisper-api/`
- `piper-api/`

These are the voice and model-serving parts of the stack.

Important distinction:

- `ollama/` and `whisper-api/` are the components that most clearly need the GPU
- `piper-api/` can run on CPU, but it usually belongs on the same AI host for operational simplicity

`piper-api/` is designed to be copied and run on its own, similar to `whisper-api/`. It does not depend on a vendored Piper source tree being present beside it.

The current `piper-api/` setup is intentionally minimal:

- `docker compose up --build`
- Piper installed from PyPI
- local Cori model baked into the image
- default host port `8002`
- no required env configuration

### Any convenient machine

Run:

- `pipeline-server/`
- `process-api/`

These services can run on almost any machine that has network access to:

- the oLLaMa host
- `whisper-api`
- `piper-api`
- the services it integrates with
- any caller that needs to reach it

## Why `process-api` Does Not Need To Be On The GPU Host

`process-api` mainly performs:

- input validation
- prompt assembly
- tool selection handoff
- executor dispatch
- service orchestration
- logging

`pipeline-server` mainly performs:

- audio upload handling
- upstream HTTP orchestration
- response piping
- failure forwarding

That work is light compared with STT and LLM inference.

## Example Layout

### Machine A: GPU host

- oLLaMa on port `11434`
- whisper-api on port `8001`
- piper-api on port `8002`

In the current repo state, `piper-api` serves the baked-in model at:

- `piper-api/cori-high/en_GB-cori-high.onnx`

### Machine B: orchestration host

- pipeline-server on port `8003`
- process-api on port `3001`

### Internal service hosts

- GPU exporter
- Jellyseerr
- future homelab services

## Minimum Networking Requirements

`process-api` must be able to reach:

- `OLLAMA_URL`
- each configured integration endpoint

`pipeline-server` must be able to reach:

- `WHISPER_URL`
- `PROCESS_URL`
- `PIPER_URL`

If your wider system uses `whisper-api`, the caller or upstream layer must also be able to reach that service.

If you use `piper-api` for playback, the caller or downstream voice layer must also be able to reach that service.

## Environment Configuration

At minimum, `process-api` needs:

- `PORT`
- `API_VERSION`
- `LOG_LEVEL`
- `OLLAMA_URL`
- `OLLAMA_MODEL`

Integration-specific variables are only needed for the services you actually want enabled.

## Operational Advice

- keep `process-api` separate from the GPU host if you want cleaner failure isolation
- keep `LOG_LEVEL=SUMMARY` or `LOG_LEVEL=INFO` in development
- use `LOG_LEVEL=NONE` only if you have another observability path
- treat optional integrations as optional at deployment time

If a service is not configured, speech mode should not advertise it to the planner.
