# FRIDAY

FRIDAY is a website-style AI interface backed by a controlled local desktop agent. The browser never receives model API keys and never performs desktop actions directly.

## Architecture

- `src/web`: React/Vite interface for chat, task status, action progress, history, and settings.
- `src/backend`: local orchestrator API. It classifies requests, routes model calls through OpenRouter config, stores conversations, and sends validated actions to the agent.
- `src/local-agent`: local desktop agent API. It validates action schemas and performs only allowlisted capabilities.
- `src/shared`: action, task, and response types used across boundaries.

## Run Locally

```bash
npm install
npm run dev
```

Then open `http://127.0.0.1:5173`.

For real use, copy `.env.example` to `.env`, set a non-default `FRIDAY_AGENT_TOKEN`, configure OpenRouter keys/models, and add any extra apps to `FRIDAY_ALLOWED_APPS`.

## Security Model

- OpenRouter keys are read only by the backend.
- The browser calls `/api/*`; it does not call the local agent.
- The backend calls the local agent with `FRIDAY_AGENT_TOKEN`.
- Desktop actions must pass Zod schemas before execution.
- App launching is allowlisted.
- File operations are restricted to `FRIDAY_FILES_ROOT`.
- Destructive actions return `needs_confirmation` unless explicitly confirmed.

## Current Agent Capabilities

Implemented:

- `open_url`
- `new_tab`
- `open_app` for allowlisted apps
- `close_app` for allowlisted apps with confirmation
- `wait`
- `file_operation` for list/read/write/mkdir/delete inside the configured root

Defined but intentionally blocked until a UI automation adapter is wired:

- `click`
- `type_text`
- `keypress`
- `read_screen`
- `find_element`
- `switch_window`

