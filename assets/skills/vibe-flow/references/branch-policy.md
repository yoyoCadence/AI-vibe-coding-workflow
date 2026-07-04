# VibeFlow Branch Policy (normative)

## Protected branches
- `main` and `master` (config: `protected_branches`). No agent ever commits,
  amends, force-pushes, or resets on them. Preflight fails on them for
  build/fix phases; the merge gate fails on them always.

## Working branches
- Naming: `feat/T-00X-<slug>`, `fix/T-00X-<slug>`, `chore/T-00X-<slug>`.
- One task = one branch = one spec = one PR. No stacking tasks on one branch.
- Created from an up-to-date base:
  `git switch <base> && git pull --ff-only && git switch -c feat/T-00X-<slug>`.
- Record it: `vibe set working_branch=<name>`. Scripts record it automatically
  only when it is unset; changing it is always an explicit `vibe set`, so a
  wrong-branch drift keeps warning instead of silently self-healing — this is
  what catches "agent woke up on the wrong branch".

## Sync policy
- Before build and before merge-gate: branch must not be behind base
  (preflight/gate check `behind == 0`; use `--fetch` for fresh remote state).
- Getting current: prefer `git rebase <base>` for unpublished branches,
  `git merge <base>` once a PR exists and others may have pulled it.
- After any sync: re-run verify AND re-request review (HEAD changed).

## PR policy
- PRs are created by the human, or by an agent only when the human asks
  (`allow_auto_pr` default false). Draft first is encouraged.
- PR base = `base_branch` from config. Title: `T-00X: <spec title>`.
- Merge is ALWAYS a human action, after merge-gate READY. Squash preferred.

## Forbidden operations (all agents)
- `git push --force` (with or without lease) on any shared branch.
- `git reset --hard` / `git checkout --` that discards uncommitted work,
  unless the human explicitly asks.
- History rewrites on branches with an open PR.
- Deleting branches that are not merged.
- `git commit --no-verify` or bypassing hooks.
