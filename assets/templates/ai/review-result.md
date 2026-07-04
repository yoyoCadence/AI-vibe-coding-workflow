<!-- vibeflow:no-review-yet -->
# No review yet

The reviewer REPLACES this file (including the marker above) with the result,
in this exact machine-parseable format:

```markdown
# Review Result

- task_id: T-001
- verdict: changes_requested   <!-- approved | changes_requested | blocked -->
- reviewed_commit: <FULL 40-char sha that was reviewed>
- reviewer: codex (<model>)
- reviewed_at: <ISO timestamp>

## Findings
<!-- One line per finding, severity tag first, file:line, then the issue.
     P0 = breaks AC / security / data loss   P1 = must fix before merge
     P2 = should fix soon                    P3 = nit
     merge-gate BLOCKS on any [P0]/[P1] line not marked [resolved]. -->
- [P0] src/auth.js:42 — password compared with ==, timing attack
- [P1] src/api.js:10 — missing error handling on fetch [resolved]
- [P2] tests/x.test.js — happy path only, no edge cases

## Acceptance criteria verification
<!-- Copy each AC from the spec, verify with EVIDENCE, not vibes. -->
- [x] AC1: ... (evidence: test `auth rejects bad token` passes)
- [ ] AC2: ... (NOT met: <why>)

## Rubric summary
One line per rubric item that failed or deserves comment.

## Notes for fix-agent
Concrete, ordered fix list. No redesigns unless a P0 demands it.
```
