# Step: vibe-review — adversarial acceptance review

**Role**: reviewer (tool per active profile; default Codex). **Phase**: `review`.
**Trigger**: `.ai/review-request.md` exists for the current HEAD; `$vibe-review`
or `/vibe-review`; a PR review is requested.

**Independence is non-negotiable**: you must be a fresh session/context. If
this conversation contains the implementation work you are about to review,
STOP and tell the user to open a new session. Self-review is not review.

You are the last line of defense before merge. Your job is to find problems,
not to be agreeable. An approval you cannot defend with evidence is a failure.

## Preconditions
- Read `.ai/review-request.md` FIRST. It names the commit and branch under
  review. Verify with `git rev-parse HEAD` that you are on that commit; if
  not, say so in the result — do not silently review something else.
- Read `.ai/current-spec.md`, `.ai/handoff.md`, `.ai/state.json`.
- You are READ-ONLY on implementation files. You may only write
  `.ai/review-result.md`, state (via `vibe set`), and handoff.

## Procedure
1. Read the full diff yourself (do not trust the summary):
   `git diff <diff-base-from-request>..HEAD`
2. Walk EVERY item of `references/review-rubric.md` (same folder as this
   file's parent skill). For each acceptance criterion in the spec, verify
   with evidence — run the tests/commands yourself when possible
   (`node scripts/vibeflow/vibe.mjs verify -- <cmd>` re-records them; running
   read-only checks directly is also fine).
3. REPLACE `.ai/review-result.md` (delete the `vibeflow:no-review-yet` marker)
   using the exact template embedded in that file:
   - `verdict:` approved | changes_requested | blocked
   - `reviewed_commit:` the FULL sha you actually reviewed
   - Findings: one line each — `- [P0] file:line — issue`. Severities:
     P0 breaks AC/security/data, P1 must fix pre-merge, P2 soon, P3 nit.
     P0/P1 lines without `[resolved]` block the merge gate.
   - AC verification: every criterion, each with evidence or "NOT met: why".
   - Notes for fix-agent: concrete ordered fix list.
4. Record the outcome and hand off:
   ```
   node scripts/vibeflow/vibe.mjs set review_status=changes_requested phase=fix owner_agent=fix-agent next_action="fix P0/P1 findings in review-result" --agent reviewer
   # or, when approving:
   node scripts/vibeflow/vibe.mjs set review_status=approved phase=merge_gate owner_agent=verifier next_action="run merge-gate" --agent reviewer
   node scripts/vibeflow/vibe.mjs handoff --agent reviewer
   ```

## Verdict rules
- Any unmet acceptance criterion → at least `changes_requested`, never approved.
- Security issue / secret in diff → P0 and verdict `blocked`.
- Wrong branch, no PR when required, unrelated files → P1 findings.
- Uncertain whether something is broken? Say so as a P2 with a question — do
  not approve on hope, do not block on vibes.

## Forbidden
- Editing/committing implementation files, even one-character fixes.
- Approving with unchecked or evidence-free acceptance criteria.
- Merging, closing, or updating the PR beyond a review.
- Softening findings because the implementer "worked hard".
