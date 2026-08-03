# High-Level Design (HLD)
## Agentic Learning OS — MVP

**Version:** 1.0 | **Companion docs:** [FRD.md](./FRD.md), [LLD.md](./LLD.md)

---

## 1. Architecture Overview

```
                         Browser (student)
                              │
                    ┌─────────▼─────────┐
                    │   Next.js App      │  (App Router, single Vercel project)
                    │  /, /chat,          │
                    │  /sign-in, /sign-up │
                    └─────────┬─────────┘
                              │ same-origin, no CORS
                    ┌─────────▼─────────┐
                    │   eve runtime       │  mounted via withEve() at /eve/v1/*
                    │  (agent/ directory) │
                    └─────────┬─────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
  ┌─────▼─────┐        ┌──────▼──────┐       ┌──────▼──────┐
  │  Mentor   │───────▶│   Planner    │       │Course        │
  │ (root      │──────▶│ (subagent)   │       │Generator     │
  │  agent,    │──────▶│              │       │(subagent)    │
  │  orchestr.)│        └──────────────┘       └──────────────┘
  │            │──────▶┌──────────────┐
  │            │       │ Project Coach │
  └─────┬──────┘       │ (subagent)    │
        │              └───────────────┘
        │ tool calls, all scoped by verified Clerk principal
        ▼
┌─────────────────────────────────────────────┐
│         lib/student-model  (access layer)     │
│  the ONLY place tenant scoping is enforced     │
└─────────────────────┬───────────────────────┘
                       │ Drizzle ORM
                       ▼
              ┌─────────────────┐
              │  Neon Postgres    │
              └─────────────────┘

Auth:     Clerk (route auth on the eve channel + Next.js proxy.ts)
Models:   Vercel AI Gateway (routed via VERCEL_OIDC_TOKEN when deployed on Vercel)
```

## 2. Component Responsibilities

| Component | Responsibility |
|---|---|
| **Next.js app** (`app/`) | Renders the dashboard (server component, reads Student Model directly) and the Mentor chat UI (client component, `useEveAgent()`). Owns Clerk's hosted `/sign-in`, `/sign-up` pages and the `user.created` webhook. |
| **eve runtime** (`agent/`) | Compiles and runs the agent as a durable backend service, mounted into the same Next.js deployment via `withEve()`. Owns the HTTP session/streaming contract (`/eve/v1/session`), tool execution, and subagent delegation. |
| **Mentor** (root agent) | Conversational entry point and orchestrator. Reads student status every turn, routes to the right subagent, and is the sole writer of syllabus-node status. |
| **Planner / Course Generator / Project Coach** (declared subagents) | Specialists with their own instructions, tools, and (for Course Generator / Project Coach) a fixed `outputSchema`, invoked by Mentor as lowered tool calls (`{message, outputSchema?}` in, structured/task-mode result out). |
| **`lib/student-model`** | The single access layer to Postgres. Every function takes the Clerk user id as its first argument and resolves the internal UUID internally — this is the only code path permitted to touch the schema. |
| **`lib/auth/tenant`** | One helper (`requireTenantCaller`) that extracts the verified principal from `ctx.session.auth.current` inside any tool. Every tool calls this before touching the Student Model. |
| **Neon Postgres** | Durable relational store for the Student Model. Chosen over eve's own session state because dashboard reads must not go through an agent, and the data must outlive any single session. |
| **Clerk** | Identity provider. A custom `AuthFn` in `agent/channels/eve.ts` verifies the same session cookie the Next.js app uses, so one login covers both the UI and the agent's HTTP routes. |
| **Vercel AI Gateway** | Model routing for the agent's LLM calls, authenticated automatically via `VERCEL_OIDC_TOKEN` when the project is linked to Vercel. |

## 3. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Agent framework | **eve** (`eve@^0.29`) | Filesystem-first agent authoring; native subagent delegation, durable sessions, and route-auth primitives that map directly onto our tenant-scoping requirement. |
| Web framework | **Next.js 16** (App Router, Turbopack) | `eve/next`'s `withEve()` mounts the agent and the UI as one deployable unit — no separate service, no CORS. |
| Auth | **Clerk** (`@clerk/nextjs`, `@clerk/backend`) | One identity provider for both the Next.js routes (`proxy.ts` / middleware) and the eve channel's custom `AuthFn`. |
| Database | **Neon Postgres** (serverless driver) | Branchable, autoscaling Postgres; provisioned as a Vercel Marketplace integration alongside the project. |
| ORM | **Drizzle** (`drizzle-orm`, `drizzle-kit`) | Type-safe schema-as-code; `drizzle-kit push` used for the MVP's schema sync. |
| Models | Vercel AI Gateway (gateway model ids, e.g. `anthropic/claude-sonnet-5`) | Default eve model routing; no direct provider SDK dependency. |
| Language | TypeScript | End to end, including agent tool/schema definitions via Zod. |

