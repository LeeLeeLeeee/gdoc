<!-- /autoplan restore point: /c/Users/Administrator/.gstack/projects/LeeLeeLeeee-gdoc/main-autoplan-restore-20260624-161446.md -->
# Trove (gdoc) — Improvement Plan (rough draft for /autoplan review)

## Context
Trove is a single-user personal HTML-document manager. CLI uploads HTML (body+assets → Supabase Storage,
meta → Postgres); a Vite+React viewer browses docs as tree / cards / knowledge graph. ~2,000 LOC, Korean UI,
one owner. Backend: Supabase (Postgres + Auth + Storage, RLS-enforced). Viewer deploys static to Vercel.
Tests: 58 vitest tests on shared pure logic, all passing. Health check found typecheck is broken (391 errors,
~357 from missing `@types/react`) and there is no CI gate.

## Premises
1. This stays a single-user tool. No multi-tenant, no sharing/collab features.
2. The owner authors all uploaded HTML, so uploaded-doc content is semi-trusted.
3. Quality debt (broken typecheck, no CI, no linter) is the highest-value thing to fix before new features.
4. The knowledge graph is the product's main differentiator and worth investing in.

## Goal
Make Trove maintainable and pleasant to extend, then sharpen the two things that make it worth using daily:
finding a document fast, and the knowledge graph.

## Epics

### E1 — Fix type safety + add CI gate (foundation)
- Add `@types/react` + `@types/react-dom` to `viewer/devDependencies` (kills ~357 of 391 tsc errors).
- Fix `shared/buildTree.ts:1` — imports `Bucket` from `./schema` which no longer exports it.
- Fix `cli/upload.test.ts` mock types (DbPort uses `Record<string,unknown>` vs `DocumentRow`; `.id` on UploadOutcome union).
- Type the residual ~20 implicit-any params (mostly d3 callbacks in `GraphView.tsx`, event handlers).
- Add a GitHub Actions workflow: on push/PR run `tsc --noEmit` (root + viewer) and `vitest run`. Block merge on red.

### E2 — Add a linter/formatter
- Add Biome (single binary, fast). Minimal config. Run `biome check` in CI.
- One-time format pass on the whole repo.

### E3 — Full-text content search in the viewer
- Today search is title-only (name box) + meta filter (title/category/type/tags). You cannot search inside document bodies.
- Add content search: index doc text so the owner can find a doc by a phrase inside it.
- Show match snippets in results.

### E4 — Better knowledge-graph clusters
- Cluster labels are currently category-based and deterministic, not derived from the embedding clusters.
- Derive cluster labels from the actual semantic clusters (e.g. top shared terms per connected component).
- Let the owner tune the similarity threshold that creates edges.

### E5 — Upload CLI robustness + DX
- Add `--dry-run` to preview new/updated/unchanged/duplicate without writing.
- Improve error messages (problem + cause + fix) for the common failures: missing env vars, bad meta JSON, Storage upload failure.
- Parallelize embedding of changed docs in `analyze` (currently sequential via the Node worker).

### E6 — Harden the doc iframe
- The viewer renders uploaded HTML in an iframe with `sandbox="allow-scripts allow-popups allow-same-origin"`.
  allow-scripts + allow-same-origin on a same-origin blob defeats the sandbox. Review whether owner-authored
  docs need scripts at all; tighten if not.

## Sequencing
E1 → E2 first (foundation). Then E3 and E4 in parallel (independent). E5, E6 as follow-ups.

## Out of scope
Multi-user, sharing, mobile app, real-time collab, switching off Supabase.

## Open questions
- E3: index content client-side (load all bodies) or precompute a search index in `analyze`?
- E4: is deterministic labeling actually a problem in daily use, or fine as-is?

---
<!-- /autoplan REVIEW REPORT — appended 2026-06-24 -->
# /autoplan Review Report

Dual voices ran for all 4 phases: Claude subagent (independent) + Codex (gpt-5.5, read-only). Both voices agreed on every major finding.

## Phase 1 — CEO (strategy & scope)
CEO DUAL VOICES — CONSENSUS
| Dimension | Claude | Codex | Consensus |
|---|---|---|---|
| 1. Premises valid? | PARTIAL | PARTIAL | CONFIRMED — P1 ok; P3 inflated; P4 false |
| 2. Right problem? | NO | PARTIAL | DISAGREE-lean-NO — search under-prioritized |
| 3. Scope calibration? | NO | NO | CONFIRMED — CI/Biome/cluster-NLP = team ceremony for solo tool |
| 4. Alternatives explored? | NO | PARTIAL | lean-NO — never asks "does graph earn its keep?" |
| 5. Relevance/competitive risk? | PARTIAL | n/a | tool may go unused; no usage signal |
| 6. 6-month trajectory? | PARTIAL | PARTIAL | CONFIRMED — E4 likely regretted; E3 under-prioritized |

## Phase 2 — Design (UI scope: viewer)
| Dimension | Claude | Codex |
|---|---|---|
| Hierarchy | 3 | 5 |
| Missing-states coverage | 2 | 3 |
| Journey clarity | 3 | 5 |
| Specificity | 2 | 3 |
| Consistency | 6 | 5 |
| Responsive intent | 3 | 4 |
| Accessibility | 2 | 4 |
CONFIRMED: third search box harms 300px sidebar → unify to one scoped search; snippets have no defined home (CardView only, 2-line clamp, reuse existing Highlight/mark.hl); E3/E4 missing states (searching / no-match / index-error / threshold-recompute / label-fallback) all unspecified.

