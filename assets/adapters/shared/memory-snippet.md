## VibeFlow — AI coding workflow (read this first)

This project uses VibeFlow: Spec -> Build -> Verify -> Review -> Fix -> PR -> Merge Gate.
Roles are fixed (spec-writer, architect, implementer, verifier, reviewer, fix-agent);
which TOOL plays each role comes from the active profile in `.ai/vibe-flow.config.json`
(default: Claude Code builds, Codex reviews — but either tool can play any role).
Coordination happens ONLY through `.ai/` files.

Non-negotiable, before any work:
1. Read `.ai/handoff.md` and `.ai/state.json` — chat history is not a handoff.
2. Never commit on main/master. Run `node scripts/vibeflow/vibe.mjs preflight` before writing code; stop on FAIL.
3. When you finish or pause: `node scripts/vibeflow/vibe.mjs handoff --agent <role>` + update its "Agent notes" by hand.
4. Never merge. The merge gate (`node scripts/vibeflow/vibe.mjs merge-gate`) only reports; a human merges.
5. Reviewer role is read-only on implementation files; it writes `.ai/review-result.md` only,
   and must be a FRESH session — never the context that wrote the code.

Skills (identical content for both tools — `/vibe-x` in Claude Code and `$vibe-x` in Codex are the SAME role):
- Claude Code: `.claude/skills/vibe-flow/SKILL.md` (+ `/vibe-spec`, `/vibe-build`, `/vibe-handoff`, `/vibe-review`, `/vibe-merge-gate`, `/vibe-init`)
- Codex: `.agents/skills/vibe-flow/SKILL.md` (+ the same six under `.agents/skills/`)
- If asked for `$vibe-<step>` or `/vibe-<step>` and no skill triggers, read
  `.agents/skills/vibe-flow/steps/<step>.md` (or the `.claude/skills/` copy) and follow it.

Role -> tool/model mapping: `vibe profile` (config: `.ai/vibe-flow.config.json`, switch: `vibe profile set <name>`).
Scripts: `node scripts/vibeflow/vibe.mjs <status|preflight|handoff|verify|review-request|pr-status|merge-gate|set|profile|ui>`.
