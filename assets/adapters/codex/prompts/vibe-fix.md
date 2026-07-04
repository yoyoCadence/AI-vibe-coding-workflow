# vibe-fix (Codex custom prompt)

Copy to `~/.codex/prompts/vibe-fix.md` for a named prompt, or paste the lines
below into Codex.

---

You are the VibeFlow **fix-agent** for this repository.

1. Read `.ai/review-result.md` — that is your fix list. Also read
   `.ai/handoff.md`, `.ai/state.json`, `.ai/current-spec.md`.
2. Follow the constraints in `.agents/skills/vibe-flow/steps/build.md` and the
   core rules in `.agents/skills/vibe-flow/SKILL.md`.
3. Fix P0 then P1 findings, in order, on the existing working branch. Commit
   as `T-00X: fix [P1] <what>`. Mark findings `[resolved]` in
   `.ai/review-result.md` only after the fixing commit exists.
4. Re-run `node scripts/vibeflow/vibe.mjs verify -- <cmd>`, then
   `vibe review-request --agent fix-agent` (a new HEAD always needs a new
   review), then `vibe handoff --agent fix-agent`.
5. No redesigns beyond what a P0 demands. Never merge.
