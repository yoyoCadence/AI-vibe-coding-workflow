# Step: vibe-handoff — update the agent handoff

**Role**: whoever is finishing or pausing. **Phase**: any.
**Trigger**: end of a work session, phase transition, before switching agents,
or any time the user says "handoff".

The next agent starts with ZERO chat context. The handoff is the only bridge.

## Procedure

1. Refresh the machine-generated snapshot:
   ```
   node scripts/vibeflow/vibe.mjs handoff --agent <your-role>
   ```
   This regenerates the Snapshot section of `.ai/handoff.md` from git + state
   (branch, HEAD, dirty files, tests, review/merge status, recent commits).
2. Set the routing fields so the next agent knows it owns the ball:
   ```
   node scripts/vibeflow/vibe.mjs set owner_agent=<next-role> next_action="<one concrete sentence>" --agent <your-role>
   ```
   If you are blocked: `set blockers="waiting for API key;design question in handoff"`.
3. **Edit the "Agent notes" section of `.ai/handoff.md` by hand.** The
   generated snapshot covers facts; your notes cover judgment:
   - What I did (bullet list, past tense, concrete)
   - What is NOT done yet (be honest — hidden gaps kill the next agent)
   - Known issues / gotchas (weird test, flaky step, surprising coupling)
   - What the next agent should do first (one imperative sentence)
4. Quick sanity check: `node scripts/vibeflow/vibe.mjs status` — no drift
   warnings, `next_action` sensible.

## Outputs
- `.ai/handoff.md` (snapshot + fresh manual notes), `.ai/state.json` routing
  fields set, task-log entry.

## Forbidden
- Relying on chat history ("as discussed above") — the next agent cannot see it.
- Hand-editing `state.json` or the generated sections (use the scripts).
- Vague next actions ("continue the work"). Name the file, command, or decision.