## 4. Data Flow — Core Turn

1. Browser sends a chat message via `useEveAgent()` to `POST /eve/v1/session` (same origin, cookies included automatically).
2. eve's channel auth (`agent/channels/eve.ts`) verifies the Clerk session cookie via `clerkClient.authenticateRequest(request)` and stamps the resulting `{ principalId: clerkUserId, principalType: "user" }` onto the session.
3. Mentor's turn begins. Its instructions direct it to call `get_student_status` first — this tool calls `getStudentSnapshot(clerkUserId)`, which fans out to three Student Model reads (active goal, skills, active syllabus node) in parallel.
4. Based on that snapshot, Mentor decides what to do (prompt for a goal / advance to next node / delegate to a subagent) and, if delegating, packs everything the subagent needs into a `message` string — subagents never see Mentor's conversation history.
5. The subagent runs in its own child session (own sandbox, own state, same tenant principal is *not* automatically inherited — see §6), calls its own tools against the Student Model, and returns either free text or, for Course Generator / Project Coach, a schema-validated structured result (task mode, via each subagent's own `outputSchema` in its `agent.ts`).
6. Mentor reads the structured result and, for a passing review, calls its own `advance_node` tool — the only code path that flips `syllabus_nodes.status`.
7. Every tool call that mutates state also calls `logAgentEvent`, producing an audit row.
8. The turn's assistant text streams back to the browser over the same session's event stream.

## 5. Multi-Tenancy & Security Model

- **Identity boundary:** the Clerk-verified principal is the only source of tenant identity. It enters the system once, at the eve channel's route-auth step, and is carried forward on `ctx.session.auth.current` for the rest of the turn — including into every declared subagent's tool calls, since subagents inherit route auth even though they don't inherit conversation history or state.
- **Enforcement point:** `lib/student-model` functions all take `clerkUserId` as their first parameter and resolve it to an internal UUID before any query — application code (agent tools, Next.js server components, the webhook handler) never queries the schema directly, so there is exactly one place that could get tenant scoping wrong.
- **No trust in model output:** every write-capable tool re-derives the caller from `ctx`, never from a value the model put in a tool argument or in the conversation.
- **Dashboard reads bypass the agent entirely** — they call the Student Model directly from a Next.js Server Component, using the same Clerk-verified user id from `currentUser()`.

## 6. Key Design Decisions

| Decision | Rationale |
|---|---|
| **Mentor is the sole writer of node status** | Avoids concurrent-write races if two subagents both tried to decide when a node is "done." Subagents report outcomes; only the orchestrator acts on them. |
| **Subagents get a fixed `outputSchema` on their own `agent.ts`**, rather than Mentor passing a per-call schema | Every invocation of Course Generator / Project Coach is task-mode by default — simpler than relying on the calling model to remember to request structured output. |
| **Student Model lives in Postgres, not eve's own session state** | eve's `defineState` is durable *session* memory and is explicitly not shared across sessions or users; the Student Model must outlive any one session and be queryable by the dashboard without going through an agent at all. |
| **One access-layer module instead of per-tool queries** | Keeps the tenant-scoping guarantee in one auditable place and gives Interview/Career Coach (future) a ready-made integration seam. |
| **Next.js + eve as one deployable unit (`withEve()`)** | No second service to auth, no CORS, one Vercel project, one set of env vars. |

## 7. Known Limitations (MVP)

- Skill-mastery updates trust the reviewing subagent's judgment directly; there is no independent calibration or consistency check across reviews.
- The syllabus is a flat ordered list; it cannot express "redo an earlier node" or branch on a poor outcome — re-planning is a known future problem, not solved here.
- Single Postgres instance, no read replica or caching layer — acceptable at MVP scale, revisit under load.
- No organization/team concept — one account is one student.

See [LLD.md](./LLD.md) for the schema, tool contracts, and sequence-level detail.