## Phase 3 — Eng
ENG DUAL VOICES — CONSENSUS
| Dimension | Claude | Codex | Consensus |
|---|---|---|---|
| 1. Architecture sound? | YES | PARTIAL | CONFIRMED — ports/pure-core clean |
| 2. Test coverage sufficient? | PARTIAL | PARTIAL | CONFIRMED — no viewer tests; E3/E4/dry-run untested |
| 3. Perf risks addressed? | PARTIAL | PARTIAL | CONFIRMED — E3 client-load won't scale; E5 non-problem |
| 4. Security covered? | YES | PARTIAL | CONFIRMED — E6 real, low for owner docs |
| 5. Error paths handled? | PARTIAL | NO | DISAGREE-lean-NO — dry-run/storage-first, anon search unstated |
| 6. Deploy risk? | PARTIAL | PARTIAL | CONFIRMED — CI conflates 2 tsc runs |
Verified facts: root tsc = **10 errors**; viewer tsc = **394** (369 React/JSX from missing @types/react). E4 cluster labels **already exist** (graph.ts:158, by category); threshold hardcoded because analyze.ts passes no opts. E5 embeddings **already batched** (embed.ts:21); "parallelize" is a non-problem.

## Phase 3.5 — DX (CLI is developer-facing)
DX DUAL VOICES — CONSENSUS
| Dimension | Claude | Codex | Consensus |
|---|---|---|---|
| Getting-started < 5 min? | NO | NO | CONFIRMED — TTHW 25-45 min, plan addresses zero of it |
| CLI naming guessable? | PARTIAL | PARTIAL | CONFIRMED |
| Error messages actionable? | PARTIAL | PARTIAL | CONFIRMED — bad-JSON silently skipped; E5 target has no template |
| Docs findable/complete? | PARTIAL | PARTIAL | CONFIRMED — OWNER_UID how-to missing |
| Migration path safe? | NO | NO | CONFIRMED — manual ordered SQL, no versioning |
| Dev-env friction-free? | PARTIAL | NO | CONFIRMED — bun+Node split, 90MB silent dl, no doctor |

## Cross-Phase Themes (flagged independently in 2+ phases)
- **THEME A — The plan optimizes the engine room, not daily use.** CEO + DX both: highest-value work is retrieval (E3) and first-run success (doctor), not type/CI/lint ceremony. High-confidence signal.
- **THEME B — Net-new features are under-specified.** Design + Eng + DX: E3 (UI + arch), E4 (UI + scope), E5 (--dry-run contract) all lack implementable detail.
- **THEME C — The plan's stated facts are stale.** CEO + Eng: error counts wrong, E4 partly built, E5 non-problem.

## Decision Audit Trail
| # | Phase | Decision | Class | Principle | Rationale |
|---|---|---|---|---|---|
| 1 | Eng | Fix error accounting: root=10, viewer=394; E1 runs 2 separate tsc | Mechanical | P5 explicit | Verified by both voices |
| 2 | Eng | E3 = precompute index in `analyze` (not client body-load) | Mechanical | P1/P3 | analyze already extracts text; client-load won't scale |
| 3 | Eng | E5 "parallelize embeddings" → drop (benchmark-first) | Mechanical | P4 DRY | already batched; spawning workers re-pays model load |
| 4 | Eng | E4 rescope: keep top-terms label + expose threshold flag (labels-by-category already exist) | Mechanical | P4 DRY | don't rebuild shipped code |
| 5 | Design | E3 UX → unify one scoped search box; snippets in CardView 2-line clamp | Taste | P5/P1 | both voices lean unify; surfaced at gate |
| 6 | Design | Require explicit states for E3/E4 (searching/no-match/error/recompute) | Mechanical | P1 completeness | boil the lake |
| 7 | Eng | E6 → drop `allow-same-origin`; verify TOC/theme bridge | Mechanical | P1 | real but low; cheap hardening |
| 8 | DX | E5 error format → require problem+cause+fix template + exit codes + file context | Mechanical | P1 | concrete acceptance criteria |
| 9 | DX | Add unknown-flag rejection + `--help` to CLI | Mechanical | P1 | `--dr-run` typo currently uploads for real |
| 10 | CEO/DX | Reprioritize + add `gdoc doctor` → USER CHALLENGE (see gate) | User Challenge | — | both models challenge user's stated priority; user decides |

## Recommended revised sequencing (pending gate approval)
1. **E1 (capped)** — install @types/react+react-dom, fix buildTree `Bucket`, fix upload.test mock, fix 10 root errors; add ONE local `check` script (root tsc + viewer tsc + vitest). Defer GitHub Actions CI + Biome unless desired.
2. **E3 — content search** (precompute index in analyze; unified scoped search; states spec'd) — the daily-value lever.
3. **gdoc doctor** — preflight (env + connectivity + buckets + migration level + OWNER_UID). Beats E2 on value.
4. Then, only if they earn it: E4 (rescoped), E5 (--dry-run only), E6.
