# Tool Registry Future

## Current State

Diakonos-Assist no longer uses a purely code-defined tool registry.

The current runtime model is:

1. tool identity lives in `tools`
2. versioned definitions live in `tool_versions`
3. published runtime rows are exposed through `published_tool_catalog`
4. `mcp-server` loads the published catalog from Postgres at startup
5. `orchestrator` uses `mcpClient.listTools()` and `callTool()` for planning and execution

In other words, the registry is already database-backed for normal tools.

## What Is Already Dynamic

The current system already supports:

- database-backed tool metadata
- immutable version history
- publish and rollback events
- planner visibility flags
- declarative execution specs stored with the tool version
- admin APIs for create, version, publish, and restart

Built-in system tools such as `system.health` and `system.echo` still remain code-native.

## Why This Matters

This is a better fit than the original code-owned registry because:

- new tools do not require code changes in the happy path
- tool behavior versions together with tool metadata
- operators can review and publish changes without editing source
- the MCP runtime stays deterministic because it still executes against a constrained engine

## Current Safety Model

The database does not store executable code.

The safety boundary today is:

- Postgres stores metadata, schemas, and execution specs
- `mcp-server` provides the constrained execution engine
- deployment config still holds secrets and machine-specific URLs
- built-in system tools remain source-controlled

That keeps the system dynamic without turning it into arbitrary remote code execution.

## What Still Feels Incomplete

The current catalog model works, but it still has room to improve.

The main gaps are:

1. stronger validation of `execution_spec` at create and publish time
2. better operator-facing previews of what a tool will actually send upstream
3. richer testing and dry-run support before publication
4. clearer runtime health visibility for published tools
5. cleaner naming in places where old `integration_*` terminology still survives in the runtime layer

## Recommended Near-Term Improvements

### Validation

Add stricter checks for:

- required execution fields
- supported auth strategy values
- allowed host definitions
- request templating shape
- response extraction shape

Validation should happen:

- when a version is created
- when a version is published
- optionally through an explicit validate action in the admin UI

### Publish-time verification

Useful additions:

- preview rendered request shape
- verify the target host is allow-listed
- optional test call against a non-destructive endpoint
- flag missing env-backed secrets before publication

### Runtime observability

Operators should be able to see:

- which tool version is currently published
- whether that tool is currently present in `mcp-server`
- last publish event
- last validation result
- last successful or failed execution summary

## Longer-Term Future

The longer-term direction is not “make tools more dynamic at any cost.” The direction is “make the current DB-backed model safer and easier to operate.”

Reasonable future additions include:

- richer execution modes beyond HTTP if there is a real product need
- first-class validation results stored in Postgres
- resource-aware planning and prompt assembly
- import/export for tool and resource definitions
- signed publication workflows or stronger audit trails if the deployment grows

## Non-Goals

The system should still not:

- store arbitrary executable code in the database
- allow the admin UI to upload runnable code
- bypass host allow-lists or auth constraints
- let the planner see unpublished or invalid tools

## Recommendation

The important shift has already happened: the registry is database-backed and publication-driven.

The next work should focus on:

1. better validation
2. better preview and testing ergonomics
3. better observability
4. removing leftover legacy terminology from the runtime layer

That improves operator experience without destabilising the core execution path.
