# Tools Layer

This folder contains planner-facing tool metadata and the central tool registry.

## Purpose

- `definitions/` contains typed tool definitions exposed to the LLM planner.
- `registry.ts` builds the in-memory catalog used by the application.
- `types.ts` contains shared tool and planner output types.

## What belongs here

- tool names
- tool descriptions
- tool argument schemas
- integration names
- planner output contract

## What does not belong here

- environment variable values
- raw HTTP request examples for third-party APIs
- integration client code
- secrets or API keys

Those belong in `.env`, `.env.example`, and future integration client modules.
