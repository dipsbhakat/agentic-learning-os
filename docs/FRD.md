# Functional Requirements Document (FRD)
## Agentic Learning OS — MVP

**Status:** Implemented (MVP loop) | **Version:** 1.0 | **Scope:** Mentor + Planner + Course Generator + Project Coach

---

## 1. Purpose

Agentic Learning OS is a persistent, multi-agent system that owns a student's entire learning journey end to end, instead of the point-solution model (a tutoring bot, a course platform, an interview-prep tool, each starting from zero knowledge of the learner). The differentiating requirement is a shared, persistent **Student Model** — goals, skill mastery, syllabus progress, project history — that every agent reads and writes, so later stages get sharper because earlier stages already generated real signal about the student.

This document specifies the functional behavior of the MVP: the four-agent loop (**Mentor → Planner → Course Generator → Project Coach**) that takes a learner from a stated goal to a syllabus, through lessons and projects, and closes the loop by turning graded work back into skill-mastery signal.

Interview Coach and Career Coach (later stages of the full product vision) are explicitly **out of scope** for this document — they depend on a populated Student Model that this MVP is responsible for generating.

## 2. Actors

| Actor | Description |
|---|---|
| **Student** | An authenticated end user pursuing a learning goal. Every table and every agent action is scoped to one student (`clerk_user_id`). |
| **Mentor** | The orchestrating agent. The only actor permitted to transition a syllabus node's status. |
| **Planner** | Subagent that turns a goal into an ordered syllabus. |
| **Course Generator** | Subagent that writes lesson content for a syllabus node. |
| **Project Coach** | Subagent that writes project briefs and reviews submitted work. |
| **System (webhook)** | Clerk's `user.created`/`user.updated` webhook, which provisions the internal user record. |

## 3. Functional Requirements

### 3.1 Authentication & Identity

| ID | Requirement |
|---|---|
| FR-1.1 | The system shall require an authenticated session (Clerk) for every route except `/sign-in`, `/sign-up`, and the Clerk webhook endpoint. |
| FR-1.2 | On a student's first sign-in, the system shall create an internal `users` row keyed by the stable Clerk user ID and the student's primary email, via the Clerk webhook. |
| FR-1.3 | If the webhook has not yet fired when a student first reaches the dashboard, the system shall defensively create the `users` row inline (idempotent upsert) so no downstream query fails on a missing user. |
| FR-1.4 | Every agent tool and every Student Model function shall derive the student's identity from the verified session principal (`ctx.session.auth.current.principalId`), never from a model- or client-supplied argument. |

### 3.2 Goal Intake

| ID | Requirement |
|---|---|
| FR-2.1 | The student shall be able to state a learning goal in natural language via the Mentor chat interface. |
| FR-2.2 | On receiving a new goal, Mentor shall persist it (title + optional description) against the student before any planning occurs. |
| FR-2.3 | Mentor shall determine, on every turn, whether the student has an active goal, and branch behavior accordingly (prompt for a goal vs. resume existing progress). |

### 3.3 Syllabus Planning

| ID | Requirement |
|---|---|
| FR-3.1 | Given a goal and the student's current skill levels, Planner shall produce an ordered syllabus of 4–8 nodes, each typed `lesson` or `project`. |
| FR-3.2 | Planner shall skip or de-emphasize topics the student has already demonstrated high mastery (≥80) in. |
| FR-3.3 | Every project-type node shall immediately follow the lesson node(s) it exercises. |
| FR-3.4 | On creation, the first syllabus node shall be `available`; every subsequent node shall be `locked`. |
| FR-3.5 | Planner shall not generate lesson content or project briefs itself — only syllabus structure (titles, types, target skills). |

### 3.4 Lesson Delivery

| ID | Requirement |
|---|---|
| FR-4.1 | When the student's active node is a lesson, Mentor shall delegate to Course Generator with the node's id, title, and the student's mastery of its target skills. |
| FR-4.2 | Course Generator shall produce a self-contained lesson (explanation, one worked example, 2–4 practice questions) calibrated to the student's mastery level for that topic. |
| FR-4.3 | The generated lesson shall be persisted against its syllabus node before being shown to the student. |

### 3.5 Project Workflow

| ID | Requirement |
|---|---|
| FR-5.1 | When the student's active node is a project with no existing brief, Mentor shall delegate to Project Coach to generate one. |
| FR-5.2 | A project brief shall include a description and a rubric mapping each target skill to what "met" looks like. |
| FR-5.3 | The student shall be able to submit work for the active project node via the chat interface. |
| FR-5.4 | On submission, the system shall persist the submission (content, project reference, status `pending`) before requesting review. |
| FR-5.5 | Submitting work for a node with no existing project brief shall fail with a clear error rather than silently creating an orphaned submission. |

### 3.6 Review & Skill Tracking

