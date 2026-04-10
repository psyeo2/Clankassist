# Auth And Discovery

## Purpose

This document defines the intended authentication, authorisation, and local-network device discovery model for Diakonos-Assist.

The main goals are:

- keep the public network surface limited to `orchestrator`
- separate device access from admin access
- support a good onboarding UX for edge mic/speaker devices
- allow the GUI to manage MCP integrations, tools, and resources through the orchestrator

## Public Surface

Only `orchestrator` should expose application endpoints on the network.

Other services remain internal:

- `mcp-server` is spawned by the orchestrator as a subprocess over stdio
- `postgres` is internal
- `whisper-api` is internal
- `piper-api` is internal

This means both the GUI and edge devices talk to the orchestrator, but they do so with different auth models.

## Actor Model

There are two external actor types:

- admin users using the GUI
- edge devices such as microphones, speakers, and future appliance endpoints

These should not share the same credentials or route permissions.

## Auth Model

### Admin auth

Admin auth is for the GUI and any human-managed control surface.

Admin auth should be able to:

- manage integrations
- create and edit tool drafts
- publish and roll back tool versions
- manage resources
- view discovered devices
- approve or reject devices
- issue or revoke device tokens

Admin auth should not be the same mechanism as device bearer tokens.

### Device auth

Device auth is for edge devices calling normal assistant routes.

Device auth should be able to:

- call `POST /api/v1/respond`
- open `WS /api/v1/listen`
- call lightweight health or capability endpoints if needed

Device auth should not be able to:

- create or publish MCP tools
- manage integrations or resources
- approve other devices
- perform admin actions

## Recommended Credential Model

### Admin bootstrap

A hard-coded default password such as `adminadmin` is not recommended.

Preferred model:

- on first startup, there is no completed admin setup yet
- orchestrator allows a one-time setup flow
- the first admin user sets the real password in the GUI
- after setup, the setup route is no longer usable for creating the initial password again

Current implementation note:

- this is currently implemented as a singleton application auth state row, not a full multi-user admin table
- setup completion is derived from stored password hash state
- if setup has not been completed yet, normal app routes are blocked

### Admin sessions

Admin login should create an admin session token or similar server-issued credential.

That session is then used for `/api/v1/admin/*` routes.

Current implementation note:

- admin access uses bearer session tokens issued after login
- access and refresh tokens are stored hashed in `admin_sessions`
- `POST /api/v1/admin/refresh` rotates the session
- `POST /api/v1/admin/logout-all` invalidates all existing admin refresh chains

### Device tokens

Devices should receive long-lived bearer tokens issued by the orchestrator after approval.

These tokens should be:

- hashed before storage
- scoped to a specific device
- revocable
- auditable

## Route Separation

Suggested route split:

### Admin routes

- `GET /api/v1/admin/setup/status`
- `POST /api/v1/admin/setup`
- `POST /api/v1/admin/login`
- `POST /api/v1/admin/refresh`
- `POST /api/v1/admin/logout`
- `POST /api/v1/admin/logout-all`
- `GET /api/v1/admin/devices`
- `POST /api/v1/admin/devices`
- `GET /api/v1/admin/devices/:id`
- `POST /api/v1/admin/devices/:id/tokens`
- `POST /api/v1/admin/integrations`
- `POST /api/v1/admin/tools`
- `POST /api/v1/admin/tools/:toolId/versions`
- `POST /api/v1/admin/tools/:toolId/publish`
- `POST /api/v1/admin/resources`
- `POST /api/v1/admin/resources/:resourceId/versions`
- `POST /api/v1/admin/resources/:resourceId/publish`

Current implementation note:

- auth and device-token issuance routes exist now
- catalog-management routes exist as protected stubs
- discovery, approve, and reject routes are still future work

### Device routes

- `POST /api/v1/respond`
- `WS /api/v1/listen`
- `GET /api/v1/ping`

