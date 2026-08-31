# FRIDAY — Desktop AI Assistant

FRIDAY is a website-style AI interface backed by a controlled local desktop agent and a secure, multi-model OpenRouter architecture using dedicated role-key slots and zero-cost (`:free`) models.

The browser never receives model API keys, never executes shell commands, and never interacts with the operating system directly.

---

## 1. Architecture

```text
FRIDAY Web UI (React 19 / Vite)
      ↓ (HTTP / SSE /api/*)
Backend Orchestrator (Express / Node.js)
      │
      ├── Fast Path (Phase 3A: 0 LLM / 0 Screenshots / Direct Execution)
      │
      ├── Model Router (Phase 4: Role-Key Slots / OpenRouter Free Models)
      │        ├── CODING   (Key 1 → poolside/laguna-s-2.1:free)
      │        ├── FAST     (Key 2 → nvidia/nemotron-3.5-lightning:free)
      │        ├── COMPLEX  (Key 3 → nvidia/nemotron-3-ultra-550b-a55b:free)
      │        ├── GRAMMAR  (Key 4 → minimax/minimax-m3:free)
      │        └── GENERAL  (Key 5 → minimax/minimax-m2.7:free)
      │
      └── Task Planner & Executor (Phase 2 & 3B: Autonomous Multi-Step)
               ↓ (Authenticated Local HTTP)
Local Desktop Agent (Node.js / Windows UI Automation / Chrome CDP)
      ↓
Windows / Applications / Browser
```

---

## 2. Directory Structure

```text
FRIDAY/
├── src/
│   ├── backend/
│   │   ├── config/              # Centralized environment validation
│   │   │   ├── env.ts
│   │   │   └── env-validator.ts
│   │   ├── models/              # Phase 4 OpenRouter Multi-Model Architecture
│   │   │   ├── friday-key-roles.ts
│   │   │   ├── model-registry.ts
│   │   │   ├── model-discovery.ts
│   │   │   ├── model-router.ts
│   │   │   ├── key-manager.ts
│   │   │   └── openrouter-client.ts
│   │   ├── orchestrator/        # Task planning, verification, and recovery
│   │   │   ├── orchestrator.ts
│   │   │   ├── planner.ts
│   │   │   ├── task-executor.ts
│   │   │   ├── command-router.ts
│   │   │   ├── direct-action-executor.ts
│   │   │   ├── action-runner.ts
│   │   │   ├── action-verifier.ts
│   │   │   ├── recovery-engine.ts
│   │   │   ├── confirmation-policy.ts
│   │   │   └── observation.ts
│   │   ├── memory/              # Conversation & Task state stores
│   │   │   ├── conversation-store.ts
│   │   │   └── task-store.ts
│   │   ├── agent/               # Backend-to-local-agent HTTP client
│   │   │   └── agent-client.ts
│   │   └── index.ts             # Express backend server
│   ├── local-agent/             # Authenticated local desktop agent
│   │   ├── adapters/
│   │   │   ├── windows-adapter.ts   # PowerShell & process automation
│   │   │   ├── browser-adapter.ts   # Chrome DevTools Protocol (CDP)
│   │   │   └── ui-automation.ts     # Windows UI Automation (.NET)
│   │   ├── config.ts
│   │   ├── executor.ts
│   │   └── index.ts
│   ├── shared/                  # Strict Zod schemas & shared contracts
│   │   ├── action-schema.ts
│   │   ├── chat-contracts.ts
│   │   ├── load-local-env.ts
│   │   └── task-types.ts
│   └── web/                     # React 19 Frontend
│       ├── App.tsx
│       ├── main.tsx
│       ├── api/fridayApi.ts
│       ├── components/
│       │   ├── ActionTimeline.tsx
│       │   ├── ChatComposer.tsx
│       │   ├── ConversationRail.tsx
│       │   ├── SettingsPanel.tsx
│       │   └── StatusStrip.tsx
│       └── styles.css
├── tests/                       # 26 automated Vitest test suites (210 tests)
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 3. Quick Start

### Installation

```bash
npm install
```

### Environment & OpenRouter Credentials Setup

1. Copy `.env.example` to `.env` for general runtime configuration:
   ```bash
   cp .env.example .env
   ```

2. Copy `.env.openrouter.example` to `.env.openrouter` for dedicated OpenRouter credentials:
   ```bash
   cp .env.openrouter.example .env.openrouter
   ```

3. Paste up to 5 OpenRouter API keys into `.env.openrouter`:
   ```env
   OPENROUTER_KEY_1=sk-or-v1-...   # Dedicated to CODING
   OPENROUTER_KEY_2=sk-or-v1-...   # Dedicated to FAST
   OPENROUTER_KEY_3=sk-or-v1-...   # Dedicated to COMPLEX
   OPENROUTER_KEY_4=sk-or-v1-...   # Dedicated to GRAMMAR
   OPENROUTER_KEY_5=sk-or-v1-...   # Dedicated to GENERAL
   ```

> **Note:**
> - You do **NOT** need to enter model IDs or configure model mappings manually. FRIDAY automatically routes each key slot to its predefined zero-cost free model.
> - The `.env.openrouter` file is ignored by Git and loaded server-side only. Keys are never sent to the browser.

### Start Development Server

```bash
npm run dev
```

Open `http://127.0.0.1:5173` in your browser.

