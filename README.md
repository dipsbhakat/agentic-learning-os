# Agentic Learning OS

A multi-agent system that owns one student's learning journey end to end: it takes a goal,
plans a syllabus, generates lessons, sets projects, reviews submitted work, and tracks skill
mastery as it goes.

This repository is the MVP of that loop. It is built on the [eve](https://eve.dev) agent
framework, runs inside a single Next.js app, and stores everything in a per-student
**Student Model** in Postgres.

## How it works

```
Student ──▶ Mentor (root agent, orchestrator)
              │
              ├──▶ Planner          goal + current skills → ordered syllabus of lesson/project nodes
              ├──▶ Course Generator node + target-skill mastery → a generated lesson
              └──▶ Project Coach    node → project brief, or submission → scored review + skill deltas
              │
              ▼
        lib/student-model  ──▶  Neon Postgres (Drizzle ORM)
```

- **Mentor** is the conversational entry point. On every turn it reads the student's status,
  decides what happens next, and delegates to a specialist. It is the only agent allowed to
  change a syllabus node's status, so progress can't be advanced by a subagent on its own.
- **Planner**, **Course Generator** and **Project Coach** are declared subagents with their
  own instructions and tools. Each returns a typed result (Zod `outputSchema`). For example,
  Project Coach returns either a `brief` or a `review` with `score`, `passed`, `feedback` and
  per-skill `skillDeltas`.
- Subagents do not see the conversation. Mentor packs every fact they need into the message
  it sends them, which keeps their context small and their behaviour testable.
- A node only advances after a passing review. A failing review is relayed as feedback and
  the student retries.

## Design decisions

| Decision | Why |
|---|---|
| One orchestrator, specialist subagents | Each agent has a narrow job and a typed contract; routing logic lives in one place. |
| Mentor is the sole writer of node status | Prevents a subagent from marking work complete that was never reviewed. |
| Structured outputs on every subagent | The orchestrator acts on fields (`passed`, `skillDeltas`), not on parsed prose. |
| Single access layer (`lib/student-model`) | The only code allowed to touch the schema. Every function takes the verified Clerk user id, so tenant scoping is enforced in one auditable place. |
| Agent runtime mounted inside Next.js | One deployment, same origin, no CORS; the dashboard reads the Student Model directly. |

## Data model

`users`, `goals`, `skills`, `syllabi`, `syllabus_nodes` (lesson or project), `lessons`,
`projects`, `submissions`, `reviews`, and `agent_events` for an audit trail of agent actions.
Details in [`docs/LLD.md`](docs/LLD.md).

## Stack

- **Agents:** eve (`agent/`), Claude Sonnet via the Vercel AI Gateway
- **App:** Next.js (App Router), React
- **Auth:** Clerk (on the agent channel and the Next.js routes)
- **Data:** Neon Postgres, Drizzle ORM, Zod

## Repository layout

```
agent/
  agent.ts, instructions.md     Mentor (root agent)
  tools/                        set_goal, get_student_status, advance_node, record_submission
  subagents/
    planner/                    create_syllabus
    course-generator/           save_lesson
    project-coach/              create_project_brief, get_submission, submit_review
  channels/eve.ts               Clerk-authenticated channel
app/                            dashboard, chat UI, sign-in/up, Clerk webhook
lib/student-model/              the only data-access layer
lib/db/schema.ts                Drizzle schema
docs/                           FRD, HLD, LLD
```

## Running locally

Requires Node 24.

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL, Clerk keys, AI_GATEWAY_API_KEY
npm run db:migrate
npm run dev
```

## Status and limits

This is an MVP. Known gaps, all documented in [`docs/`](docs/):

- The syllabus is a flat ordered list, so it can't re-plan or branch after a poor outcome.
  Moving to a DAG is the likely next step.
- No rate limiting or per-tenant cost tracking at the tool layer yet.
- Interview Coach and Career Coach agents are later stages of the design; they build on the
  Student Model this MVP produces.

## Documentation

- [Functional requirements](docs/FRD.md)
- [High-level design](docs/HLD.md)
- [Low-level design](docs/LLD.md)
