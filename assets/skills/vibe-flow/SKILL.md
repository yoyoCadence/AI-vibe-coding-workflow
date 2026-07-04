---
name: vibe-flow
description: Core rules of the VibeFlow AI coding workflow (Spec -> Build -> Verify -> Review -> Fix -> PR -> Merge Gate). Read before any vibe-* step. Defines phases, agent roles, the .ai/ handoff files, git safety rules, and the deterministic scripts every agent must use.
---

# VibeFlow — Core Rules (all agents, both Claude Code and Codex)

VibeFlow is a multi-agent coding workflow. Claude Code typically implements;
Codex typically reviews. The two agents never share chat history, so **all
coordination goes through files in `.ai/` and through deterministic scripts**.

## Pipeline

```
Spec -> Build -> Verify -> Review -> Fix -> PR -> Merge Gate -> Done
                              ^________|
                            (fix loop until approved)
```

`state.json.phase` values: `idle, spec, build, verify, review, fix, merge_gate, done`.

## Iron rules — no exceptions

1. **Read `.ai/handoff.md` and `.ai/state.json` before doing anything.**
   Chat history is not a handoff. If they conflict with what the user says,
   ask; do not guess.
2. **Never write code on a protected branch** (`main`/`master`, see config).
   Run preflight first; it fails loudly if you are in the wrong place.
3. **Run `node scripts/vibeflow/vibe.mjs preflight` before build/fix work.**
   Do not proceed past a `[FAIL]`. Do not "fix" the check by editing the script.
4. **Every phase transition updates state and handoff**:
   `node scripts/vibeflow/vibe.mjs set phase=... owner_agent=... next_action="..." --agent <you>`
   then `node scripts/vibeflow/vibe.mjs handoff --agent <you>`, then fill in
   the manual "Agent notes" section of `.ai/handoff.md` by hand.
5. **The reviewer never edits implementation files.** Fixes go through the
   fix-agent on the working branch. Reviewer output is `.ai/review-result.md` only.
6. **Never merge automatically.** The merge gate only reports READY/BLOCKED;
   a human performs the merge. `allow_auto_merge` is hard-coded off.
7. **Never print, commit, or paste secrets** (tokens, .env contents, keys).
   The merge gate scans the diff; do not try to sneak past it.
8. **If a deterministic script can check it, use the script** — never eyeball
   git state, PR state, or test status from memory.
9. **Stay inside the spec's `## Scope`.** Unrelated refactors are a review
   finding, not a bonus. If scope must grow, update the spec first.
10. **When you finish or stop, hand off** (rule 4). An agent that stops
    without updating `.ai/` has failed the task, even if the code is perfect.

## Files (all under `.ai/`)

| file | written by | purpose |
|---|---|---|
| `state.json` | scripts + `vibe set` only | machine state: task, phase, branch, PR, tests, review, blockers |
| `handoff.md` | scripts (generated) + agents (manual notes) | human-readable handoff between agents |
| `current-spec.md` | spec-writer/architect | the one active spec with acceptance criteria + scope |
| `review-request.md` | `vibe review-request` (or Stop hook) | frozen review input: commit, diff summary, AC, instructions |
| `review-result.md` | reviewer only | verdict, reviewed_commit, [P0]-[P3] findings |
| `decisions.md` | any agent (append) | decisions a future agent cannot re-derive from code |
| `task-log.md` | scripts (append) | audit trail of workflow events |
| `vibe-flow.config.json` | human | models per role, base branch, toggles |

## Scripts (the only sanctioned way to touch state)

```
node scripts/vibeflow/vibe.mjs status            # where am I?
node scripts/vibeflow/vibe.mjs preflight         # safety checks (--phase spec|build|review|merge, --fetch)
node scripts/vibeflow/vibe.mjs handoff           # refresh handoff snapshot (--notes "...", --agent <role>)
node scripts/vibeflow/vibe.mjs verify -- <cmd>   # run tests, record result against HEAD
node scripts/vibeflow/vibe.mjs review-request    # generate .ai/review-request.md
node scripts/vibeflow/vibe.mjs pr-status         # PR facts via gh
node scripts/vibeflow/vibe.mjs merge-gate        # full pre-merge checklist (--fetch)
node scripts/vibeflow/vibe.mjs set key=value ... # validated state updates
```

Always pass `--agent <your-role>` so the task log shows who did what.

## Roles

See `agents.md` in this folder for the six role cards
(spec-writer, architect, implementer, verifier, reviewer, fix-agent).
Per-role models are declared in `.ai/vibe-flow.config.json`.

## Steps

| skill | file | phase |
|---|---|---|
| vibe-init | `steps/init.md` | setup |
| vibe-spec | `steps/spec.md` | spec |
| vibe-build | `steps/build.md` | build + verify |
| vibe-handoff | `steps/handoff.md` | any |
| vibe-review | `steps/review.md` | review |
| vibe-merge-gate | `steps/merge-gate.md` | merge_gate |

Reference material: `references/review-rubric.md`, `references/branch-policy.md`.