---

## 4. Phase 4 Predefined Free Model Mapping

Every role defaults to a verified `$0/M input, $0/M output` model with bounded same-role fallbacks:

| Role | Key Slot | Primary Free Model | Fallback Models |
| :--- | :--- | :--- | :--- |
| **CODING** | `OPENROUTER_KEY_1` | `poolside/laguna-s-2.1:free` | `cohere/north-mini-code:free`, `poolside/laguna-xs-2.1:free` |
| **FAST** | `OPENROUTER_KEY_2` | `nvidia/nemotron-3.5-lightning:free` | `liquid/lfm-2.5-2.6b:free` |
| **COMPLEX** | `OPENROUTER_KEY_3` | `nvidia/nemotron-3-ultra-550b-a55b:free` | `minimax/minimax-m3:free` |
| **GRAMMAR** | `OPENROUTER_KEY_4` | `minimax/minimax-m3:free` | `thinkingmachines/inkling-small:free` |
| **GENERAL** | `OPENROUTER_KEY_5` | `minimax/minimax-m2.7:free` | `z-ai/glm-5.2:free` |

---

## 5. Security & Isolation Guardrails

- **Zero Paid Model Policy**: `FRIDAY_ALLOW_PAID_MODELS=false` is enforced in code. FRIDAY will never silently switch to a paid model or incur charges.
- **Strict Key Isolation**: `OPENROUTER_KEY_1..5` stay strictly inside the backend `KeyManager`. The frontend only receives role names, model names, and public slot identifiers (`key_1`..`key_5`).
- **Phase 3A Fast Path**: Simple deterministic commands (e.g., `"Open YouTube"`, `"Open Notepad"`, `"Switch to Chrome"`) execute directly with `0 LLM calls, 0 vision calls, 0 screenshots, 0 keys`.
- **Filesystem Sandbox**: All file operations are restricted to `FRIDAY_FILES_ROOT` with path-traversal prevention.
- **Destructive Action Confirmation**: High-risk operations (closing applications, deleting files, system modifications) require explicit interactive user confirmation before execution.
- **Chrome CDP Automation**: Browser automation connects to Chrome debugging port (`9222`) using native DevTools protocol without third-party heavy dependencies.

---

## 6. Testing & Quality Checks

Run all automated test suites (26 suites / 210 tests):

```bash
npm test
```

Run TypeScript strict type check:

```bash
npm run lint
```

Run production build:

```bash
npm run build
```

Run security audit:

```bash
npm audit
```
