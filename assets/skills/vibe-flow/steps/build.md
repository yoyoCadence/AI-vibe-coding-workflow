# Step: vibe-build — implement the approved spec

**Roles**: implementer, then verifier. **Phases**: `build` → `verify`.

## Preconditions
- `.ai/current-spec.md` has `status: approved`. Draft spec → back to vibe-spec.
- Read `.ai/handoff.md`, `.ai/state.json`, the full spec.
- Preflight MUST pass:
  ```
  node scripts/vibeflow/vibe.mjs preflight --phase build --fetch
  ```

## Branch setup (if still on the base branch)
```
git switch <base>            # e.g. main
git pull --ff-only
git switch -c feat/T-00X-<slug>
node scripts/vibeflow/vibe.mjs set working_branch=feat/T-00X-<slug> --agent implementer
node scripts/vibeflow/vibe.mjs preflight --phase build     # must now PASS
```
Branch naming: `feat/`, `fix/`, `chore/` + task id + slug (see references/branch-policy.md).

## Procedure (implementer)
1. Work strictly inside the spec's `## Scope`. Need another file? Update the
   spec Scope first (and say so in handoff).
2. Small, focused commits; message format: `T-00X: <what and why>`.
3. Record non-obvious choices in `.ai/decisions.md` as you go.
4. No debug prints left behind; no new dependencies unless the spec names them.
5. When the code is complete, run the verifier role.

## Procedure (verifier)
1. Run the spec's Test Plan through the recorder so the result is bound to HEAD:
   ```
   node scripts/vibeflow/vibe.mjs verify -- <test command>
   ```
   Run lint/build the same way if the project has them (last `verify` call wins;
   run the most complete command last, e.g. `npm run lint && npm test`).
2. Failures: fix (implementer) and re-run. Never weaken a test to pass it —
   that is a spec change and goes back to vibe-spec.
3. Check off acceptance criteria in the spec (`- [x]`) ONLY with evidence.
4. Commit everything (including `.ai/` updates). Tree must be clean.

## Handoff to review
```
node scripts/vibeflow/vibe.mjs handoff --agent implementer     # then fill Agent notes by hand
node scripts/vibeflow/vibe.mjs review-request --agent implementer
```
(If the Claude Stop hook is enabled it generates the review request
automatically when you stop with a clean tree.)
If the user wants a PR now (config `allow_auto_pr` is false by default, so ask):
`gh pr create --fill --draft`.

## Outputs
- Committed implementation on the working branch, `tests_run` recorded on HEAD,
  AC checked with evidence, handoff + review request generated.

## Forbidden
- Any commit on main/master. Force-push. Merging.
- Files outside Scope; drive-by refactors; new dependencies not in the spec.
- Committing secrets/.env; leaving debug prints.
- Declaring done while preflight or tests fail.
