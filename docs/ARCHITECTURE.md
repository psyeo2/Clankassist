# Architecture

## Overview

Diakonos-Assist is moving toward a split between a user-facing orchestrator and a dedicated MCP tool server.

The target architecture is:

- `orchestrator` handles audio/text intake, planning, response shaping, and voice-pipeline coordination
- `mcp-server` exposes tools, validates tool calls, executes a generic integration skeleton, and returns structured results
- `postgres` stores tool metadata, integration definitions, execution specs, versions, and publication state
- `ollama` handles planning / LLM inference
- `whisper-api` handles speech-to-text
- `piper-api` handles text-to-speech using Piper's built-in HTTP server and a baked-in local voice model
- internal homelab services provide the actual functionality

The important point is that the orchestrator coordinates the user workflow, while the MCP server owns tool execution.

In the chosen deployment model, the orchestrator starts the MCP server as a local subprocess and communicates with it over stdio. This keeps the distribution model simple while preserving a clear logical split between orchestration and tool execution.

The MCP server is intentionally generic. Service-specific client modules such as `integrations/gpuStatus/client.ts` are not part of the target design. Instead, Postgres defines integrations, request shapes, response extraction rules, and published tool metadata, while the MCP server provides a constrained execution engine that can interpret those definitions safely.

## High-Level Flow

```mermaid
flowchart LR

audio[Audio Input] --> orchestrator[orchestrator]
text[Text Input] --> orchestrator

orchestrator -->|audio file| whisper[whisper-api]
whisper -->|transcript| orchestrator

orchestrator -->|tool planning prompt| ollama[oLLaMa]
ollama -->|tool + args + response draft| orchestrator

orchestrator -->|tool call| mcp[MCP Server]
mcp -->|structured tool result| orchestrator

orchestrator -->|speech text| piper[piper-api]
piper -->|WAV audio| orchestrator
orchestrator -->|WAV audio| speaker[Playback / Speaker]

mcp -->|tool metadata| postgres[(Postgres)]
postgres -->|published tools| mcp

mcp -->|HTTP/tool execution| services[Internal Services]
services -->|results| mcp

orchestrator -->|JSON data| caller[Client / Voice Layer]
```

## Deployment Split

```mermaid
flowchart LR

subgraph GPUHost["GPU Machine"]
  whisper[whisper-api]
  ollama[oLLaMa]
end

subgraph AppHost["Kubernetes Cluster / Single App Container"]
  orchestrator[orchestrator]
  mcp[MCP Server]
  piper[piper-api]
  postgres[(Postgres)]
  admin[Admin GUI]
end

subgraph Services["Internal Services"]
  gpu[GPU Exporter]
  jelly[Jellyseerr]
  future[Future Services]
end

orchestrator --> whisper
whisper --> orchestrator
orchestrator --> ollama
orchestrator -->|stdio subprocess| mcp
mcp --> postgres
postgres --> mcp
orchestrator --> piper
mcp --> gpu
mcp --> jelly
mcp --> future
admin --> postgres
```

### Why this split

`ollama/` and `whisper-api/` should live on a GPU machine because they are inference-heavy.

`piper-api/` is lighter and can run on CPU, but keeping it on the same AI host usually keeps the voice path simpler:

- STT in
- planning and tool selection in the middle
- TTS out

The orchestrator can run almost anywhere because it mainly does:

- request intake
- speech and text routing
- upstream HTTP calls
- subprocess lifecycle for the local MCP server
- planner coordination
- failure forwarding
- response shaping
- binary audio response handling

The MCP server can also run almost anywhere because it mainly does:

- tool discovery
- tool validation
- generic execution dispatch
- integration calls based on declarative specs
- result shaping

When the orchestrator and MCP server are packaged together, the MCP server does not need its own network API. The orchestrator owns the public HTTP surface and treats the MCP server as an internal child process.

Folding `pipeline-server` into the orchestrator is reasonable because its responsibilities were already orchestration concerns rather than a distinct business domain.

## Orchestrator Responsibilities

The orchestrator replaces the old split between `pipeline-server` and `process-api`.

Its job is:

- receive text requests
- receive uploaded or raw audio
- call `whisper-api` when transcription is needed
- call `ollama` to choose a tool and draft a short response
- call the MCP server to execute the selected tool
- call `piper-api` when audio output is required
- return either JSON, plain text, or generated WAV audio
- surface failure context with service and state metadata

### Request modes

The orchestrator should support at least three modes:

1. text planning mode
2. direct tool mode
3. audio pipeline mode

Text planning mode:

- input: `{ "speech": "..." }`
- sends available tools to `ollama`
- receives a selected tool and args
- calls the MCP server with that tool selection
- returns structured JSON plus a voice-friendly response string

Direct tool mode:

- input: `{ "tool": "...", "args": {} }`
- skips `ollama` entirely
- calls the MCP server directly
- returns deterministic execution results

Audio pipeline mode:

- input: audio bytes or multipart upload
- sends audio to `whisper-api`
- plans from the transcript
- executes through the MCP server
- optionally synthesises the response through `piper-api`

This keeps direct mode useful for deterministic testing while giving one service ownership of the full voice path.

### Internal layers

