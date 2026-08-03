# Low-Level Design (LLD)
## Agentic Learning OS — MVP

**Version:** 1.0 | **Companion docs:** [FRD.md](./FRD.md), [HLD.md](./HLD.md)

---

## 1. Module Map

```
agentic-learning-os/
├── agent/
│   ├── agent.ts                  # Mentor's runtime config (model, reasoning)
│   ├── instructions.md           # Mentor's system prompt (routing logic)
│   ├── channels/eve.ts           # Route auth: verifies Clerk session -> stamps principal
│   ├── tools/                    # Mentor's own tools (root-level)
│   │   ├── get_student_status.ts
│   │   ├── set_goal.ts
│   │   ├── advance_node.ts
│   │   └── record_submission.ts
│   └── subagents/
│       ├── planner/
│       │   ├── agent.ts          # description + outputSchema
│       │   ├── instructions.md
│       │   └── tools/create_syllabus.ts
│       ├── course-generator/
│       │   ├── agent.ts
│       │   ├── instructions.md
│       │   └── tools/save_lesson.ts
│       └── project-coach/
│           ├── agent.ts          # discriminated-union outputSchema (brief | review)
│           ├── instructions.md
│           └── tools/
│               ├── create_project_brief.ts
│               ├── get_submission.ts
│               └── submit_review.ts
├── lib/
│   ├── db/
│   │   ├── schema.ts             # Drizzle table definitions
│   │   └── client.ts             # Lazy Neon HTTP driver singleton
│   ├── student-model/index.ts    # Tenant-scoped data-access functions (the only DB entry point)
│   └── auth/tenant.ts            # requireTenantCaller(ctx) -> { clerkUserId }
├── app/
│   ├── layout.tsx                # ClerkProvider + nav (Show when="signed-in"/"signed-out")
│   ├── page.tsx                  # Dashboard (Server Component, reads Student Model directly)
│   ├── chat/page.tsx             # Mentor chat UI (Client Component, useEveAgent())
│   ├── sign-in/[[...sign-in]]/page.tsx
│   ├── sign-up/[[...sign-up]]/page.tsx
│   └── api/webhooks/clerk/route.ts   # user.created/user.updated -> getOrCreateUser
├── proxy.ts                      # Next.js 16 request interceptor: clerkMiddleware + route matcher
├── next.config.ts                # withEve(nextConfig) + experimental.useTypeScriptCli
└── drizzle.config.ts
```

## 2. Database Schema

Dialect: PostgreSQL (Neon). ORM: Drizzle. Every table except `users` has a `user_id` FK to `users.id` with `onDelete: "cascade"`.

### `users`
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default random |
| clerk_user_id | text | not null, **unique** |
| email | text | not null |
| created_at | timestamptz | not null, default now |

### `goals`
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → users.id |
| title | text | not null |
| description | text | nullable |
| status | enum `goal_status` (`active`,`paused`,`done`) | default `active` |
| created_at | timestamptz | default now |

Index: `goals_user_id_idx (user_id)`

### `skills`
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK |
| name | text | not null |
| category | text | nullable |
| mastery_level | integer | default 0 (0–100 by convention, clamped in application code) |
| evidence_count | integer | default 0 |
| last_assessed_at | timestamptz | nullable |

Index: `skills_user_id_idx (user_id)`. Unique: `skills_user_name_unique (user_id, name)`.

### `syllabi`
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK |
| goal_id | uuid | FK → goals.id |
| title | text | not null |
| status | enum `syllabus_status` (`draft`,`active`,`archived`) | default `draft` |
| created_at | timestamptz | default now |

Index: `syllabi_user_id_idx (user_id)`

