<!-- vibeflow:no-active-spec -->
# No active spec

There is no task in flight. To start one, run the `vibe-spec` skill
(`/vibe-spec` in Claude Code, `$vibe-spec` in Codex).

The spec-writer will REPLACE this file with a real spec in this exact format:

```markdown
# Spec: <short task title>

- task_id: T-001
- title: <short task title>
- status: draft            <!-- draft | approved ; only a human approves -->
- created: YYYY-MM-DD
- base_branch: main
- working_branch: feat/T-001-<slug>

## Problem
What is broken / missing, and for whom. One paragraph.

## Goal
What "done" means, in one or two sentences.

## Non-goals
Explicitly out of scope (prevents scope creep and over-engineering).

## Approach (architect)
Chosen approach, alternatives rejected and why, data flow, architecture impact.

## Risks
- <risk> — mitigation

## Scope
<!-- Files/dirs this task may touch. merge-gate flags changes outside these
     prefixes/globs as "unrelated files". .ai/, .claude/, .agents/,
     scripts/vibeflow/ are always allowed. -->
- src/feature-x/
- tests/feature-x/

## Acceptance Criteria
<!-- Each item must be objectively checkable. Check off ONLY with evidence
     (test name, command output, screenshot). merge-gate requires all boxes
     checked. -->
- [ ] AC1: <verifiable statement>
- [ ] AC2: <verifiable statement>

## Test Plan
- <command to run and what proves what>
```
