# Process API

This project is intended to be a small voice-assistant backend.

The main job of the API is not just to expose REST endpoints. The intended core flow is:

1. Accept a natural-language string from the client.
2. Use an LLM to determine what the user is asking for.
3. Select the correct backend tool or integration.
4. Execute that tool with the right arguments.
5. Return a structured response containing:
   - a status
   - a message
   - data
   - a short response string for the voice assistant to speak

At the moment, the health route is implemented and the `process` route exists only as the beginning of this flow.

## Current Runtime Structure

The API is an Express + TypeScript service with:

- global request logging
- versioned routing via `/api/v<version>`
- consistent JSON responses
- centralized 404 and error handling
- a basic health endpoint

The app is mounted under `/api/v<API_VERSION>`, for example `/api/v1`.

## Implemented Routes

- `GET /api/v1/ping`
- `POST /api/v1/process` supports two modes:
  - `speech` mode: sends the `speech` string to oLLaMa, receives a tool selection, then executes that tool
  - direct execution mode: accepts a selected tool plus args and executes it through the tool executor layer

Example health response:

```json
{
  "status": 200,
  "message": "Ok",
  "data": {
    "uptime": 12.345
  }
}
```

## Intended `process` Flow

The intended behavior of `src/controllers/process.ts` appears to be:

1. Read `req.body.speech`.
2. Validate that it is a non-empty string.
3. Send that string to oLLaMa with a list of available tools.
4. Have the model choose the most appropriate tool and arguments.
5. Execute the selected tool in application code.
6. Convert the tool result into a stable API response for the client and a compact voice response for the assistant to say aloud.

In other words, `process` is supposed to be an orchestration endpoint, not a business-logic endpoint by itself.

The controller should eventually act as a coordinator between:

- the user utterance
- the LLM planner
- the tool registry
- the concrete integration clients
- the final voice-friendly response

## `process` Modes

`POST /api/v1/process` currently works in two distinct ways.

### Speech mode

Request shape:

```json
{
  "speech": "what temp is my gpu at the moment?"
}
```

Flow:

1. The API reads `speech`.
2. The API sends the request plus the available tool definitions to oLLaMa.
3. oLLaMa returns JSON containing:
   - `tool`
   - `args`
   - `response`
4. The API validates the selected tool.
5. The API executes the selected tool.
6. The API returns the execution result plus a short spoken response.

Important:

- speech mode depends on both `OLLAMA_URL` and `OLLAMA_MODEL`
- if the configured model does not exist on the oLLaMa instance at `OLLAMA_URL`, the API will return the upstream oLLaMa error
- speech mode does not work unless the configured oLLaMa host is the one that actually has the model pulled

### Direct execution mode

Request shape:

```json
{
  "tool": "gpu.get_temp",
  "args": {}
}
```

or:

```json
{
  "selection": {
    "tool": "gpu.get_temp",
    "args": {}
  }
}
```

Flow:

1. The client provides the tool name directly.
2. The API skips oLLaMa entirely.
3. The API validates and executes the tool immediately.

Important:

- direct mode is useful for testing the executor and integration path without involving the planner
- direct mode can succeed even when speech mode fails, because it does not call oLLaMa

## Tools Layer

The old `src/toolSchemas` approach was directionally correct but structurally weak.

The useful idea was:

- define the tools that the LLM is allowed to choose from
- describe each tool using a name, description, and argument schema

The problems were:

- the files were loose JSON with no TypeScript typing
- `values.txt` mixed runtime configuration into source code
- there was no central registry that application code could actually use
- there was no single source of truth for planner output and tool lookup

The project now uses `src/tools/` instead.

`src/tools/` is the right place for planner-facing tool metadata because:

- it is application source
- it is close to the future orchestration logic
- it can be strongly typed

The current structure is:

```text
src/tools/
  definitions/    Typed tool definitions grouped by integration
  index.ts        Public exports
  registry.ts     Central catalog and lookup helpers
  types.ts        Shared tool types
```

This is a better fit than keeping the old `toolSchemas` folder.

## What Exists Now

There are now three separate layers:

1. Tool definitions in `src/tools/definitions/*`
They describe what the planner is allowed to select.

2. Tool executors in `src/tools/executors.ts`
They map a selected tool to real application code.

3. Integration clients in `src/integrations/*`
They contain the real external API request and response types.

This means the project now has both:

- planner-facing schemas
- execution-facing clients

That separation is intentional.

## Likely Architecture Going Forward

The cleanest mental model is:

### 1. Planner layer

This is the oLLaMa step.

Input:

- raw user speech
- the list of available tools
- instructions telling the model to return only a tool selection plus arguments

Output:

- a structured object such as:

```json
{
  "tool": "gpu.get_temp",
  "args": {}
}
```

or:

```json
{
  "tool": "jellyseerr.request_media",
  "args": {
    "title": "Severance"
  }
}
```

### 2. Tool registry layer

This should be normal application code, not the LLM.

It maps tool names to real executor functions, for example:

