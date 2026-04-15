# MCP Restructure

## Status

The major restructure described here is largely complete.

The platform now has the intended broad shape:

- `orchestrator` owns planning, governance, auth, and user-facing HTTP/websocket routes
- `mcp-server` owns runtime tool registration and execution
- Postgres stores tool definitions, versions, resources, and publication state
- published tool execution is driven by tool-owned `execution_spec`

This document now describes the achieved state and the remaining cleanup.

## 1) Required Features

This section separates responsibilities by scope.

### MCP server required features

1. Dynamic tool registry from Postgres published catalog.
2. Load only active/published tool definitions from catalog.
3. Direct deterministic execution of a chosen tool with explicit args.
4. Strict input/result schema support.
5. Safe outbound execution controls: allowed hosts, timeout, auth handling.
6. Structured output support for machine-consumable results.
7. Stable runtime behaviour during catalog updates.

### Platform/orchestrator features (outside MCP server core)

1. Optional planner-based selection from available tools.
2. Human-friendly final response text generation.
3. Admin GUI for create/edit/version/publish workflows.
4. Version lifecycle governance: draft, validated, published, archived.
5. Publish, rollback, and audit history.

## 2) Current System And How It Achieves Features

### Architecture summary

- `tools` stores identity, enablement, planner visibility, and current published version pointer.
- `tool_versions` stores schema, execution summary, execution mode, and full `execution_spec`.
- `resources` and `resource_versions` provide the same publication model for resources.
- MCP server loads `published_tool_catalog` and `published_resource_catalog` from Postgres.
- The generic executor reads execution details from the published tool definition itself.

### What works well today

1. Dynamic registration: MCP server loads published rows and registers tools at boot.
2. Governance: publish/rollback lifecycle already exists and is auditable.
3. Generic runtime: execution supports templating, refs, env lookup, response extraction, and format shaping.
4. Planner compatibility: orchestrator can list tools and select one via LLM.
5. Direct execution path: tool can still be called explicitly by name with args.

### Current pain points

1. Some runtime names still carry old `integration_*` terminology even though tools own execution now.
2. Validation of `execution_spec` is still looser than it should be.
3. Admin UX can do more to preview, validate, and explain execution behaviour before publish.
4. There are not enough automated regression tests around catalog publication and generic execution.

## 3) Target Model

### Core principle

**Each tool version owns its complete execution definition.**

A published tool version is self-contained and runnable.

### Target data model

1. Keep `tools` as identity and publish pointer.
2. Keep `tool_versions` as versioned source of truth.
3. Keep `execution_spec` as the executable source of truth for generic tools.
4. Keep `resources` and `resource_versions` on the same publication pattern.

### Target runtime model

1. MCP server still loads published tools from Postgres at startup.
2. Registry build is unchanged in concept: loop rows, register each tool.
3. Generic executor reads only tool version execution spec.
4. Built-in tools remain code-native.

### Why this is closer to standard MCP

1. A tool is the executable unit.
2. Tool metadata and behavior version together.
3. Registration and execution are directly tied to tool definitions rather than a separate required model layer.

## 4) What Has Already Changed

These changes are already reflected in the current repo:

- tools no longer depend on a separate integrations table
- `tool_versions.execution_spec` carries the execution definition
- `published_tool_catalog` is built from tool and version rows
- admin routes exist for tools, versions, resources, publish, and MCP restart
- `mcp-server` loads published tool definitions from Postgres
- `orchestrator` plans against MCP-listed tools instead of a code-owned registry

## 5) Remaining Work

The restructure is not fully finished until the following cleanup lands:

1. Tighten `execution_spec` validation at create and publish time.
2. Add richer operator tooling for preview and validation before publication.
3. Remove or rename leftover `integration_*` terminology in runtime types where it no longer reflects the real model.
4. Add stronger regression coverage around generic executor behaviour, publication, and MCP reload.
5. Keep frontend UX aligned with the tool-owned execution model.

## 6) Acceptance Criteria

The restructure can be treated as complete when all of the following are true:

1. New tools can be created and published without any separate integration entity.
2. A published tool version contains all data needed to execute.
3. MCP server registry still loads from the Postgres published catalog.
4. Direct execution by explicit tool name works.
5. Planner mode still works and only sees valid published tools.
6. Validation and safety controls are strong enough to reject malformed execution specs before publication.
7. The remaining docs, naming, and UI no longer imply an old integration-owned execution model.

## 7) Risks And Mitigations

1. Risk: malformed execution specs.
	- Mitigation: strict validation at tool-version creation and publish time.
2. Risk: migration regressions in existing tools.
	- Mitigation: publish-time verification plus regression tests per published tool.
3. Risk: temporary UI confusion during transition.
	- Mitigation: phase UI changes with explicit deprecation messaging.

## 8) Recommendation

Treat the schema and runtime migration as done.

The next work should focus on quality:

1. validation
2. previewability
3. testing
4. cleanup of stale naming and docs