### `syllabus_nodes` — the state-machine backbone
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| syllabus_id | uuid | FK → syllabi.id |
| user_id | uuid | FK |
| order_index | integer | not null |
| title | text | not null |
| type | enum `node_type` (`lesson`,`project`) | not null |
| status | enum `node_status` (`locked`,`available`,`in_progress`,`completed`) | default `locked` |
| target_skill_ids | jsonb `string[]` | default `[]` |
| created_at | timestamptz | default now |
| completed_at | timestamptz | nullable |

Indexes: `syllabus_nodes_user_id_idx`, `syllabus_nodes_syllabus_id_idx`. Unique: `syllabus_nodes_order_unique (syllabus_id, order_index)`.

**Status transitions** (enforced only by `lib/student-model/advanceNode`, called only from `agent/tools/advance_node.ts`):
```
locked ──(created as node 2+)──▶ locked
  │
  └── on creation of node 0 ──▶ available
available ──(advanceNode on a *different* node completing it)──▶ available (unlocked by predecessor)
available ──(implicit; not a DB transition)──▶ in_progress   [markNodeInProgress exists but is not yet wired from any tool]
any ──(advanceNode(nodeId))──▶ completed, completed_at = now()
completed (node N) ──▶ triggers: sibling with order_index = N+1, if status===locked ──▶ available
```

### `lessons`
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| syllabus_node_id | uuid | FK → syllabus_nodes.id |
| user_id | uuid | FK |
| content | jsonb `Record<string, unknown>` | not null — shape written by Course Generator: `{ title, markdown }` |
| model_version | text | nullable |
| generated_at | timestamptz | default now |

### `projects`
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| syllabus_node_id | uuid | FK |
| user_id | uuid | FK |
| brief | jsonb `Record<string, unknown>` | not null — `{ title, description }` |
| rubric | jsonb `Record<string, unknown>` | not null — `{ [skillName]: "what met looks like" }` |
| created_at | timestamptz | default now |

### `submissions`
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| project_id | uuid | FK → projects.id |
| user_id | uuid | FK |
| content | text | not null — the student's submitted work, verbatim |
| artifact_ref | text | nullable |
| status | enum `submission_status` (`pending`,`reviewed`) | default `pending` |
| submitted_at | timestamptz | default now |

### `reviews`
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| submission_id | uuid | FK → submissions.id |
| user_id | uuid | FK |
| feedback | text | not null |
| score | integer | not null (0–100) |
| skill_deltas | jsonb `Record<string, number>` | default `{}` |
| reviewed_at | timestamptz | default now |

### `agent_events` — audit log
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK |
| agent_name | text | not null (`mentor`, `planner`, `course-generator`, `project-coach`) |
| event_type | text | not null (e.g. `goal.created`, `syllabus.created`, `lesson.created`, `project.created`, `submission.recorded`, `submission.reviewed`, `node.advanced`) |
| payload | jsonb | default `{}` — relevant ids for that event |
| created_at | timestamptz | default now |

**Relationship spine:**
```
goals ──▶ syllabi ──▶ syllabus_nodes ──▶ { lessons | projects ──▶ submissions ──▶ reviews }
                                                                         │
                                                                skill_deltas ──▶ skills
```

## 3. Student Model Access Layer (`lib/student-model/index.ts`)

Every exported function's **first parameter is `clerkUserId: string`**; internally each calls `requireInternalUserId(clerkUserId)` to resolve the row-level `users.id` before touching any other table. No function accepts an internal UUID as a tenant key from the caller.