```mermaid
flowchart TD

request[HTTP Request] --> intake[request intake]
intake --> speech{Audio input?}
speech -->|yes| whisper[whisper-api]
whisper --> planner[planner step]
speech -->|no| planner

planner --> ollama[oLLaMa]
ollama --> selection[tool selection]
selection --> mcpProc[MCP subprocess launch / reuse]
mcpProc --> mcp[MCP Server]
mcp --> result[tool result]
result --> response[response shaping]
response --> tts{Audio output?}
tts -->|yes| piper[piper-api]
piper --> final[HTTP response]
tts -->|no| final
```

## MCP Server Responsibilities

The MCP server is the tool execution boundary.

Its job is:

- expose planner-visible tools
- validate tool call arguments
- execute the correct declarative integration spec
- return structured results
- hide unpublished or invalid tools
- keep execution code separate from planner logic

Conceptually, the orchestrator answers "what should be called?" and the MCP server answers "how is that tool actually run?"

### Internal layers

```mermaid
flowchart TD

call[Tool Call] --> catalog[published tool catalog]
catalog --> validation[tool validation]
validation --> spec[execution spec]
spec --> engine[generic execution engine]
engine --> services[real services]
services --> engine
engine --> output[structured tool result]
```

## Tool Metadata And Postgres

Tool metadata and declarative execution specs should move to Postgres, but the execution engine and hard safety rules should remain in version-controlled source.

This is an important distinction:

- Postgres owns metadata and execution specs
- source code owns the execution engine and safety boundaries

The system should not allow arbitrary executable logic to be defined in the database. The database may describe requests and extraction rules, but it should not store free-form code.

### What belongs in Postgres

Store:

- integration transport type
- integration base URL env-var reference
- integration auth strategy and env-var reference
- tool name
- description
- integration key
- argument schema JSON
- execution summary
- execution spec JSON
- enabled or disabled state
- planner visibility
- metadata version
- draft or published state
- human notes

### What stays in source code

Keep:

- generic execution engine
- supported extractor and transformer types
- validation helpers
- hard safety checks
- allow-list of supported protocols, auth modes, and extraction modes

### Suggested entities

A minimal schema should include:

- `integrations`
- `tools`
- `tool_versions`
- `tool_publish_events`
- `resources`
- `resource_versions`
- `resource_publish_events`

The important operational rule is that only published and validated tool metadata should be exposed by the MCP server.

### Declarative execution model

The runtime model is intentionally declarative.

For each published tool version, Postgres should be able to describe:

- how the request is built
- which integration it targets
- which HTTP method and path are used
- how args map into path, query, headers, or body
- which response shape is expected
- how structured output is extracted
- how user-facing text is shaped

This means the MCP server should provide a fixed set of supported execution and extraction modes, for example:

- HTTP request execution
- JSON field extraction
- text extraction
- Prometheus metric extraction
- simple templated result shaping

The MCP server should not evaluate arbitrary scripts from the database.

## Admin GUI

An admin GUI becomes useful once tool metadata lives in Postgres.

It should support:

- creating tool drafts
- editing descriptions and schemas
- toggling planner visibility
- previewing planner-facing tool JSON
- validating metadata against known executor bindings
- publishing and rolling back metadata versions

The GUI should never:

- upload executable code
- define arbitrary executable logic
- bypass integration allow-lists

That keeps the system flexible without turning it into remote code execution.

The admin HTTP API for creating, editing, publishing, rolling back, and deleting tool or resource metadata can reasonably live in the orchestrator because the orchestrator already owns the public API surface. The MCP server should remain read-only with respect to published metadata during normal runtime.

## Integration Layer

Integration clients belong behind the MCP server.

In the target model, "integration layer" means declarative integration definitions plus a generic runtime engine, not handwritten per-service client modules.

Purpose:

- define how upstream services are called in a structured way
- isolate auth mode, base URL env-var references, HTTP request shapes, and extraction rules
- keep planner-facing tool selection separate from execution mechanics

Current integrations expected in this model include:

- GPU status
- Jellyseerr

This layer is where integration specifications belong. It is not where tool selection belongs.

## Unsupported Requests

Unsupported requests should still be handled explicitly.

The planner should choose an explicit unsupported path when the user asks for something outside the published tool set.

This avoids forcing random requests into the closest available tool.

## Logging Model

Logging should stay request-scoped and split by responsibility.

At the orchestrator layer, log:

- incoming request
- transcription step
- planner selection
- MCP calls
- TTS calls
- final request summary

At the MCP layer, log:

- tool discovery or publication state used for the request
- incoming tool call
- validation failures
- outbound integration calls
- final execution summary

## What Is Not In Postgres

Postgres should not store:

- executable code
- auth tokens
- service URLs
- machine-specific settings

Those belong in source control or deployment configuration, depending on the type of data.

## Migration Direction

The safest migration path is:

1. extract tool discovery and execution behind an MCP server
2. define a constrained generic execution engine in source code
3. move tool metadata, integration definitions, and execution specs into Postgres
4. add strict validation between published specs and the engine's supported capabilities
5. add an admin GUI for draft, validate, publish, and rollback workflows
6. fold `pipeline-server` into the orchestrator and retire the split audio path

This gives a cleaner long-term architecture without making the runtime path less deterministic.

## Related Documents

See:

- [Tool Registry Future](./TOOL-REGISTRY-FUTURE.md)