- `gpu.get_temp` -> call the GPU exporter client
- `jellyseerr.request_media` -> search Jellyseerr, identify the media item, then submit the request

### 3. Executor layer

This sits between tool selection and the integration clients.

Its job is to:

- validate the selected tool arguments
- call the correct integration client
- shape the final result
- generate a voice-friendly `speech` string

### 4. Integration client layer

Each backend integration should live behind its own small client:

- GPU exporter client
- Jellyseerr client
- later: more services

This is where URLs, auth keys, request formats, and response parsing should live.

### 5. Response formatter layer

After the tool returns data, the API should build a stable response object for the frontend and voice assistant.

A likely shape would be:

```json
{
  "status": 200,
  "message": "Success",
  "data": {
    "tool": "gpu.get_temp",
    "result": {
      "temperatureC": 58
    },
    "speech": "Your GPU is currently 58 degrees Celsius."
  }
}
```

## How To Think About GPU vs Jellyseerr

The GPU exporter is the simpler case.

The model mostly needs to:

- recognize that the user is asking about GPU state
- choose the correct tool
- provide empty or trivial arguments

The application code then calls the exporter and returns the result.

Jellyseerr is more complicated because tool selection alone is not enough.

For Jellyseerr, the model probably only needs to identify intent and extract request parameters such as:

- media title
- maybe media type
- maybe year

The application code should then do the real work:

1. search Jellyseerr for candidate matches
2. resolve ambiguity
3. submit the actual request
4. return a voice-friendly summary

That means the LLM should not be constructing raw Jellyseerr HTTP requests directly.

It should only choose a high-level tool and fill the arguments for that tool.

## Tool Registry

The registry now lives in `src/tools/registry.ts`.

Its job is to:

- expose the full list of available tools to the planner
- provide name-based lookup for a selected tool
- define the expected planner output shape

This is the right abstraction boundary:

- `src/tools/definitions/*` defines what tools exist
- `src/tools/registry.ts` is the source of truth for discovery and lookup
- `src/tools/executors.ts` binds tool names to executable logic
- `src/integrations/*` contains the real HTTP/API schemas and clients

## What Should And Should Not Live In `src/tools`

What should live there:

- tool names
- tool descriptions
- argument schemas
- integration grouping
- planner output contracts

What should not live there:

- environment variable values
- API keys
- raw request examples copied from third-party APIs
- the actual HTTP integration logic

Those belong in `.env`, `.env.example`, and future integration client modules.

## External API Schemas

The actual call schemas now live with the integration clients, not in `src/tools`.

Examples:

- `src/integrations/gpuStatus/client.ts` contains the real GPU exporter fetch and metrics parsing logic
- `src/integrations/jellyseerr/types.ts` contains the request and response shapes used for Jellyseerr calls
- `src/integrations/jellyseerr/client.ts` contains the actual Jellyseerr HTTP methods

This is the intended split:

- `src/tools/*` answers "what can the planner select?"
- `src/integrations/*` answers "how do we actually call the service?"
- `src/tools/executors.ts` answers "what application code runs when that tool is selected?"

## Direct Execution Testing

`POST /api/v1/process` can execute a tool directly without going through oLLaMa.

Example request:

```json
{
  "tool": "gpu.get_temp",
  "args": {}
}
```

Example request using the planner-style wrapper:

```json
{
  "selection": {
    "tool": "jellyseerr.request_media",
    "args": {
      "title": "Severance",
      "mediaType": "tv"
    }
  }
}
```

## Current Gaps

The following pieces are not implemented yet:

- there is no retry, fallback, or clarification path if the planner picks the wrong tool or returns invalid output
- there is not yet a persistent conversation or clarification flow for ambiguous requests
  This means a wrong tool choice or a missing model currently fails the request instead of triggering a follow-up question.

## Environment Variables

Current known environment variables:

```env
PORT=3001
API_VERSION=1
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:4b
GPU_EXPORTER_URL=http://192.168.1.161:9400
GPU_TEMPERATURE_METRIC=DCGM_FI_DEV_GPU_TEMP
GPU_VRAM_USED_METRIC=DCGM_FI_DEV_FB_USED
GPU_VRAM_FREE_METRIC=DCGM_FI_DEV_FB_FREE
GPU_VOLATILE_UTILISATION_METRIC=DCGM_FI_DEV_GPU_UTIL
JELLYSEERR_API_URL=http://192.168.1.56:5055
JELLYSEERR_API_KEY=
JELLYSEERR_REQUEST_USER_ID=
```

## Scripts

- `npm run dev` starts the API with `nodemon` and `ts-node`
- `npm run build` compiles TypeScript to `dist/`
- `npm run start` runs the compiled server
- `npm run typecheck` runs TypeScript without emitting output

## Project Structure

```text
src/
  controllers/     Express route handlers
  integrations/    External service clients and API request/response types
  middlewares/     Request logging, 404 handling, error handling
  router/          Route registration
  tools/           Tool definitions, planner contracts, and the registry
  utils/           Shared response helpers
  index.ts         App bootstrap
```
