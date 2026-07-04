# Step: vibe-init — set up or repair VibeFlow in a project

**Role**: any agent (usually run once by the human or implementer).
**Trigger**: project has no `.ai/` directory, or workflow files are damaged/outdated.

## Procedure

1. Confirm you are at the project root. If it is not a git repo, tell the user
   and (with their OK) run `git init` + an initial commit first.
2. Run:
   ```
   node scripts/vibeflow/vibe.mjs init
   ```
   (If the scripts are not in the project yet, run init from the VibeFlow
   package directory with `--target <project>`; it copies itself in.)
   Add `--with-github-action` if the repo lives on GitHub and the user wants
   automatic Codex PR reviews.
3. Open `.ai/vibe-flow.config.json` with the user: base branch, models per
   role, `auto_review`, `require_pr`. Do not enable `allow_auto_merge` — it is
   ignored by design.
4. If init reported that `.claude/settings.json` already existed, help the
   user merge `.claude/settings.vibeflow.json` into it by hand.
5. Run `node scripts/vibeflow/vibe.mjs status` — it must print a coherent state.
6. Commit everything created (`.ai/`, `.claude/`, `.agents/`, `scripts/vibeflow/`,
   `CLAUDE.md`, `AGENTS.md`).

## Outputs
- Working `.ai/` state, skills for both agents, hooks, committed to git.

## Forbidden
- Overwriting an existing `.ai/state.json` of a task in flight (init already
  refuses; do not use `--force` to bypass while `phase != idle/done`).
- Enabling auto-merge anywhere.