| ID | Requirement |
|---|---|
| FR-6.1 | On a pending submission, Mentor shall delegate to Project Coach in review mode with the submission id. |
| FR-6.2 | Project Coach shall read the submission and its project's rubric, then produce: a 0–100 score, a pass/fail flag (pass = score ≥ 70), specific feedback, and a skill-deltas map (skill name → mastery point change). |
| FR-6.3 | Skill deltas shall be derived from evidence in the submission, not from effort or length. |
| FR-6.4 | On receiving a review, the system shall mark the submission `reviewed`, persist the review, and apply each skill delta to the student's skill-mastery record (creating the skill row if it does not yet exist), clamped to the 0–100 range. |
| FR-6.5 | If the review passes, Mentor shall advance the syllabus node: mark it `completed` and unlock the next node in sequence (if one exists and is currently `locked`). |
| FR-6.6 | If the review fails, Mentor shall relay the feedback to the student and shall **not** advance the node — the student retries. |
| FR-6.7 | Only Mentor may write a syllabus node's status. Planner, Course Generator, and Project Coach never advance a node themselves. |

### 3.7 Dashboard (Read-Only Views)

| ID | Requirement |
|---|---|
| FR-7.1 | The dashboard shall display the student's current active goal, or a prompt to state one if none exists. |
| FR-7.2 | The dashboard shall display every node of the active syllabus with its current status (`locked` / `available` / `in_progress` / `completed`). |
| FR-7.3 | The dashboard shall display every tracked skill with its current mastery level (0–100). |
| FR-7.4 | The dashboard shall read directly from the Student Model access layer — it shall not route through an agent to display state. |

### 3.8 Audit Trail

| ID | Requirement |
|---|---|
| FR-8.1 | Every agent-initiated state change (goal set, syllabus created, lesson created, project created, submission recorded, submission reviewed, node advanced) shall be logged with agent name, event type, and a JSON payload of relevant identifiers. |

## 4. Primary Use Case — Happy Path

> "As a student, I want to tell an agent what I want to learn and be walked through lessons and projects that adapt to what I already know, so that I make real progress instead of generic content."

1. Student signs in for the first time; a `users` record is created.
2. Student tells Mentor: *"I want to learn the Claude Agent SDK."*
3. Mentor persists the goal, then delegates to Planner.
4. Planner returns a syllabus of ordered lesson/project nodes; the first node is unlocked.
5. Mentor tells the student what's next.
6. For the first (lesson) node, Mentor delegates to Course Generator, which produces and saves a lesson; the student reads it.
7. Student says they're ready for the project. Mentor delegates to Project Coach, which produces a brief.
8. Student submits their work in chat. Mentor records the submission, then delegates to Project Coach in review mode.
9. Project Coach scores the submission, returns feedback and skill deltas.
10. Skills update. If the score passes, Mentor advances the node and unlocks the next one; if not, the student is told what to fix and retries step 8.
11. Steps 6–10 repeat until the syllabus is exhausted.
12. At any point, the dashboard reflects current goal, syllabus progress, and skill levels without needing to ask an agent.

## 5. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Multi-tenancy** | Every table row is scoped by `user_id`; every Student Model function requires the caller's Clerk user id as its first argument and enforces the tenant boundary internally. No cross-tenant data access is possible through the public function surface. |
| **Security** | Tenant identity is derived only from verified route auth (Clerk session), never from a prompt, tool argument, or client-supplied field. |
| **Auditability** | Every state-changing agent action produces an `agent_events` row sufficient to reconstruct why the system made a given decision. |
| **Resilience (design intent)** | Interrupted agent steps are replayed by the eve runtime rather than re-executed from scratch; non-idempotent side effects should be safe to retry. |
| **Cost** | Model calls are scoped per-agent-turn; Planner/Course Generator/Project Coach each run in isolated child sessions with their own token budget, bounded by the parent Mentor session. |

## 6. Out of Scope (MVP)

- Interview Coach and Career Coach agents (future stages; depend on this MVP's Student Model data).
- Syllabus revision / re-planning after a poor outcome (flagged as a future design problem — may require moving from a flat ordered list to a DAG).
- Rubric-to-skill-delta computation beyond "the model judges it directly" (no separate calibration/consistency layer yet).
- Any multi-tenant *organization* concept (teams, seats, admin roles) — the MVP is single-student-per-account only.
- Payment, billing, or usage metering.
- A dedicated submission UI outside the chat conversation.

## 7. Glossary

| Term | Meaning |
|---|---|
| **Student Model** | The persistent Postgres-backed record of one student's goals, skills, syllabus, lessons, projects, submissions, and reviews. |
| **Syllabus node** | One unit of the syllabus — either a lesson or a project — with an order index and a lifecycle status. |
| **Skill delta** | A signed integer adjustment to a named skill's mastery level, produced by Project Coach from graded evidence. |
| **Agent event** | An audit-log row recording one agent's state-changing action. |
