# FRIDAY Architecture

```text
FRIDAY Web UI
  -> Backend / Orchestrator
    -> OpenRouter model routing
    -> Conversation store
    -> Local agent client
      -> Local Desktop Agent
        -> Validated desktop/file actions
```

## Web UI

The React app is the user-facing product surface. It handles chat, streaming progress events, task status, conversation history, settings visibility, and action visualization.

The UI does not read OpenRouter keys and does not call the local agent directly.

## Backend / Orchestrator

The backend owns:

- request validation
- task classification
- model/provider routing
- OpenRouter calls
- conversation persistence
- action planning
- calls to the local desktop agent

The first planner is intentionally conservative. It can produce safe structured actions for simple commands like opening URLs, opening allowlisted apps, waiting, and safe file operations. Unsupported computer-control requests are reported as unsupported instead of being faked.

## OpenRouter Layer

Model routing is category based:

- `general`
- `coding`
- `planning`
- `computer`
- `vision`
- `fast`

Each category can use a separate API key and model through environment variables. A default key/model pair can be supplied for development, but per-category values take precedence.

## Local Desktop Agent

The local agent is a separate HTTP service bound to loopback by default. It requires bearer-token authentication from the backend and validates every action against explicit schemas.

Current real capabilities:

- opening URLs through the OS default browser
- opening allowlisted apps
- closing allowlisted apps with confirmation
- waiting
- file listing, reading, writing, directory creation, and confirmed deletion within `FRIDAY_FILES_ROOT`

Blocked until adapters are added:

- screen reading
- visual element finding
- mouse clicking
- keyboard shortcuts
- text typing
- arbitrary window switching

## Safety Rules

- No unrestricted shell command action exists.
- The model produces structured action candidates, not shell commands.
- The local agent rejects unknown actions and paths outside the configured root.
- Destructive file and process actions require confirmation.
- Secrets are not exposed through settings endpoints.

