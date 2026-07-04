# VibeFlow Review Rubric (normative)

The reviewer walks EVERY item, in order. Each item ends as: pass, finding
([P0]-[P3] in `.ai/review-result.md`), or explicitly "not applicable: why".
Severity guide: P0 = breaks acceptance criteria / security / data loss.
P1 = must fix before merge. P2 = should fix soon. P3 = nit.

1. **Acceptance criteria** — every AC in the spec verified with evidence
   (test name, command output). Unmet AC → P0/P1 and verdict
   `changes_requested` at best.
2. **Regressions** — does the diff change behavior outside the spec's Goal?
   Check callers of every modified function; check changed defaults, changed
   return shapes, removed exports.
3. **Missing tests** — new behavior without a test that would fail if the
   behavior broke → P1. Weakened/deleted tests → P0 unless the spec says so.
4. **Security** — injection, authn/authz gaps, unsafe deserialization, path
   traversal, SSRF, XSS, unvalidated input at trust boundaries → P0.
5. **Secret / env leak** — credentials, tokens, private keys, `.env` files in
   the diff; secrets echoed into logs → P0 (verdict `blocked`). Do NOT quote
   the secret value in your finding; give file:line only.
6. **Debug leftovers** — print/console.log/dbg statements, commented-out code,
   TODO-without-issue introduced by this diff → P2 (P1 if it logs data).
7. **Correct branch** — work is on a `feat/fix/chore` branch matching the
   spec's `working_branch`, not on main/master → else P0.
8. **PR exists** — an open, non-draft PR for this branch (when require_pr) → else P1.
9. **Unrelated files** — changed files outside the spec `## Scope`
   (`.ai/`, `.claude/`, `.agents/`, `scripts/vibeflow/` are exempt) → P1.
10. **Over-engineering** — abstractions/config/layers the spec's Non-goals
    exclude or the task does not need; new dependencies not named in the spec
    → P1 for deps, P2 for gold-plating.
11. **Architecture fit** — violates existing patterns, breaks module
    boundaries, introduces circular deps, duplicates an existing utility →
    P1/P2 with a pointer to the existing pattern.

Cross-check the deterministic layer too: `state.json.tests_run` must be
`passed` on the reviewed commit — if the request says tests are stale or
failing, that alone is `changes_requested`.
