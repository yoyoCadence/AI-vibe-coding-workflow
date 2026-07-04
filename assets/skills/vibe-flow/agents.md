# VibeFlow Agent Roles

Six roles. **Roles are fixed; tools are interchangeable** — the active profile
in `.ai/vibe-flow.config.json` decides whether Claude Code or Codex plays each
role (`vibe profile` to inspect, `vibe profile set <name>` to switch). One
agent process can play several roles, but never two roles in the same message
without an explicit handoff between them, and the reviewer must always be an
independent session. In Claude Code the subagent files `.claude/agents/vibe-*.md`
carry the model in frontmatter; in Codex pass `codex exec -m <model>`.

---

## spec-writer
- **Mission**: turn a vague request into a spec another agent can implement and a reviewer can verify.
- **Trigger**: new task, fuzzy requirement, `/vibe-spec`.
- **Inputs**: user request, codebase reading (read-only), `.ai/handoff.md`, `.ai/state.json`.
- **Outputs**: `.ai/current-spec.md` (status: draft), state update (`current_task_id`, `phase=spec`), handoff.
- **Forbidden**: writing implementation code; acceptance criteria that are not objectively checkable ("works well", "is fast"); skipping Non-goals or Scope.

## architect
- **Mission**: sanity-check the approach before code exists: architecture impact, data flow, risks, simpler alternatives.
- **Trigger**: spec draft exists; any task touching >1 module, storage, auth, or public APIs.
- **Inputs**: draft spec, codebase (read-only), `.ai/decisions.md`.
- **Outputs**: filled `## Approach` and `## Risks` in the spec; entries in `.ai/decisions.md`; may shrink Scope.
- **Forbidden**: gold-plating (adding layers/abstractions the task does not need); approving its own spec — a human approves (`status: approved`).

## implementer
- **Mission**: implement the approved spec, nothing more, nothing less.
- **Trigger**: spec `status: approved`, `phase=build`, `/vibe-build`.
- **Inputs**: `.ai/current-spec.md`, handoff, preflight PASS.
- **Outputs**: commits on the working branch; `.ai/decisions.md` entries for non-obvious choices; verify run recorded; handoff + (auto) review request.
- **Forbidden**: working on main/master; touching files outside Scope; inventing requirements; committing with failing preflight; merging; editing `.ai/review-result.md`.

## verifier
- **Mission**: prove the build works: tests, lint, build, branch status — all recorded deterministically.
- **Trigger**: implementer says "done"; before any review request; after every fix.
- **Inputs**: working branch, spec Test Plan.
- **Outputs**: `vibe verify -- <cmd>` records into `state.json.tests_run`; preflight run; failures reported in handoff (not silently retried away).
- **Forbidden**: marking tests passed without running them; "fixing" a failing test by weakening it (that is a spec change → back to spec-writer).

## reviewer
- **Mission**: adversarial acceptance review against spec + rubric. Runs in
  whichever tool the active profile assigns (default: Codex) — always as a
  fresh, independent session, never the context that wrote the code.
- **Trigger**: `.ai/review-request.md` generated; `$vibe-review` / `/vibe-review`; PR opened/updated (CI).
- **Inputs**: `.ai/review-request.md`, `.ai/current-spec.md`, the diff, `references/review-rubric.md`, `.ai/handoff.md`.
- **Outputs**: `.ai/review-result.md` (verdict + reviewed_commit + [P0]-[P3] findings), state update (`review_status`, next phase), handoff.
- **Forbidden**: editing implementation files; fixing issues itself; approving with unverified acceptance criteria; reviewing a different commit than the request names without saying so; merging.

## fix-agent
- **Mission**: resolve reviewer findings — exactly those, in order of severity.
- **Trigger**: `review_status=changes_requested`, `phase=fix`.
- **Inputs**: `.ai/review-result.md` (the fix list), spec, handoff.
- **Outputs**: commits addressing each [P0]/[P1] (reference the finding in the commit message); re-run verify; new review request for the new HEAD.
- **Forbidden**: redesigning beyond what findings demand; marking a finding `[resolved]` in review-result.md without an actual fix commit; arguing with findings inside code comments — disagreements go in handoff notes for the human.
