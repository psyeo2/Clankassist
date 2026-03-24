# Tool Registry Future

## Why Consider A Database-Backed Registry

The current tool registry is code-defined.

That is good for:

- speed
- type safety
- simple local iteration

But it has limits:

- every tool change requires a code change
- adding services remains a developer task
- operations and non-developers cannot safely manage tool availability
- it is harder to inspect or review tool metadata outside the codebase

For a larger homelab assistant, a database-backed registry becomes attractive.

## Current Model

Today the tool pipeline is:

1. tool definitions live in source code
2. the registry loads them at startup
3. executors are bound in code
4. availability is decided from env configuration

This is deterministic, simple, and safe, but static.

## Future Model

A stronger future model would be:

1. tool metadata stored in a database
2. executor implementations still stored in code
3. tool publication done through a deterministic approval pipeline
4. an admin GUI used to create, review, and publish tools

This is an important distinction:

- metadata can move to a database
- execution code should remain in version-controlled source

The system should not allow arbitrary code execution from the database.

## Recommended Split

### In the database

Store:

- tool name
- description
- integration key
- argument schema
- enabled/disabled state
- planner visibility
- metadata version
- human notes

### In source code

Keep:

- executor implementations
- integration clients
- validation helpers
- hard safety checks
- allow-list of executable integration keys

### In deployment config

Keep:

- service URLs
- auth tokens
- secrets
- machine-specific settings

## Deterministic Tool Addition Process

If this moves to a database, the tool-addition process should still be deterministic.

The recommended flow is:

1. create integration code in source control
2. bind the executor in source control
3. expose a known integration key
4. create or edit tool metadata in an admin interface
5. validate the metadata against the executor contract
6. publish the tool
7. make it visible to the planner

That gives you:

- dynamic metadata
- static executable code
- predictable rollout

## Why Determinism Matters

Without a deterministic process, the database can become a source of silent drift:

- planner-visible tools that have no executor
- argument schemas that do not match runtime validation
- old tools left enabled after integrations change
- duplicate or conflicting tool names

That would quickly degrade planner quality and operational safety.

## Suggested Database Entities

If you go this route, a minimal schema might include:

### `integrations`

- `key`
- `display_name`
- `executor_key`
- `enabled`

### `tools`

- `name`
- `integration_key`
- `description`
- `argument_schema_json`
- `execution_summary`
- `planner_enabled`
- `created_at`
- `updated_at`
- `version`

### `tool_versions`

- immutable historical versions of tool metadata

### `tool_publish_events`

- audit trail of who changed what and when

## Suggested Vue Admin GUI

A Vue GUI would make sense for:

- creating tool metadata
- editing descriptions and schemas
- toggling planner visibility
- previewing the final planner-facing JSON
- validating against registered executors
- publishing changes

Good UI sections would be:

### 1. Integrations

Shows:

- known integrations from code
- whether they are configured
- whether they are healthy

### 2. Tools

Shows:

- tool name
- integration
- enabled state
- planner visibility
- version

### 3. Tool Editor

Allows:

- editing description
- editing argument schema
- testing validation
- previewing planner-visible output

### 4. Publish Workflow

Allows:

- draft
- validate
- publish
- rollback

## Safety Model

The GUI should never:

- upload executable code
- define arbitrary executor logic
- bypass integration allow-lists

The GUI should only manage metadata for executors that already exist in code.

That keeps the system operationally flexible without turning it into remote code execution.

## Migration Path

If you want to move toward this gradually, the safest path is:

1. keep executor code exactly where it is
2. move only tool metadata into a persistent store
3. generate the in-memory planner catalogue from DB records
4. validate every DB record against known executor bindings at startup
5. refuse to expose invalid tools to the planner

This gives you a much better operator experience without destabilising the runtime path.

## Recommendation

Do not start with a fully dynamic registry.

Start with:

- code-owned executors
- DB-owned metadata
- strict startup validation
- a GUI that edits drafts and publishes only valid metadata

That is the safest path to a more ergonomic tool-management model.
