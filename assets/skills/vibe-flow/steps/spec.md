# Step: vibe-spec — from vague request to verifiable spec

**Roles**: spec-writer, then architect. **Phase**: `spec`.

## Preconditions
- Read `.ai/handoff.md` + `.ai/state.json`. If a task is already in flight
  (`phase` in build/verify/review/fix), stop and ask the user whether to
  finish or abandon it first — one active spec at a time.
- `node scripts/vibeflow/vibe.mjs preflight --phase spec` (warnings are OK here).

## Procedure (spec-writer)
1. Interrogate the request: who is it for, what breaks today, what does done
   mean, what is explicitly out of scope. Ask the user when ambiguous —
   guessed requirements are the #1 source of rework.
2. Read the relevant code before writing the spec (read-only).
3. Allocate a task id (increment previous, see task-log/handoff): `T-00X`.
4. REPLACE `.ai/current-spec.md` with a real spec using the exact template
   embedded in that file (keep every section; delete the
   `vibeflow:no-active-spec` marker line). Rules:
   - Acceptance criteria: objectively checkable, each one testable. Bad:
     "search works". Good: "GET /search?q=x returns 200 and matching ids
     (test: tests/search.test.js)".
   - `## Scope`: list the file prefixes the task may touch. The merge gate
     enforces this.
   - `## Non-goals`: at least one entry; this is the over-engineering fence.
5. Update state and hand off:
   ```
   node scripts/vibeflow/vibe.mjs set current_task_id=T-00X phase=spec owner_agent=architect next_action="architect pass on spec" --agent spec-writer
   node scripts/vibeflow/vibe.mjs handoff --agent spec-writer
   ```

## Procedure (architect)
1. Fill `## Approach` and `## Risks`: data flow, architecture impact, simpler
   alternatives considered. Trim Scope if it grew beyond need.
2. Log non-obvious decisions in `.ai/decisions.md`.
3. Present the spec to the user for approval. Only a human flips
   `status: draft` → `status: approved`.
4. After approval:
   ```
   node scripts/vibeflow/vibe.mjs set phase=build owner_agent=implementer next_action="create working branch and implement per spec" --agent architect
   node scripts/vibeflow/vibe.mjs handoff --agent architect
   ```

## Outputs
- Approved `.ai/current-spec.md`; state at `phase=build`; handoff updated.

## Forbidden
- Writing implementation code in this step.
- Unverifiable acceptance criteria; empty Non-goals; missing Scope.
- Approving the spec yourself.
