# Cleanup Summary

## Files Removed

- None. The FRIDAY workspace was empty at the start of the task.

## Files Retained

- The empty workspace baseline was retained and checkpointed in git before implementation.
- No unrelated sibling project files were imported.

## Files Refactored

- None from an existing FRIDAY codebase.
- New architecture files were created under `src/web`, `src/backend`, `src/local-agent`, and `src/shared`.

## Dependencies Removed

- None from the original project because no package existed.
- During setup, vulnerable Vite/Vitest-era transitive packages were removed by upgrading the frontend/test toolchain.

## Dependencies Added

- Runtime: React, React DOM, Express, CORS, Zod, Nano ID, Lucide React.
- Development: Vite, Vite React plugin, TypeScript, TSX, Vitest, Concurrently, Node/React/Express/CORS types.

## Architecture Changes

- Created a website-style React UI.
- Created a backend orchestrator with task classification, conversation storage, OpenRouter routing, and local-agent calls.
- Created shared schemas for typed desktop actions and chat responses.
- Created a separate local desktop agent service with bearer-token authentication.

## OpenRouter Routing Changes

- Added category-based model routing for `general`, `coding`, `planning`, `computer`, `vision`, and `fast`.
- Added support for separate API keys and models per category.
- Added default key/model fallback for development.
- Settings responses redact API keys.

## Desktop-Agent Changes

- Added structured action schemas for app, browser, keyboard, mouse, screen, window, wait, and file operations.
- Implemented real local actions for URL opening, new tab URL opening, allowlisted app launch, confirmed allowlisted app close, waits, and safe file operations.
- Marked UI automation actions as unsupported until a real adapter is connected, rather than pretending they work.

## Security Improvements

- No browser-exposed OpenRouter keys.
- Local agent requires a bearer token.
- No arbitrary shell command action exists.
- App launch/close is allowlisted.
- File operations are restricted to `FRIDAY_FILES_ROOT`.
- Destructive operations require confirmation.
- npm audit reports zero known vulnerabilities after dependency upgrades.

## Tests Performed

- `npm run test`: 4 files, 10 tests passed.
- `npm run lint`: TypeScript check passed.
- `npm run build`: TypeScript check and Vite production build passed.
- `npm audit --audit-level=moderate`: zero vulnerabilities.
- Live backend health check passed.
- Live authenticated local-agent health check passed.
- Live unauthenticated local-agent request returned `401`.
- Live local-agent `wait` action passed.
- Live local-agent safe file listing passed.
- Live backend chat request executed a structured `wait` action through the local agent.
- Live backend SSE stream emitted status, classification, planned action, action result, and final response events.
- Vite web UI served successfully at `http://127.0.0.1:5173`.

## Remaining TODOs

- Configure real OpenRouter keys/models in `.env`.
- Replace the default development `FRIDAY_AGENT_TOKEN`.
- Add a real screen-reading and UI automation adapter for click/type/keypress/find/switch-window.
- Add user confirmation UX for destructive actions.
- Add durable database-backed memory if conversations grow beyond local JSON storage.
- Add end-to-end browser tests once the UI stabilizes.

