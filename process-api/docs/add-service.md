# Adding a Service

This document explains how to add a new service to `process-api`.

The service model used in this project is:

1. define planner-facing tools
2. add the real integration client
3. add executor bindings
4. add environment variables
5. verify speech mode and direct mode

The important rule is:

- `src/tools/*` defines what the LLM may choose
- `src/integrations/*` defines how the API really talks to the service
- `src/tools/executors.ts` connects the two

## 1. Decide The User-Facing Capability

Start with the user request, not the remote API.

Good examples:

- "what is my GPU temperature?"
- "request Severance in Jellyseerr"
- "what is my UPS battery level?"

Bad examples:

- "POST `/api/v1/request` with these fields"
- "call endpoint X with payload Y"

The planner should choose high-level tools, not raw HTTP requests.

## 2. Add Tool Definitions

Create or extend a file in `src/tools/definitions/`.

Examples already present:

- [gpu.ts](/process-api/src/tools/definitions/gpu.ts)
- [jellyseerr.ts](/process-api/src/tools/definitions/jellyseerr.ts)
- [system.ts](/process-api/src/tools/definitions/system.ts)

Each tool definition should include:

- `name`
- `integration`
- `description`
- `parameters`
- `executionSummary`

Guidelines:

- keep tool names stable and explicit
- use small, high-level actions
- keep parameters minimal
- do not define raw API payloads here

Example:

```ts
{
  name: "ups.get_battery_level",
  integration: "ups",
  description: "Get the current UPS battery level.",
  parameters: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  executionSummary: "Reads the current UPS battery level from the UPS exporter.",
}
```

## 3. Register The Tool Definition

Update [registry.ts](/process-api/src/tools/registry.ts) to include the new definition set.

That makes the tool discoverable by:

- speech mode
- direct mode validation
- runtime availability filtering

If the service is optional, add availability checks in `isToolAvailable()`.

Example:

```ts
case "ups":
  return isConfigured("UPS_API_URL");
```

This prevents speech mode from advertising tools that are not actually runnable.

## 4. Add The Integration Client

Create a new folder under `src/integrations/`.

Examples already present:

- [gpuStatus](/process-api/src/integrations/gpuStatus/client.ts)
- [jellyseerr](/process-api/src/integrations/jellyseerr/client.ts)

What belongs here:

- base URL handling
- auth headers
- request and response types
- HTTP calls
- response parsing

What does not belong here:

- LLM prompt logic
- tool selection logic
- tool schema definitions

If the remote API has meaningful request and response shapes, add local types in the integration folder.

## 5. Add Executor Logic

Update [executors.ts](/process-api/src/tools/executors.ts).

Each executor should:

1. validate or normalise runtime args if needed
2. call the integration client
3. shape the result for the API
4. return a short `speech` string

The executor output shape is:

```ts
{
  tool: string;
  integration: string;
  result: Record<string, unknown>;
  speech: string;
}
```

Keep the `speech` field short and directly usable by the voice assistant.

## 6. Add Environment Variables

Update:

- [.env.example](/process-api/.env.example)
- your local `.env`

Add only what the integration actually needs:

- base URL
- API key
- optional user ID
- metric names

If the service is optional, make sure speech mode availability filtering reflects the required env vars.

## 7. Verify Direct Mode First

Before relying on oLLaMa, test the tool directly.

Example:

```json
{
  "tool": "ups.get_battery_level",
  "args": {}
}
```

Send that to:

```text
POST /api/v1/process
```

This isolates:

- validation
- executor logic
- integration calls

without involving the planner.

## 8. Verify Speech Mode

After direct mode works, test speech mode with natural language.

Example:

```json
{
  "speech": "what is my ups battery level?"
}
```

Check:

- the planner selects the expected tool
- the tool executes successfully
- the response text sounds natural
- unsupported requests do not get forced into the new service accidentally

## 9. Logging Expectations

When `LOG_LEVEL=INFO`, adding a service should produce request-scoped logs for:

- incoming request
- planner selection
- outbound API calls
- final request summary

Use the shared HTTP helpers where possible so outbound request logging stays consistent.

## 10. Checklist

Use this checklist when adding a new service:

- add tool definitions in `src/tools/definitions/`
- register the definitions in `src/tools/registry.ts`
- add availability checks if the service is optional
- add the integration client in `src/integrations/`
- add request/response types if needed
- bind executors in `src/tools/executors.ts`
- add env vars to `.env.example`
- test direct mode
- test speech mode
- verify logging output

## Notes

If a service is simple, keep it simple.

Not every integration needs a large abstraction stack. The important thing is keeping the responsibility split clear:

- planner metadata in `src/tools`
- real API logic in `src/integrations`
- orchestration in `src/controllers/process.ts`
