# MCP Restructure Plan

## Goal

Align the platform with standard MCP practices while preserving the product requirements that already work well:

- MCP server loads and executes the active Postgres-backed tool catalog
- explicit direct tool execution (without planner)
- orchestrator-owned planner, governance, and admin workflows

The target state is **tool-owned execution**. Integrations are removed as a required model layer. MCP remains focused on active catalog registration + execution, while lifecycle governance stays outside MCP core.

## 1) Required Features

This section separates responsibilities by scope.

### MCP server required features

1. Dynamic tool registry from Postgres published catalog.
2. Load only active/published tool definitions from catalog.
3. Direct deterministic execution of a chosen tool with explicit args.
4. Strict input/result schema support.
5. Safe outbound execution controls: allowed hosts, timeout, auth handling.
6. Structured output support for machine-consumable results.
7. Backward-compatible operational migration with low downtime.

### Platform/orchestrator features (outside MCP server core)

1. Optional planner-based selection from available tools.
2. Human-friendly final response text generation.
3. Admin GUI for create/edit/version/publish workflows.
4. Version lifecycle governance: draft, validated, published, archived.
5. Publish, rollback, and audit history.

## 2) Current System and How It Achieves Features

### Architecture summary

- A separate `integrations` table stores shared HTTP config (base_url, auth strategy, auth config, headers, host allow-list, timeout).
- `tools` references an integration.
- `tool_versions` stores schema and `execution_spec`.
- MCP server loads `published_tool_catalog` and runs a generic HTTP executor.

### What works well today

1. Dynamic registration: MCP server loads published rows and registers tools at boot.
2. Governance: publish/rollback lifecycle already exists and is auditable.
3. Generic runtime: execution supports templating, refs, env lookup, response extraction, and format shaping.
4. Planner compatibility: orchestrator can list tools and select one via LLM.
5. Direct execution path: tool can still be called explicitly by name with args.

### Current pain points

1. MCP model drift: tool behavior is split across two entities (tool + integration), which is not MCP-native.
2. Extra operational overhead: creating a tool requires integration setup, even when not reusable.
3. Cognitive overhead in UI and API: users must understand integration/tool linkage.
4. More moving parts than needed for most tools.

## 3) Ideal System and How It Would Achieve Features

## Core principle

**Each tool version owns its complete execution definition.**

No mandatory integration entity. A published tool version is self-contained and runnable.

### Target data model

1. Keep `tools` as identity and publish pointer.
2. Keep `tool_versions` as versioned source of truth.
3. Expand `tool_versions.execution_spec` (or add typed columns) to include all execution details currently living in integrations:
	- transport/mode
	- base URL
	- auth strategy/config
	- default headers
	- allowed hosts
	- timeout
	- request and response mapping
4. Remove integration join dependency from published tool view.

### Target runtime model

1. MCP server still loads published tools from Postgres at startup.
2. Registry build is unchanged in concept: loop rows, register each tool.
3. Generic executor reads only tool version execution spec.
4. Built-in tools remain code-native.

### Why this is closer to standard MCP

1. A tool is the executable unit.
2. Tool metadata and behavior version together.
3. Registration and execution are directly tied to tool definitions, not a secondary service entity.

## 4) Necessary Changes to Get There

This is an incremental sequence that preserves service continuity.

### Phase A: Schema and catalog changes

1. Remove `integration_id` dependency from `tools` (or make nullable during migration).
2. Add any missing execution fields into `tool_versions.execution_spec` payload contract.
3. Update `published_tool_catalog` view to source all execution data from tool versions only.
4. Keep old integration objects temporarily for migration reads only.

### Phase B: API contract changes

1. Replace create-tool dependency on integration selection.
2. Update create-tool-version API to accept full execution config.
3. Keep legacy endpoints for one migration window (read-only or deprecated behavior).
4. Add validation rules for execution spec completeness at tool-version creation time.

### Phase C: Executor and MCP loading

1. Update catalog loader types to stop expecting integration fields.
2. Update generic executor context to read execution config from the tool version.
3. Keep current extraction features (json_path, text, prometheus_metric, templates).
4. Keep existing safety gates (allowed hosts, timeout, auth strategy handling).

### Phase D: Frontend admin UX

1. Remove Integrations tab and integration CRUD flows.
2. In tool version form, surface execution config sections:
	- Request (method/path/query/body)
	- Auth
	- Headers
	- Timeout
	- Host allow-list
	- Response extraction/formatting
3. Keep publish/rollback UX as-is.

### Phase E: Data migration

1. For each tool version, denormalize current integration settings into execution_spec.
2. Validate migrated versions against the new execution-spec schema.
3. Rebuild published view and restart orchestrator/MCP server.
4. Remove integrations table and related indexes/routes after verification.

### Phase F: Planner and direct execution behavior

1. Keep planner consuming `mcpClient.listTools()`.
2. Preserve explicit direct execution by tool name and args.
3. Maintain unsupported-request handling behavior.

## Acceptance Criteria

The restructure is complete when all of the following are true:

1. New tools can be created and published without creating an integration.
2. A published tool version contains all data needed to execute.
3. MCP server registry still loads from Postgres published catalog.
4. Direct execution by explicit tool name works.
5. Planner mode still works and only sees valid published tools.
6. Safety controls and auth behaviors are unchanged or improved.
7. Integration tables/routes are no longer required for runtime operation.

## Risks and Mitigations

1. Risk: malformed execution specs.
	- Mitigation: strict validation at tool-version creation and publish time.
2. Risk: migration regressions in existing tools.
	- Mitigation: scripted backfill + verification tests per published tool.
3. Risk: temporary UI confusion during transition.
	- Mitigation: phase UI changes with explicit deprecation messaging.

## Recommended Implementation Strategy

1. Implement dual-read runtime first (new tool-owned spec preferred, integration fallback).
2. Migrate data.
3. Flip APIs/UI to tool-owned only.
4. Remove fallback and integrations.

This delivers the target MCP-aligned model with minimal service interruption.