### Pairing routes

- `POST /api/v1/devices/register`
- `POST /api/v1/devices/:id/claim`

The exact route names may change, but the separation between admin-only routes and device routes should remain strict.

## Device Discovery UX

UX is a priority, so device onboarding should avoid manual token copying where possible.

Preferred flow:

1. Unpaired edge device starts up.
2. Device advertises itself on the local network using mDNS / Bonjour.
3. User opens the GUI and clicks `Scan for new devices`.
4. GUI calls an admin-only orchestrator endpoint such as `POST /api/v1/admin/devices/discover`.
5. Orchestrator performs a short-lived discovery scan and returns discovered unpaired devices.
6. User selects a device and clicks approve.
7. Orchestrator issues a device token and completes pairing.
8. Device stores the token and stops advertising itself as unpaired.

This is the intended high-UX path.

## Discovery Transport

Devices should advertise themselves, not the orchestrator.

Recommended discovery mechanism:

- mDNS / Bonjour service advertisement

Suggested service name:

- `_diakonos-device._tcp.local`

Suggested metadata in TXT records:

- device id
- display name
- model
- hostname
- capabilities such as `mic` and `speaker`
- pairing port
- pairing protocol version

This allows the orchestrator to find nearby devices when the admin explicitly requests a scan.

## Pairing Completion

Discovery alone is not enough. The approved device still needs to receive its issued token.

Preferred pairing completion model:

- unpaired device exposes a tiny temporary pairing endpoint
- after admin approval, orchestrator sends the issued device token to that endpoint
- device stores the token securely
- device switches from `unpaired` to `paired`
- device stops advertising itself as discoverable

This keeps onboarding mostly automatic from the user's point of view.

## Why Not Blind Network Scanning

Blind scanning of the whole subnet is not the preferred design.

Reasons:

- noisy
- slow
- less reliable
- more likely to fail on stricter networks
- worse from a UX and security point of view

Discovery should be explicit and constrained:

- devices advertise themselves
- orchestrator scans only when the admin asks

## Fallbacks

mDNS works well on a normal local subnet, but it is not universal.

Fallback options should exist for:

- routed networks
- VLAN-separated environments
- environments where mDNS is blocked

Recommended fallbacks:

- manual add by IP or hostname
- QR code or copy-paste bootstrap URL for device setup
- optional manual pairing code

These are fallback paths, not the preferred default UX.

## Authorisation Rules

### GUI / admin capabilities

GUI-authenticated admins may:

- discover devices
- approve devices
- revoke device tokens
- manage integrations
- manage tools
- manage resources
- inspect publication state

### Device capabilities

Device-authenticated clients may:

- call response endpoints
- open listen sessions
- identify themselves with device metadata

Devices may not:

- access `/api/v1/admin/*`
- publish catalog changes
- issue tokens

## Data Model Direction

The auth and discovery model likely needs more structure than a single generic token table.

Current implemented entities:

- `app_auth_state`
- `admin_sessions`
- `devices`
- `device_tokens`

Future likely entities:

- `device_discovery_events`
- optional richer admin-user model if multi-user admin support is needed later

Device tokens should be tied to a device record rather than treated as generic user-style API keys.

## Relationship To MCP Catalog Management

The original goal is to allow a GUI to create and manage MCP integrations, tools, and resources through the orchestrator.

That means:

- orchestrator exposes admin CRUD APIs for catalog management
- orchestrator writes drafts and publication state to Postgres
- `mcp-server` remains runtime read-only against the published catalog

Catalog management should always be admin-authenticated, never device-authenticated.

## Summary

The intended model is:

- orchestrator is the only public app service
- GUI uses admin auth
- edge devices use device tokens
- device onboarding is driven by mDNS discovery plus admin approval
- pairing completes by sending the issued token to a temporary device pairing endpoint
- MCP catalog management lives behind admin-only orchestrator routes
