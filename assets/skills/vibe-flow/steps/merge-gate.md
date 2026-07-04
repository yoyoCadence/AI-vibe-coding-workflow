# Step: vibe-merge-gate — final deterministic check before merge

**Role**: verifier (or the human). **Phase**: `merge_gate`.
**Trigger**: `review_status=approved` and the PR is ready to merge.

The gate is a script, not a judgment call. Your job is to run it, fix what it
flags (via the right role), and report — never to argue with it.

## Procedure
1. Run:
   ```
   node scripts/vibeflow/vibe.mjs merge-gate --fetch --agent verifier
   ```
2. It checks, deterministically:
   - current branch is not main/master; no detached HEAD
   - no uncommitted changes
   - spec exists, all acceptance criteria checked
   - tests recorded as passed ON THE CURRENT HEAD commit
   - reviewer verdict `approved`, review covers HEAD, zero unresolved P0/P1
   - handoff snapshot mentions HEAD (handoff is current)
   - PR exists, open, not draft (unless `require_pr=false`)
   - branch synced with base, no merge conflicts (local + GitHub)
   - no secrets in the diff; no new .env files
   - no files outside the spec's `## Scope`
3. **BLOCKED** → route the failure to the right role
   (`vibe set phase=fix owner_agent=fix-agent ...` for code issues; re-run
   verify for stale tests; `review-request` again after any new commit), then
   re-run the gate. Every new commit invalidates tests + review on purpose.
4. **READY** → tell the human. A HUMAN merges:
   ```
   gh pr merge <n> --squash --delete-branch
   ```
5. After the human confirms the merge:
   ```
   node scripts/vibeflow/vibe.mjs set phase=done merge_status=merged owner_agent=null next_action="pick next task (/vibe-spec)" --agent verifier
   node scripts/vibeflow/vibe.mjs handoff --agent verifier --notes "T-00X merged in PR #n"
   ```

## Outputs
- `state.json.merge_gate` + `merge_status` (`ready`/`blocked`), gate section in
  handoff, task-log entry.

## Forbidden
- Merging automatically or telling an agent to run `gh pr merge`.
- Editing checks, state, spec AC, or review-result to force a pass.
- Skipping the gate because "the reviewer already approved".