| Function | Signature (params → return) | Notes |
|---|---|---|
| `getOrCreateUser` | `(clerkUserId, email) → User` | Upsert on `clerk_user_id` conflict (updates email). Only entry point that doesn't require an existing user row. |
| `createGoal` | `(clerkUserId, { title, description? }) → Goal` | |
| `getActiveGoal` | `(clerkUserId) → Goal \| undefined` | Latest by `created_at` where `status = 'active'`. |
| `getSkills` | `(clerkUserId) → Skill[]` | |
| `createSyllabus` | `(clerkUserId, { goalId, title, nodes[] }) → { syllabus, nodes }` | Inserts syllabus (`status: active`) then all nodes in one batch; node 0 is `available`, rest `locked`. |
| `getActiveSyllabusNode` | `(clerkUserId) → SyllabusNode \| undefined` | First node (by `order_index`) with `status = 'available'`. |
| `getSyllabusNodes` | `(clerkUserId, syllabusId) → SyllabusNode[]` | Ordered by `order_index`. |
| `markNodeInProgress` | `(clerkUserId, nodeId) → SyllabusNode` | Defined, not currently invoked by any tool (see §6 gaps). |
| `advanceNode` | `(clerkUserId, nodeId) → { completed, unlocked }` | **The** status-transition function. Marks the node `completed`, then finds the sibling at `order_index + 1`; if it exists and is `locked`, flips it to `available`. Returns `{ completed: null, unlocked: null }` if the node wasn't found/owned. |
| `saveLesson` | `(clerkUserId, { syllabusNodeId, content, modelVersion? }) → Lesson` | |
| `saveProject` | `(clerkUserId, { syllabusNodeId, brief, rubric }) → Project` | |
| `getProjectByNode` | `(clerkUserId, syllabusNodeId) → Project \| undefined` | Latest by `created_at`. |
| `createSubmission` | `(clerkUserId, { projectId, content, artifactRef? }) → Submission` | |
| `getSubmissionWithProject` | `(clerkUserId, submissionId) → { submission, project } \| null` | Join used by Project Coach's review-mode read. |
| `getPendingSubmission` | `(clerkUserId, projectId) → Submission \| undefined` | Defined, not currently invoked by any tool (see §6 gaps). |
| `saveReview` | `(clerkUserId, { submissionId, feedback, score, skillDeltas }) → Review` | Inserts the review, flips the submission to `reviewed`, then **for each** `[skillName, delta]` in `skillDeltas`: upserts the `skills` row — existing skill gets `masteryLevel = clamp(existing + delta, 0, 100)` and `evidenceCount += 1`; new skill is created with `masteryLevel = clamp(delta, 0, 100)`, `evidenceCount = 1`. |
| `logAgentEvent` | `(clerkUserId, { agentName, eventType, payload? }) → void` | |
| `getStudentSnapshot` | `(clerkUserId) → { goal, skills, activeNode }` | Fans out `getActiveGoal`, `getSkills`, and `getActiveSyllabusNode` via `Promise.all`. Backs `get_student_status`. |

## 4. Agent & Tool Contracts

### 4.1 Mentor (root agent)

`agent.ts`: `model: "anthropic/claude-sonnet-5"`, `reasoning: "medium"`.

