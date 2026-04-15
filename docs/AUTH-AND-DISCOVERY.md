# Auth And Discovery

## Purpose

This document defines the current auth model and the intended device onboarding model for Diakonos-Assist.

The main goals are:

- keep the public network surface limited to `orchestrator`
- separate admin access from device access
- support a good onboarding UX for edge voice devices
- keep catalog management behind admin-only routes

## Public Surface

Only `orchestrator` should expose application endpoints on the network.

Other services remain internal:

- `mcp-server` is spawned by the orchestrator as a subprocess over stdio
- `postgres` is internal
- `whisper-api` is internal
- `piper-api` is internal

This means both the GUI and edge devices talk to the orchestrator, but they do so with different credentials and different route permissions.

## External Actors

There are two external actor types:

- admin users using the GUI or admin API
- edge devices such as voice nodes and future appliance endpoints

These must not share credentials.

## Current Auth Model

### Admin auth

Admin auth is for the GUI and any human-managed control surface.

Current implementation:

- initial setup is completed through `GET /api/v1/admin/setup/status` and `POST /api/v1/admin/setup`
- admin login returns bearer access and refresh tokens
- refresh rotates session state
- logout and logout-all revoke current or all refresh chains
- admin sessions are stored hashed in `admin_sessions`

Admin auth is used for:

- catalog management
- device management
- MCP restart
- future discovery and pairing approval flows

### Device auth

Device auth is for paired edge devices.

Current implementation:

- devices are represented in the `devices` table
- long-lived bearer tokens are issued per device and stored hashed in `device_tokens`
- device-facing routes require a valid device bearer token

Device auth is used for:

- `POST /api/v1/respond`
- `WS /api/v1/listen`
- `GET /api/v1/ping`
- `GET /api/v1/tools`
- passthrough helper routes such as Whisper and Piper if you choose to expose them to devices

Device auth must not be able to:

- access `/api/v1/admin/*`
- create or publish tools or resources
- issue or revoke tokens
- restart MCP

## Route Separation

### Admin routes currently implemented

- `GET /api/v1/admin/setup/status`
- `POST /api/v1/admin/setup`
- `POST /api/v1/admin/login`
- `POST /api/v1/admin/refresh`
- `POST /api/v1/admin/logout`
- `POST /api/v1/admin/logout-all`
- `GET /api/v1/admin/tools`
- `POST /api/v1/admin/tools`
- `GET /api/v1/admin/tools/:toolId/versions`
- `POST /api/v1/admin/tools/:toolId/versions`
- `POST /api/v1/admin/tools/:toolId/publish`
- `GET /api/v1/admin/resources`
- `POST /api/v1/admin/resources`
- `GET /api/v1/admin/resources/:resourceId/versions`
- `POST /api/v1/admin/resources/:resourceId/versions`
- `POST /api/v1/admin/resources/:resourceId/publish`
- `POST /api/v1/admin/mcp/restart`
- `GET /api/v1/admin/devices`
- `POST /api/v1/admin/devices`
- `GET /api/v1/admin/devices/:id`
- `POST /api/v1/admin/devices/:id/tokens`

### Device routes currently implemented

- `GET /api/v1/ping`
- `POST /api/v1/respond`
- `WS /api/v1/listen`
- `GET /api/v1/tools`
- `POST /api/v1/process`
- `POST /api/v1/whisper/transcribe`
- `GET /api/v1/piper/voices`
- `POST /api/v1/piper/synthesise`

The last four are still device-authenticated in the current router, even though `/respond` and `/listen` are the main product-facing paths.

## Device Identity Model

The canonical application identity for a paired device is `device_id`, and it is assigned by the orchestrator during approval or signup.

Rules:

- devices must not use MAC addresses as application identity
- unpaired devices should expose only a temporary bootstrap handle or pairing code
- the bootstrap handle exists only to help humans distinguish unpaired devices during discovery
- after pairing, devices should persist the orchestrator-issued `device_id` and bearer token

## Discovery And Pairing

Discovery and pairing are not fully implemented in the orchestrator yet, but the intended model is settled enough to document.

### Preferred onboarding flow

1. An unpaired device joins the user's Wi-Fi network.
2. The device advertises itself over mDNS / Bonjour.
3. The GUI asks the orchestrator to scan for discoverable devices.
4. The orchestrator returns unpaired devices identified by temporary bootstrap handles or pairing codes.
5. The admin approves a selected device.
6. The orchestrator creates the canonical `device_id` and issues a device token.
7. The orchestrator sends `device_id` plus token to the device's temporary pairing endpoint.
8. The device stores them securely, switches to paired mode, and opens authenticated `/listen` sessions.

### Discovery transport

Recommended discovery mechanism:

- mDNS / Bonjour service advertisement

Suggested service name:

- `_diakonos-device._tcp.local`

Suggested TXT metadata for unpaired devices:

- `bootstrap_id`
- `pairing_code`
- `display_name`
- `model`
- `fw_version`
- `hostname`
- `capabilities`
- `pairing_port`
- `pairing_protocol_version`
- `pairing_state=unpaired`

### Pairing completion

Preferred pairing completion model:

- unpaired device exposes a tiny temporary pairing endpoint
- after admin approval, the orchestrator sends the issued `device_id` and device token to that endpoint
- the device stores them securely
- the device switches from `unpaired` to `paired`
- the device stops advertising itself as unpaired

### Fallbacks

Recommended fallbacks:

- manual add by IP or hostname
- QR code or copy-paste bootstrap URL for setup
- manual pairing code

These are fallback paths, not the preferred default UX.

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
- the orchestrator scans only when the admin asks

## Authorisation Rules

### Admin capabilities

Admin-authenticated clients may:

- manage tools and tool versions
- manage resources and resource versions
- publish catalog changes
- restart MCP
- manage device records
- issue or revoke device tokens
- inspect auth and publication state

### Device capabilities

Device-authenticated clients may:

- call response endpoints
- open listen sessions
- identify themselves through authenticated metadata such as `hello`
- use lightweight helper routes when intentionally exposed

Devices may not:

- access `/api/v1/admin/*`
- publish catalog changes
- mint credentials
- manage other devices

## Data Model Direction

Current implemented entities:

- `app_auth_state`
- `admin_sessions`
- `devices`
- `device_tokens`
- `tools`
- `tool_versions`
- `tool_publish_events`
- `resources`
- `resource_versions`
- `resource_publish_events`

Likely future entities:

- discovery scan snapshots or discovery event tables
- pairing attempt audit history
- richer admin-user model if multi-user support is needed later

## Relationship To Catalog Management

The catalog management model is:

- orchestrator exposes admin CRUD and publish APIs
- orchestrator writes drafts and publication state to Postgres
- `mcp-server` reads the published catalog and exposes runtime tools

Catalog management should always be admin-authenticated, never device-authenticated.

## Summary

The current model is:

- orchestrator is the only public app service
- GUI uses admin bearer sessions
- paired edge devices use device bearer tokens
- canonical `device_id` is orchestrator-issued, not MAC-derived
- discovery is intended to use mDNS plus admin approval
- pairing completes by sending `device_id` and token to a temporary device pairing endpoint
- tool and resource management live behind admin-only orchestrator routes
