# FRIDAY — Desktop AI Assistant

FRIDAY is a website-style AI interface backed by a controlled local desktop agent, a secure multi-model OpenRouter architecture using dedicated role-key slots and zero-cost (`:free`) models, and persistent PostgreSQL persistence powered by **Supabase Free Tier**.

The browser never receives model API keys, never receives the Supabase service-role key, never executes shell commands, and never interacts with the operating system directly.

---

## 1. Architecture

```text
                    FRIDAY
                       │
          ┌────────────┼─────────────┐
          │            │             │
       OpenRouter   Supabase      Local Agent
          │            │             │
        Models     PostgreSQL      Windows
                       │
             ┌─────────┼─────────┐
             │         │         │
        Conversations Tasks    Memory
             │         │         │
          Messages  Actions  Preferences
```

| Component | Responsibility |
| :--- | :--- |
| **OpenRouter** | AI model inference via 5 zero-cost role slots |
| **Supabase PostgreSQL** | Durable application persistence (conversations, messages, tasks, actions, memories, preferences, model status) |
| **FRIDAY Backend** | Orchestration, security enforcement, SSE streaming, API routing |
| **Local Agent** | Authenticated Windows desktop control (UI Automation, Chrome CDP) |
| **React Web UI** | Clean chat and task timeline interface |

---

## 2. Directory Structure

```text
FRIDAY/
├── src/
│   ├── backend/
│   │   ├── config/              # Centralized environment validation
│   │   │   ├── env.ts
│   │   │   └── env-validator.ts
│   │   ├── database/            # Supabase PostgreSQL layer
│   │   │   ├── supabase.ts          # Singleton service client & health checks
│   │   │   ├── database-types.ts    # Strongly typed row/insert/update schemas
│   │   │   ├── free-tier-guard.ts   # Payload size & content limit guards
│   │   │   └── repositories/        # Clean repository pattern
│   │   │       ├── conversation-repository.ts
│   │   │       ├── message-repository.ts
│   │   │       ├── task-repository.ts
│   │   │       ├── task-action-repository.ts
│   │   │       ├── memory-repository.ts
│   │   │       ├── preferences-repository.ts
│   │   │       └── model-status-repository.ts
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
│   │   ├── memory/              # Dual-mode state stores (Supabase + File fallback)
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
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       ├── 002_indexes.sql
│       └── 003_rls.sql
├── tests/                       # 36 automated Vitest test suites (287 tests)
├── .env.example
├── .env.openrouter.example
├── .env.supabase.example
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

### Credentials Setup

FRIDAY uses dedicated, git-ignored configuration files:

#### 1. OpenRouter Credentials (`.env.openrouter`)
Copy `.env.openrouter.example` to `.env.openrouter` and paste up to 5 OpenRouter API keys:
```bash
cp .env.openrouter.example .env.openrouter
```
```env
OPENROUTER_KEY_1=sk-or-v1-...   # Dedicated to CODING
OPENROUTER_KEY_2=sk-or-v1-...   # Dedicated to FAST
OPENROUTER_KEY_3=sk-or-v1-...   # Dedicated to COMPLEX
OPENROUTER_KEY_4=sk-or-v1-...   # Dedicated to GRAMMAR
OPENROUTER_KEY_5=sk-or-v1-...   # Dedicated to GENERAL
```

#### 2. Supabase Free-Tier Credentials (`.env.supabase`)
Copy `.env.supabase.example` to `.env.supabase` and paste your Supabase project credentials:
```bash
cp .env.supabase.example .env.supabase
```
```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# Set to true only if you want startup to fail when Supabase is unreachable
SUPABASE_REQUIRED=false
```

---

## 4. Supabase Database Migrations

Apply the versioned migrations in `supabase/migrations/` using either:

### Option A: Supabase SQL Editor (Recommended)
Open your [Supabase Dashboard](https://supabase.com/dashboard) → **SQL Editor** → Run the SQL in order:
1. `supabase/migrations/001_initial_schema.sql` (Creates 7 application tables)
2. `supabase/migrations/002_indexes.sql` (Creates performance indexes)
3. `supabase/migrations/003_rls.sql` (Enables Row Level Security)

### Option B: Supabase CLI
```bash
npx supabase db push
```

---

## 5. Free-Tier Architecture & Safeguards

FRIDAY is built to operate comfortably and permanently within the **Supabase Free Plan** (500 MB DB, 5 GB egress):

* **Compact Durable Rows**: Only durable milestones (conversations, messages, task start/finish, intentional memories, preferences) are persisted. High-frequency telemetry (token streaming, mouse movements, keypresses, screenshot buffers) is handled in memory and via SSE.
* **Content Size Guards**: `src/backend/database/free-tier-guard.ts` validates and rejects oversized payloads before any database write:
  - Message content ≤ 50,000 characters
  - Task goal ≤ 20,000 characters
  - Action result summary ≤ 10,000 characters
  - Long-term memory content ≤ 5,000 characters
  - JSON metadata ≤ 10 KB
* **Paginated Reads**: Messages, conversations, tasks, and memories use bounded limits (`LIMIT / OFFSET`).
* **Zero Blob Storage**: No screenshots, videos, or raw binaries are uploaded to Supabase.
* **No Unnecessary Services**: Does not use Supabase Auth, Storage, Realtime, or Edge Functions.
* **Offline / Inactive Project Fallback**: If your free project is paused or offline, FRIDAY seamlessly falls back to its local file-based store (`.friday/conversations.json`) without interrupting desktop workflows.

---

## 6. Security & Isolation Guardrails

* **Service-Role Isolation**: The `SUPABASE_SERVICE_ROLE_KEY` is loaded server-side only and never exposed via any API endpoint, Vite bundle, React component, or log file.
* **Row Level Security (RLS)**: RLS is enabled on all seven tables as defense-in-depth with zero public policies. The server client bypasses RLS via the service role.
* **Zero Paid Model Policy**: `FRIDAY_ALLOW_PAID_MODELS=false` ensures only zero-cost `:free` models are queried.
* **Phase 3A Fast Path**: Simple deterministic commands (e.g. `"Open YouTube"`, `"Open Notepad"`) execute directly with `0 LLM calls, 0 vision calls, 0 screenshots, 0 keys`.

---

## 7. Testing & Verification

Run all 36 automated test suites (287 tests):
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