| Tool | Input schema | Behavior |
|---|---|---|
| `get_student_status` | `z.object({})` | Calls `getStudentSnapshot` + `getSyllabusNodes` (if there's an active node). Returns `{ goal, skills[], activeNode, syllabusProgress[] }`. Read-only. |
| `set_goal` | `{ title: string (min 1), description?: string }` | Calls `createGoal`, logs `goal.created`. Returns `{ goalId, title }`. |
| `advance_node` | `{ nodeId: string (uuid) }` | Calls `advanceNode`, logs `node.advanced`. Returns `{ completedNodeId, unlockedNode: { id, title, type } \| null }`. |
| `record_submission` | `{ nodeId: string (uuid), content: string (min 1) }` | Resolves the project via `getProjectByNode(nodeId)` — **throws** `"No project brief exists for this node yet."` if absent — then `createSubmission`, logs `submission.recorded`. Returns `{ submissionId, projectId }`. |

Subagents available as lowered tools: `planner`, `course-generator`, `project-coach` (name derived from directory, no namespace prefix).

### 4.2 Planner (subagent)

`agent.ts`: `outputSchema = { syllabusId: string, nodeCount: number, firstNodeTitle: string }`.

| Tool | Input schema | Behavior |
|---|---|---|
| `create_syllabus` | `{ goalId: uuid, title: string, nodes: { title: string, type: "lesson"\|"project", targetSkillIds?: string[] }[] (min 1) }` | Calls `createSyllabus`, logs `syllabus.created`. Returns `{ syllabusId, nodeCount, firstNodeTitle }`. |

### 4.3 Course Generator (subagent)

`agent.ts`: `outputSchema = { lessonId: string, title: string }`.

| Tool | Input schema | Behavior |
|---|---|---|
| `save_lesson` | `{ syllabusNodeId: uuid, title: string, markdown: string }` | Calls `saveLesson` with `content: { title, markdown }`, `modelVersion: "anthropic/claude-sonnet-5"`. Logs `lesson.created`. Returns `{ lessonId, title }`. |

### 4.4 Project Coach (subagent)

`agent.ts`: `outputSchema` is a **discriminated union on `mode`**:
- `{ mode: "brief", projectId: string, title: string }`
- `{ mode: "review", score: number, passed: boolean, feedback: string, skillDeltas: Record<string, number> }`

| Tool | Input schema | Behavior |
|---|---|---|
| `create_project_brief` | `{ syllabusNodeId: uuid, title: string, description: string, rubric: Record<string,string> }` | Calls `saveProject` (`brief: {title, description}`), logs `project.created`. Returns `{ mode: "brief", projectId, title }`. |
| `get_submission` | `{ submissionId: uuid }` | Calls `getSubmissionWithProject`; **throws** if no project found. Returns `{ content, brief, rubric }` — read-only, used to gather evidence before scoring. |
| `submit_review` | `{ submissionId: uuid, score: number (0–100), feedback: string, skillDeltas: Record<string, number> }` | Calls `saveReview`. `passed = score >= 70` (computed in the tool, not stored as a column). Logs `submission.reviewed`. Returns `{ mode: "review", score, passed, feedback, skillDeltas }`. |

## 5. Sequence Diagrams

### 5.1 Goal intake → syllabus creation
```
Student          Mentor                    Planner              student-model
  │  "learn X"      │                          │                      │
  │────────────────▶│                          │                      │
  │                 │ get_student_status()      │                      │
  │                 │─────────────────────────────────────────────────▶│ getStudentSnapshot
  │                 │◀─────────────────────────────────────────────────│ { goal: null, ... }
  │                 │ set_goal({title})         │                      │
  │                 │─────────────────────────────────────────────────▶│ createGoal
  │                 │◀─────────────────────────────────────────────────│ { goalId, title }
  │                 │ planner({message: goal+skills})                  │
  │                 │─────────────────────────▶│                      │
  │                 │                          │ create_syllabus(...)  │
  │                 │                          │─────────────────────▶│ createSyllabus
  │                 │                          │◀─────────────────────│ {syllabus, nodes}
  │                 │◀─────────────────────────│ {syllabusId,          │
  │                 │  (task-mode result)        nodeCount,            │
  │                 │                            firstNodeTitle}       │
  │◀────────────────│ "here's your plan..."     │                      │
```

### 5.2 Lesson delivery
```
Mentor: get_student_status() → activeNode.type === "lesson"
Mentor → course-generator({message: node id/title + mastery})
  course-generator → save_lesson({syllabusNodeId, title, markdown})
    save_lesson → student-model.saveLesson(...) → student-model.logAgentEvent("lesson.created")
  course-generator returns {mode implicit N/A, lessonId, title}   # task-mode result
Mentor relays lesson content to student (text, not raw tool output)
```

### 5.3 Project → submission → review → advance
```
Mentor: activeNode.type === "project", no existing brief
Mentor → project-coach({message: "brief mode", node id/title})
  project-coach → create_project_brief(...) → {mode:"brief", projectId, title}
Mentor relays brief to student

Student submits work in chat
Mentor → record_submission({nodeId, content})
  → getProjectByNode (throws if absent) → createSubmission → logAgentEvent("submission.recorded")
  → {submissionId, projectId}

Mentor → project-coach({message: "review mode", submissionId})
  project-coach → get_submission({submissionId}) → {content, brief, rubric}
  project-coach reasons, scores
  project-coach → submit_review({submissionId, score, feedback, skillDeltas})
    → saveReview (writes review, marks submission reviewed, updates skills table)
    → logAgentEvent("submission.reviewed")
  project-coach returns {mode:"review", score, passed, feedback, skillDeltas}

if passed:
  Mentor → advance_node({nodeId})
    → advanceNode: mark node completed, unlock sibling at order_index+1 if locked
    → logAgentEvent("node.advanced")
  Mentor tells student they've advanced
else:
  Mentor relays feedback, student retries submission (loop back to "Student submits work")
```

## 6. Auth Contract

- **Inbound route auth** (`agent/channels/eve.ts`): a custom `AuthFn` calls `clerkClient.authenticateRequest(request)` (constructed with **both** `secretKey` and `publishableKey` — omitting the publishable key throws `Publishable key is missing` at request time, a real bug hit and fixed during integration testing). On success, returns `{ authenticator: "clerk", principalId: auth.userId, principalType: "user" }`. Falls through to `vercelOidc()` (Vercel-to-Vercel callers) then `localDev()` (local dev / REPL) if Clerk doesn't recognize the caller.
- **Next.js route protection** (`proxy.ts`, the Next.js 16 successor to `middleware.ts`): `clerkMiddleware` wraps every route except `/sign-in`, `/sign-up`, `/api/webhooks/*`, calling `auth.protect()` on everything else.
- **In-tool tenant derivation** (`lib/auth/tenant.ts`): `requireTenantCaller(ctx)` reads `ctx.session.auth.current`, throws unless `principalType === "user"` and `principalId` is a string, and returns `{ clerkUserId: principalId }`. Every tool's first line is `const { clerkUserId } = requireTenantCaller(ctx)`.
- **Webhook** (`app/api/webhooks/clerk/route.ts`): verifies the Svix signature using `CLERK_WEBHOOK_SECRET`; on `user.created`/`user.updated`, resolves the primary email and calls `getOrCreateUser`.
- **Dashboard fallback**: `app/page.tsx` calls `currentUser()` (Clerk Next.js helper) and unconditionally calls `getOrCreateUser` before reading the snapshot, so a student who reaches the dashboard before the webhook fires still gets a valid row.

## 7. Environment Variables

| Variable | Source | Used by |
|---|---|---|
| `DATABASE_URL` | Neon (Vercel Marketplace) | `lib/db/client.ts` |
| `CLERK_SECRET_KEY` | Clerk (Vercel Marketplace) | `agent/channels/eve.ts`, webhook verification path |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk | Clerk client SDK **and** `agent/channels/eve.ts`'s server-side client |
| `CLERK_WEBHOOK_SECRET` | Clerk dashboard (manual) | `app/api/webhooks/clerk/route.ts` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `..._SIGN_UP_URL` | Set to `/sign-in` / `/sign-up` | Clerk SDK — without these it redirects to Clerk's hosted Account Portal instead of our own pages |
| `VERCEL_OIDC_TOKEN` | Auto-provisioned on `vercel link` / `vercel env pull` | Vercel AI Gateway model auth (eve's default model routing) |

## 8. Known Gaps / Follow-ups

- `markNodeInProgress` and `getPendingSubmission` are implemented in the access layer but not yet called from any tool — Mentor currently jumps straight from `available` to `completed` without an explicit `in_progress` transition.
- `submit_review`'s `passed` threshold (`score >= 70`) is duplicated as a constant between the tool and Project Coach's instructions; it is not stored as configuration.
- No rate limiting or per-tenant cost tracking is implemented yet at the tool layer (noted as a non-goal for the MVP in the FRD).
