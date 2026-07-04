## VibeFlow — AI coding workflow (read this first)

This project uses VibeFlow: Spec -> Build -> Verify -> Review -> Fix -> PR -> Merge Gate.
Claude Code implements; Codex reviews. Coordination happens ONLY through `.ai/` files.

Non-negotiable, before any work:
1. Read `.ai/handoff.md` and `.ai/state.json` — chat history is not a handoff.
2. Never commit on main/master. Run `node scripts/vibeflow/vibe.mjs preflight` before writing code; stop on FAIL.
3. When you finish or pause: `node scripts/vibeflow/vibe.mjs handoff --agent <role>` + update its "Agent notes" by hand.
4. Never merge. The merge gate (`node scripts/vibeflow/vibe.mjs merge-gate`) only reports; a human merges.
5. Reviewer role is read-only on implementation files; it writes `.ai/review-result.md` only.

Skills (identical content for both agents):
- Claude Code: `.claude/skills/vibe-flow/SKILL.md` (+ `/vibe-spec`, `/vibe-build`, `/vibe-handoff`, `/vibe-review`, `/vibe-merge-gate`, `/vibe-init`)
- Codex: `.agents/skills/vibe-flow/SKILL.md` (+ the same six under `.agents/skills/`)
- If asked for `$vibe-<step>` (e.g. `$vibe-review`) and no skill triggers, read
  `.agents/skills/vibe-flow/steps/<step>.md` and follow it.

Roles and models: `.ai/vibe-flow.config.json` (spec-writer, architect, implementer, verifier, reviewer, fix-agent).
Scripts: `node scripts/vibeflow/vibe.mjs <status|preflight|handoff|verify|review-request|pr-status|merge-gate|set>`.
