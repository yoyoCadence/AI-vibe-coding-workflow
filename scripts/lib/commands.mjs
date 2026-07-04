// VibeFlow — workflow commands (everything except init lives here)
import path from 'node:path';
import { run, git, readText, writeText, replaceSection, readSection, nowISO, P, levelTag, exists } from './util.mjs';
import {
  loadConfig, loadState, requireState, saveState, logTask, aiPath, requireRoot, findRoot,
  PHASES, ROLES, REVIEW_STATUS, MERGE_STATUS, agentFromArgs,
} from './state.mjs';
import {
  gitInfo, prInfo, specInfo, reviewResultInfo, secretScan, changedFiles, isInScope,
} from './inspect.mjs';

// ---------------------------------------------------------------- helpers

function check(id, label, level, detail) {
  return { id, label, level, detail: detail || '' };
}

/**
 * Dirty files excluding .ai/ — the state files churn on every script run by
 * design, so clean-tree checks only look at real (code) changes.
 */
function codeDirty(info) {
  return (info.dirty || []).filter((l) => !l.slice(3).replace(/\\/g, '/').replace(/^"/, '').startsWith('.ai/'));
}

function printChecks(title, checks) {
  P.info(`\n== ${title} ==`);
  for (const c of checks) P.info(`${levelTag(c.level)} ${c.label.padEnd(26)} ${c.detail}`.replace(/\s+$/, ''));
  const fails = checks.filter((c) => c.level === 'fail').length;
  const warns = checks.filter((c) => c.level === 'warn').length;
  const verdict = fails ? 'FAIL' : warns ? 'PASS (with warnings)' : 'PASS';
  P.info(`-- ${title}: ${verdict} (${fails} failed, ${warns} warnings)\n`);
  return fails === 0;
}

function checksToState(checks) {
  const out = {};
  for (const c of checks) out[c.id] = { level: c.level, detail: c.detail };
  return out;
}

function checksToMd(checks, at) {
  const rows = checks.map((c) => `- ${levelTag(c.level)} **${c.label}** — ${c.detail || 'ok'}`);
  return `Last run: ${at}\n\n${rows.join('\n')}`;
}

const HANDOFF_SKELETON = `# VibeFlow Handoff

Read this file plus \`.ai/state.json\` before doing anything. Chat history is NOT a handoff.

## Snapshot (generated — do not edit by hand)
<!-- vibeflow:generated:start -->
(not generated yet)
<!-- vibeflow:generated:end -->

## Preflight (generated)
<!-- vibeflow:preflight:start -->
(not run yet)
<!-- vibeflow:preflight:end -->

## Merge gate (generated)
<!-- vibeflow:gate:start -->
(not run yet)
<!-- vibeflow:gate:end -->

## Agent notes (manual — written by the previous agent for the next one)
<!-- vibeflow:manual:start -->
- What I did:
- What is NOT done yet:
- Known issues / gotchas:
- What the next agent should do first:
<!-- vibeflow:manual:end -->
`;

function renderSnapshot(root, cfg, state, info, spec, agent) {
  const L = [];
  L.push(`- **updated**: ${nowISO()} by \`${agent}\``);
  L.push(`- **task**: ${state.current_task_id || '(none)'}${spec.exists && spec.meta.title ? ` — ${spec.meta.title}` : ''}`);
  L.push(`- **phase**: \`${state.phase}\` | **owner_agent**: \`${state.owner_agent || '-'}\``);
  L.push(`- **next_action**: ${state.next_action || '(not set — fix this!)'}`);
  if (info.isRepo) {
    const sync = info.baseRef ? ` (vs ${info.baseRef}: ahead ${info.aheadBase ?? '?'}, behind ${info.behindBase ?? '?'})` : ' (base branch not found locally)';
    L.push(`- **branch**: \`${info.branch}\`${info.detached ? ' DETACHED' : ''} | base: \`${state.base_branch}\`${sync}`);
    L.push(`- **last_commit**: \`${info.head || 'none'}\`${info.headSubject ? ` ${info.headSubject}` : ''}`);
    if (info.dirty.length) {
      L.push(`- **working tree**: ${info.dirty.length} dirty file(s):`);
      for (const f of info.dirty.slice(0, 20)) L.push(`  - \`${f}\``);
      if (info.dirty.length > 20) L.push(`  - ... and ${info.dirty.length - 20} more`);
    } else {
      L.push('- **working tree**: clean');
    }
  } else {
    L.push('- **branch**: NOT A GIT REPO');
  }
  const t = state.tests_run || {};
  L.push(`- **tests**: ${t.status || 'none'}${t.command ? ` (\`${t.command}\`)` : ''}${t.commit ? ` @ ${String(t.commit).slice(0, 7)}` : ''}${t.at ? ` at ${t.at}` : ''}`);
  L.push(`- **review_status**: \`${state.review_status}\` | **merge_status**: \`${state.merge_status}\` | **PR**: ${state.pr_number ? `#${state.pr_number}` : 'none'}`);
  const blockers = state.blockers || [];
  L.push(`- **blockers**: ${blockers.length ? '' : 'none'}`);
  for (const b of blockers) L.push(`  - ${b}`);
  if (info.isRepo && info.head) {
    const log = git(root, 'log', '-5', '--pretty=%h %s');
    if (log.ok && log.stdout) {
      L.push('- **recent commits**:');
      for (const line of log.stdout.split('\n')) L.push(`  - ${line}`);
    }
  }
  return L.join('\n');
}

/** Regenerate the generated section of .ai/handoff.md (used by several commands). */
function refreshHandoff(root, cfg, state, info, agent, { notes } = {}) {
  const p = aiPath(root, 'handoff.md');
  let text = readText(p) || HANDOFF_SKELETON;
  const spec = specInfo(root);
  text = replaceSection(text, 'generated', renderSnapshot(root, cfg, state, info, spec, agent));
  if (notes) {
    const manual = readSection(text, 'manual') || '';
    text = replaceSection(text, 'manual', `${manual}\n- [${agent} ${nowISO()}] ${notes}`.trim());
  }
  writeText(p, text);
  return p;
}

function syncStateFromGit(state, info) {
  if (info.isRepo) {
    state.last_commit = info.head;
    state.dirty_files = info.dirty.slice(0, 100);
    // Record working_branch only when unset. Changing it requires an explicit
    // `vibe set working_branch=...` — otherwise a wrong-branch drift would
    // self-heal into looking correct on the next script run.
    if (!state.working_branch && !info.detached && !info.protected) state.working_branch = info.branch;
  }
}

function specApprovalInfo(spec) {
  const usable = spec.exists && !spec.placeholder && spec.hasAC;
  const status = (spec.meta?.status || '').toLowerCase();
  return { usable, status, approved: usable && status === 'approved' };
}

// ---------------------------------------------------------------- status

export function cmdStatus(args) {
  const root = requireRoot();
  const cfg = loadConfig(root);
  const state = requireState(root);
  const info = gitInfo(root, cfg);
  const spec = specInfo(root);

  P.info(`VibeFlow status — ${state.project || path.basename(root)} (${root})`);
  P.info(`  task:          ${state.current_task_id || '(none)'}`);
  P.info(`  phase:         ${state.phase}   owner: ${state.owner_agent || '-'}`);
  P.info(`  next_action:   ${state.next_action || '(not set)'}`);
  P.info(`  branch:        ${info.isRepo ? info.branch : 'NOT A GIT REPO'}   base: ${state.base_branch}`);
  P.info(`  last_commit:   ${info.headShort || 'none'} ${info.headSubject || ''}`.trimEnd());
  P.info(`  working tree:  ${info.isRepo ? (info.dirty.length ? `${info.dirty.length} dirty file(s)` : 'clean') : '-'}`);
  const t = state.tests_run || {};
  P.info(`  tests:         ${t.status || 'none'}${t.commit ? ` @ ${String(t.commit).slice(0, 7)}` : ''}`);
  P.info(`  review:        ${state.review_status}   merge: ${state.merge_status}   PR: ${state.pr_number ? '#' + state.pr_number : 'none'}`);
  P.info(`  spec:          ${spec.exists && !spec.placeholder ? `${spec.meta.task_id || '?'} (${spec.meta.status || 'no status'}, AC ${spec.acDone}/${spec.acDone + spec.acOpen} done)` : 'none'}`);
  P.info(`  blockers:      ${(state.blockers || []).length || 'none'}`);

  if (info.isRepo && state.working_branch && !info.protected && info.branch !== state.working_branch) {
    P.warn('branch drift', `state.working_branch is "${state.working_branch}" but you are on "${info.branch}"`);
  }
  if (info.isRepo && state.last_commit && info.head !== state.last_commit) {
    P.warn('stale state', 'state.json last_commit differs from HEAD — run: vibe handoff');
  }
}

// ---------------------------------------------------------------- preflight

export function cmdPreflight(args) {
  const root = requireRoot();
  const cfg = loadConfig(root);
  const state = requireState(root);
  const agent = agentFromArgs(args);
  const phase = args.phase || 'build';
  const info = gitInfo(root, cfg, { fetch: !!args.fetch });
  const checks = [];

  checks.push(check('git_repo', 'git repository', info.isRepo ? 'pass' : 'fail',
    info.isRepo ? info.top : 'not a git repo — run: git init'));

  if (info.isRepo) {
    checks.push(check('has_commits', 'has commits', info.head ? 'pass' : 'fail',
      info.head ? info.headShort : 'no commits yet — make an initial commit'));
    checks.push(check('branch', 'current branch',
      info.detached ? 'fail' : 'pass',
      info.detached ? 'detached HEAD — check out a branch' : info.branch));
    checks.push(check('not_protected', 'not on protected branch',
      info.protected ? (phase === 'spec' ? 'warn' : 'fail') : 'pass',
      info.protected ? `you are on "${info.branch}" — create a working branch before writing code` : `"${info.branch}" is safe to work on`));
    const dirtyCode = codeDirty(info);
    checks.push(check('clean_tree', 'working tree',
      dirtyCode.length === 0 ? 'pass' : (phase === 'review' || phase === 'merge' ? 'fail' : 'warn'),
      dirtyCode.length === 0
        ? (info.dirty.length ? 'clean (only .ai/ state files pending)' : 'clean')
        : `${dirtyCode.length} uncommitted file(s) — commit or stash before switching phases`));
    if (!info.baseRef) {
      checks.push(check('base_sync', 'synced with base', 'warn', `base branch "${cfg.base_branch}" not found locally (no origin/${cfg.base_branch} either)`));
    } else {
      const behind = info.behindBase ?? 0;
      checks.push(check('base_sync', 'synced with base', behind === 0 ? 'pass' : 'fail',
        `${info.baseRef}: ahead ${info.aheadBase ?? 0}, behind ${behind}${behind ? ' — rebase/merge base first (try --fetch to refresh)' : ''}`));
    }
    checks.push(check('no_conflicts', 'merge conflicts', info.unmerged.length === 0 ? 'pass' : 'fail',
      info.unmerged.length === 0 ? 'none' : `unmerged paths: ${info.unmerged.slice(0, 5).join(', ')}`));

    const pr = prInfo(root);
    if (!pr.available) checks.push(check('pr', 'PR status', 'warn', pr.note));
    else if (pr.exists) checks.push(check('pr', 'PR status', 'pass', `#${pr.pr.number} ${pr.pr.state}${pr.pr.isDraft ? ' (draft)' : ''} ${pr.pr.url || ''}`));
    else checks.push(check('pr', 'PR status', pr.error ? 'warn' : 'pass', pr.error ? `gh error: ${pr.error}` : 'no PR for this branch yet'));
    if (pr.exists) state.pr_number = pr.pr.number;
    else if (!pr.error && state.pr_number != null) state.pr_number = null; // clear stale PR number
  }

  const spec = specInfo(root);
  const sa = specApprovalInfo(spec);
  // every phase except `spec` itself requires a human-approved spec
  const specLevel = phase === 'spec'
    ? (sa.usable ? 'pass' : 'warn')
    : (sa.approved ? 'pass' : 'fail');
  checks.push(check('spec', 'current spec', specLevel,
    !sa.usable
      ? 'no usable spec in .ai/current-spec.md — run /vibe-spec first'
      : sa.approved || phase === 'spec'
        ? `${spec.meta.task_id || '?'} status=${spec.meta.status || '?'} AC ${spec.acDone}/${spec.acDone + spec.acOpen} done`
        : `spec status is "${spec.meta.status || 'missing'}" — a human must set "status: approved" before ${phase}`));

  if (info.isRepo && state.working_branch && !info.protected && !info.detached && info.branch !== state.working_branch) {
    checks.push(check('branch_matches_state', 'branch matches state', 'warn',
      `state.working_branch="${state.working_branch}" but HEAD is "${info.branch}" — wrong branch, or update state`));
  }

  const ok = printChecks(`preflight (phase: ${phase})`, checks);

  syncStateFromGit(state, info);
  state.preflight = { at: nowISO(), ok, phase, checks: checksToState(checks) };
  saveState(root, state, agent);

  const p = aiPath(root, 'handoff.md');
  writeText(p, replaceSection(readText(p) || HANDOFF_SKELETON, 'preflight', checksToMd(checks, state.preflight.at)));
  logTask(root, agent, state.phase, `preflight (${phase}): ${ok ? 'PASS' : 'FAIL'}`);
  process.exit(ok ? 0 : 1);
}

// ---------------------------------------------------------------- handoff

export function cmdHandoff(args) {
  const root = requireRoot();
  const cfg = loadConfig(root);
  const state = requireState(root);
  const agent = args.auto ? (args.agent || 'claude-hook') : agentFromArgs(args);
  const info = gitInfo(root, cfg);

  syncStateFromGit(state, info);
  saveState(root, state, agent);
  const p = refreshHandoff(root, cfg, state, info, agent, { notes: args.notes });
  logTask(root, agent, state.phase, `handoff updated${args.auto ? ' (auto)' : ''}`);

  if (!args.quiet) {
    P.info(`Handoff snapshot written to ${path.relative(root, p) || p}`);
    if (!args.auto) {
      P.info('Now update the "Agent notes" section by hand (what you did, gotchas, what is next),');
      P.info('and set the next action, e.g.: node scripts/vibeflow/vibe.mjs set next_action="run vibe-review" owner_agent=reviewer');
    }
  }
}

// ---------------------------------------------------------------- review request

export function cmdReviewRequest(args) {
  const root = requireRoot();
  const cfg = loadConfig(root);
  const state = requireState(root);
  const agent = agentFromArgs(args);
  const info = gitInfo(root, cfg);
  const spec = specInfo(root);

  if (!info.isRepo || !info.head) { P.fail('review-request', 'need a git repo with at least one commit'); process.exit(1); }
  if (!spec.exists || spec.placeholder || !spec.hasAC) {
    P.fail('review-request', 'no usable spec (.ai/current-spec.md) — a review needs acceptance criteria');
    process.exit(1);
  }
  if ((spec.meta.status || '').toLowerCase() !== 'approved') {
    P.fail('review-request', `spec status is "${spec.meta.status || 'missing'}" — a human must set "status: approved" before review`);
    process.exit(1);
  }
  const from = info.mergeBase || info.baseRef;
  if (!from) {
    P.fail('review-request', `cannot find base branch "${cfg.base_branch}" to diff against — set base_branch in .ai/vibe-flow.config.json`);
    process.exit(1);
  }

  const nameStatus = git(root, 'diff', '--name-status', '--no-color', `${from}..HEAD`).stdout || '(no changes)';
  const stat = git(root, 'diff', '--stat', '--no-color', `${from}..HEAD`).stdout || '(no changes)';
  const t = state.tests_run || {};
  const testsStale = t.commit && t.commit !== info.head;
  const reviewerModel = cfg.agents.reviewer?.model || 'gpt-5-codex';

  const md = `# VibeFlow Review Request

- generated: ${nowISO()} by \`${agent}\`
- task_id: ${state.current_task_id || spec.meta.task_id || '(none)'}
- working_branch: \`${info.branch}\`
- base: \`${cfg.base_branch}\` (diff base: \`${from}\`)
- head_commit: \`${info.head}\`
- pr_number: ${state.pr_number ? `#${state.pr_number}` : 'none yet'}
- tests: **${t.status || 'none'}**${t.command ? ` (\`${t.command}\`)` : ''}${t.commit ? ` @ ${String(t.commit).slice(0, 7)}` : ''}${testsStale ? ' — STALE: tests did not run on head commit' : ''}
- working_tree: ${codeDirty(info).length ? `DIRTY (${codeDirty(info).length} uncommitted code files — review committed code only)` : 'clean'}

## What to review
1. Spec with acceptance criteria: \`.ai/current-spec.md\`
2. Diff: \`git diff ${from.slice(0, 12)}..HEAD\` (summary below)
3. Handoff context: \`.ai/handoff.md\`, machine state: \`.ai/state.json\`
4. Rubric (mandatory checklist): \`.agents/skills/vibe-flow/references/review-rubric.md\` (same file under \`.claude/skills/\`)

## Acceptance criteria (from spec)
${spec.acSection || '(none found)'}

## Changed files
\`\`\`
${nameStatus}
\`\`\`

## Diff stat
\`\`\`
${stat}
\`\`\`

## Reviewer instructions
You are the VibeFlow **reviewer** (read-only on implementation files).
1. Read \`.agents/skills/vibe-flow/steps/review.md\` and follow it exactly.
2. Review commit \`${info.head}\` on branch \`${info.branch}\` against the spec and the rubric.
3. Write your findings to \`.ai/review-result.md\` using its existing template format
   (verdict, reviewed_commit, findings tagged [P0]..[P3]).
4. Then record the outcome:
   \`node scripts/vibeflow/vibe.mjs set review_status=<approved|changes_requested> phase=<merge_gate|fix> owner_agent=<verifier|fix-agent> next_action="<one line>" --agent reviewer\`
   \`node scripts/vibeflow/vibe.mjs handoff --agent reviewer\`
5. Do NOT edit implementation files. Do NOT merge. Do NOT fix issues yourself.
`;

  writeText(aiPath(root, 'review-request.md'), md);

  state.review_status = 'requested';
  state.phase = 'review';
  state.owner_agent = 'reviewer';
  state.next_action = 'Run Codex review of .ai/review-request.md';
  syncStateFromGit(state, info);
  saveState(root, state, agent);
  refreshHandoff(root, cfg, state, info, agent);
  logTask(root, agent, 'review', `review request generated for ${info.headShort}`);

  P.info('Review request written to .ai/review-request.md');
  P.info('');
  P.info('Run the reviewer from a terminal (Codex CLI):');
  P.info(`  codex exec -m ${reviewerModel} "Read .ai/review-request.md and follow its Reviewer instructions exactly."`);
  P.info('or inside Codex, type: $vibe-review');
}

// ---------------------------------------------------------------- pr status

export function cmdPrStatus(args) {
  const root = requireRoot();
  const state = requireState(root);
  const agent = agentFromArgs(args);
  const pr = prInfo(root);

  if (!pr.available) { P.fail('pr-status', 'gh CLI not installed — install from https://cli.github.com'); process.exit(1); }
  if (!pr.exists) {
    P.info(`No PR for the current branch.${pr.note ? ` (${pr.note})` : ''}`);
    P.info('Create one manually when ready:  gh pr create --fill --draft');
    if (!pr.error && state.pr_number != null) {
      state.pr_number = null;
      saveState(root, state, agent);
      logTask(root, agent, state.phase, 'pr-status: cleared stale pr_number (no PR for branch)');
      P.info('Cleared stale pr_number from state.');
    }
    process.exit(0);
  }
  const d = pr.pr;
  P.info(`PR #${d.number}: ${d.title}`);
  P.info(`  url:        ${d.url}`);
  P.info(`  state:      ${d.state}${d.isDraft ? ' (draft)' : ''}`);
  P.info(`  base<-head: ${d.baseRefName} <- ${d.headRefName}`);
  P.info(`  mergeable:  ${d.mergeable || '?'}   mergeState: ${d.mergeStateStatus || '?'}`);
  P.info(`  reviews:    ${d.reviewDecision || 'none'}`);

  state.pr_number = d.number;
  if (d.state === 'MERGED') state.merge_status = 'merged';
  saveState(root, state, agent);
  logTask(root, agent, state.phase, `pr-status: #${d.number} ${d.state}`);
}

// ---------------------------------------------------------------- merge gate

export function cmdMergeGate(args) {
  const root = requireRoot();
  const cfg = loadConfig(root);
  const state = requireState(root);
  const agent = agentFromArgs(args);
  const info = gitInfo(root, cfg, { fetch: !!args.fetch });
  const spec = specInfo(root);
  const rr = reviewResultInfo(root);
  const checks = [];

  if (!info.isRepo || !info.head) {
    P.fail('merge-gate', 'need a git repo with at least one commit');
    process.exit(1);
  }

  checks.push(check('not_protected', 'not on protected branch',
    info.protected || info.detached ? 'fail' : 'pass',
    info.protected ? `on "${info.branch}" — never merge from the base branch itself` : info.detached ? 'detached HEAD' : info.branch));

  const dirtyCode = codeDirty(info);
  checks.push(check('clean_tree', 'no uncommitted changes',
    dirtyCode.length === 0 ? 'pass' : 'fail',
    dirtyCode.length === 0
      ? (info.dirty.length ? 'clean (only .ai/ state files pending — commit them with the merge)' : 'clean')
      : `${dirtyCode.length} dirty file(s): ${dirtyCode.slice(0, 5).map((l) => l.slice(3)).join(', ')}`));

  const sa = specApprovalInfo(spec);
  const specOk = sa.usable;
  checks.push(check('spec_exists', 'spec exists & approved', sa.approved ? 'pass' : 'fail',
    !specOk
      ? 'no usable spec with acceptance criteria'
      : sa.approved
        ? `${spec.meta.task_id || '?'} (approved)`
        : `${spec.meta.task_id || '?'} status="${spec.meta.status || 'missing'}" — a human must set "status: approved"`));

  checks.push(check('ac_complete', 'acceptance criteria done',
    specOk && spec.acOpen === 0 && spec.acDone > 0 ? 'pass' : 'fail',
    specOk ? `${spec.acDone} done, ${spec.acOpen} open` : 'no spec'));

  const t = state.tests_run || {};
  const testsOk = t.status === 'passed' && t.commit === info.head;
  checks.push(check('tests_passed', 'tests passed on HEAD', testsOk ? 'pass' : 'fail',
    t.status !== 'passed'
      ? `tests_run.status=${t.status || 'none'} — run: vibe verify -- <test command>`
      : t.commit !== info.head
        ? `tests ran on ${String(t.commit).slice(0, 7)} but HEAD is ${info.headShort} — re-run verify`
        : `${t.command || ''} @ ${info.headShort}`));

  checks.push(check('review_approved', 'reviewer verdict', rr.exists && rr.verdict === 'approved' ? 'pass' : 'fail',
    !rr.exists ? 'no review result — run the reviewer first' : `verdict=${rr.verdict || 'missing'}`));

  checks.push(check('no_blocking_findings', 'no P0/P1 findings',
    rr.exists && rr.blocking.length === 0 ? 'pass' : 'fail',
    !rr.exists ? 'no review result' : rr.blocking.length ? rr.blocking.slice(0, 3).join(' | ') : 'none'));

  const reviewCurrent = rr.exists && rr.reviewedCommit && info.head.startsWith(rr.reviewedCommit);
  checks.push(check('review_commit_current', 'review covers HEAD', reviewCurrent ? 'pass' : 'fail',
    !rr.exists ? 'no review result'
      : !rr.reviewedCommit ? 'review-result.md missing reviewed_commit'
        : reviewCurrent ? `reviewed ${String(rr.reviewedCommit).slice(0, 7)}` : `reviewed ${String(rr.reviewedCommit).slice(0, 7)} but HEAD is ${info.headShort} — request a re-review`));

  const handoffText = readText(aiPath(root, 'handoff.md')) || '';
  checks.push(check('handoff_current', 'handoff updated for HEAD',
    handoffText.includes(info.head) ? 'pass' : 'fail',
    handoffText.includes(info.head) ? 'snapshot mentions HEAD' : 'run: vibe handoff'));

  const pr = cfg.require_pr ? prInfo(root) : null;
  if (!cfg.require_pr) {
    checks.push(check('pr_exists', 'PR exists', 'warn', 'skipped (require_pr=false in config)'));
  } else if (!pr.available) {
    checks.push(check('pr_exists', 'PR exists', 'fail', 'gh CLI not installed — cannot verify PR (or set require_pr=false)'));
  } else if (!pr.exists) {
    checks.push(check('pr_exists', 'PR exists', 'fail', `no PR for this branch${pr.note ? ` (${pr.note})` : ''} — gh pr create --fill`));
  } else {
    const open = pr.pr.state === 'OPEN' && !pr.pr.isDraft;
    checks.push(check('pr_exists', 'PR exists', open ? 'pass' : 'fail',
      `#${pr.pr.number} ${pr.pr.state}${pr.pr.isDraft ? ' (draft — mark ready first)' : ''}`));
    state.pr_number = pr.pr.number;
    if (pr.pr.mergeable === 'CONFLICTING') {
      checks.push(check('pr_mergeable', 'PR mergeable (GitHub)', 'fail', 'GitHub reports merge conflicts'));
    }
  }

  if (!info.baseRef) {
    checks.push(check('synced_with_base', 'synced with base', 'fail', `base branch "${cfg.base_branch}" not found — fetch it or fix config`));
  } else {
    const behind = info.behindBase ?? 0;
    checks.push(check('synced_with_base', 'synced with base', behind === 0 ? 'pass' : 'fail',
      `${info.baseRef}: behind ${behind}${behind ? ' — rebase/merge base, re-test, re-review' : ''}${args.fetch ? '' : ' (tip: --fetch for fresh remote state)'}`));
  }

  checks.push(check('no_conflicts', 'no merge conflicts', info.unmerged.length === 0 ? 'pass' : 'fail',
    info.unmerged.length === 0 ? 'none' : `unmerged: ${info.unmerged.slice(0, 5).join(', ')}`));

  const from = info.mergeBase || info.baseRef;
  if (from) {
    const scan = secretScan(root, from, 'HEAD');
    checks.push(check('no_secrets', 'no secrets in diff', scan.ok && scan.findings.length === 0 ? 'pass' : 'fail',
      !scan.ok ? 'diff failed' : scan.findings.length
        ? scan.findings.slice(0, 5).map((f) => `${f.file}:${f.line} (${f.pattern})`).join(', ')
        : 'clean'));

    const changed = changedFiles(root, from, 'HEAD');
    if (spec.scopePrefixes && spec.scopePrefixes.length) {
      const unrelated = changed.filter((c) => !isInScope(c.file, spec.scopePrefixes)).map((c) => c.file);
      checks.push(check('no_unrelated_files', 'no unrelated files', unrelated.length === 0 ? 'pass' : 'fail',
        unrelated.length ? `outside spec Scope: ${unrelated.slice(0, 8).join(', ')}` : `all ${changed.length} changed files in scope`));
    } else {
      checks.push(check('no_unrelated_files', 'no unrelated files', 'warn', 'spec has no "## Scope" section — check skipped'));
    }
  } else {
    checks.push(check('no_secrets', 'no secrets in diff', 'fail', 'no base to diff against'));
  }

  const ok = printChecks('merge gate', checks);

  state.merge_status = ok ? 'ready' : 'blocked';
  if (ok) state.phase = 'merge_gate';
  state.merge_gate = { at: nowISO(), ok, checks: checksToState(checks) };
  syncStateFromGit(state, info);
  saveState(root, state, agent);
  const p = aiPath(root, 'handoff.md');
  writeText(p, replaceSection(readText(p) || HANDOFF_SKELETON, 'gate', checksToMd(checks, state.merge_gate.at)));
  logTask(root, agent, state.phase, `merge-gate: ${ok ? 'READY' : 'BLOCKED'}`);

  if (ok) {
    P.info('Merge gate PASSED. VibeFlow never merges automatically — a human merges:');
    P.info(`  gh pr merge ${state.pr_number || '<PR>'} --squash --delete-branch`);
    P.info('After merging:  node scripts/vibeflow/vibe.mjs set phase=done merge_status=merged next_action="pick next task"');
  } else {
    P.info('Merge gate BLOCKED. Fix the [FAIL] items above, then re-run. Typical route:');
    P.info('  vibe set phase=fix owner_agent=fix-agent  ->  fix  ->  vibe verify  ->  vibe review-request  ->  re-review');
  }
  process.exit(ok ? 0 : 1);
}

// ---------------------------------------------------------------- verify (record test run)

export function cmdVerify(args, passthrough) {
  const root = requireRoot();
  const cfg = loadConfig(root);
  const state = requireState(root);
  const agent = agentFromArgs(args);
  const info = gitInfo(root, cfg);
  const command = (passthrough && passthrough.length ? passthrough.join(' ') : '') || args.command || cfg.test_command;

  if (!command) {
    P.fail('verify', 'no test command. Use: vibe verify -- <command>  (or set test_command in .ai/vibe-flow.config.json)');
    process.exit(1);
  }
  P.info(`verify: running \`${command}\``);
  const r = run(command, [], { cwd: root, shell: true, inherit: true });
  const status = r.ok ? 'passed' : 'failed';

  state.tests_run = { status, command, exit_code: r.code, commit: info.head, at: nowISO() };
  syncStateFromGit(state, info);
  saveState(root, state, agent);
  logTask(root, agent, state.phase, `verify: ${status} (exit ${r.code}) \`${command}\``);

  P.info(`verify: ${status.toUpperCase()} (exit ${r.code}) — recorded in .ai/state.json for commit ${info.headShort || 'none'}`);
  if (codeDirty(info).length) P.warn('dirty tree', 'tests ran with uncommitted changes; commit and re-run verify before requesting review');
  process.exit(r.code === 0 ? 0 : 1);
}

// ---------------------------------------------------------------- set (validated state updates)

const SETTABLE = {
  current_task_id: (v) => v,
  phase: (v) => { mustBeIn(v, PHASES, 'phase'); return v; },
  owner_agent: (v) => { if (v !== 'null') mustBeIn(v, ROLES, 'owner_agent'); return v === 'null' ? null : v; },
  base_branch: (v) => v,
  working_branch: (v) => (v === 'null' ? null : v),
  pr_number: (v) => (v === 'null' ? null : assertInt(v)),
  review_status: (v) => { mustBeIn(v, REVIEW_STATUS, 'review_status'); return v; },
  merge_status: (v) => { mustBeIn(v, MERGE_STATUS, 'merge_status'); return v; },
  next_action: (v) => v,
  blockers: (v) => {
    if (v === 'none' || v === '') return [];
    try { const j = JSON.parse(v); if (Array.isArray(j)) return j.map(String); } catch { /* fall through */ }
    return v.split(';').map((s) => s.trim()).filter(Boolean);
  },
};

function mustBeIn(v, list, name) {
  if (!list.includes(v)) throw new Error(`invalid ${name}="${v}" (allowed: ${list.join(', ')})`);
}
function assertInt(v) {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`expected integer, got "${v}"`);
  return n;
}

export function cmdSet(args, positional) {
  const root = requireRoot();
  const state = requireState(root);
  const agent = agentFromArgs(args);
  const pairs = positional.filter((p) => p.includes('='));
  if (!pairs.length) {
    P.fail('set', 'usage: vibe set key=value [key=value ...]  keys: ' + Object.keys(SETTABLE).join(', '));
    process.exit(1);
  }
  const applied = [];
  for (const pair of pairs) {
    const i = pair.indexOf('=');
    const key = pair.slice(0, i);
    const value = pair.slice(i + 1);
    if (!(key in SETTABLE)) { P.fail('set', `unknown key "${key}" (allowed: ${Object.keys(SETTABLE).join(', ')})`); process.exit(1); }
    state[key] = SETTABLE[key](value);
    applied.push(`${key}=${JSON.stringify(state[key])}`);
  }
  saveState(root, state, agent);
  logTask(root, agent, state.phase, `state set: ${applied.join(' ')}`);
  for (const a of applied) P.info(`set ${a}`);
}

// ---------------------------------------------------------------- hook-stop (Claude Code Stop hook; must never block)

export function cmdHookStop() {
  try {
    const rootDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const root = findRoot(rootDir);
    if (!root) return process.exit(0);
    const cfg = loadConfig(root);
    if (!cfg.hooks_enabled) return process.exit(0);
    const state = loadState(root);
    if (!state) return process.exit(0);

    const info = gitInfo(root, cfg);
    syncStateFromGit(state, info);
    saveState(root, state, 'claude-hook');
    refreshHandoff(root, cfg, state, info, 'claude-hook');
    console.log('vibeflow: handoff snapshot refreshed');

    const spec = specInfo(root);
    const readyForReview = cfg.auto_review
      && ['build', 'verify', 'fix'].includes(state.phase)
      && info.isRepo && info.head
      && codeDirty(info).length === 0
      && spec.exists && !spec.placeholder && spec.hasAC
      && (spec.meta.status || '').toLowerCase() === 'approved'
      && (info.aheadBase ?? 0) > 0;
    if (readyForReview) {
      const existing = readText(aiPath(root, 'review-request.md')) || '';
      if (!existing.includes(info.head)) {
        // reuse the command implementation without exiting this process on its prints
        cmdReviewRequestQuiet(root, cfg, state, info, spec);
        console.log('vibeflow: review request generated (.ai/review-request.md) — run Codex review when ready');
      }
    }
  } catch (e) {
    console.log(`vibeflow: hook skipped (${e.message})`);
  }
  process.exit(0);
}

function cmdReviewRequestQuiet(root, cfg, state, info, spec) {
  const from = info.mergeBase || info.baseRef;
  if (!from) return;
  const nameStatus = git(root, 'diff', '--name-status', '--no-color', `${from}..HEAD`).stdout || '(no changes)';
  const stat = git(root, 'diff', '--stat', '--no-color', `${from}..HEAD`).stdout || '(no changes)';
  const t = state.tests_run || {};
  const md = `# VibeFlow Review Request

- generated: ${nowISO()} by \`claude-hook\` (auto)
- task_id: ${state.current_task_id || spec.meta.task_id || '(none)'}
- working_branch: \`${info.branch}\`
- base: \`${cfg.base_branch}\` (diff base: \`${from}\`)
- head_commit: \`${info.head}\`
- pr_number: ${state.pr_number ? `#${state.pr_number}` : 'none yet'}
- tests: **${t.status || 'none'}**${t.command ? ` (\`${t.command}\`)` : ''}${t.commit && t.commit !== info.head ? ' — STALE: not run on head commit' : ''}
- working_tree: clean

## What to review
1. Spec with acceptance criteria: \`.ai/current-spec.md\`
2. Diff: \`git diff ${from.slice(0, 12)}..HEAD\` (summary below)
3. Handoff context: \`.ai/handoff.md\`, machine state: \`.ai/state.json\`
4. Rubric (mandatory checklist): \`.agents/skills/vibe-flow/references/review-rubric.md\`

## Acceptance criteria (from spec)
${spec.acSection || '(none found)'}

## Changed files
\`\`\`
${nameStatus}
\`\`\`

## Diff stat
\`\`\`
${stat}
\`\`\`

## Reviewer instructions
You are the VibeFlow **reviewer** (read-only on implementation files).
1. Read \`.agents/skills/vibe-flow/steps/review.md\` and follow it exactly.
2. Review commit \`${info.head}\` on branch \`${info.branch}\` against the spec and the rubric.
3. Write findings to \`.ai/review-result.md\` (verdict, reviewed_commit, [P0]..[P3] findings).
4. Record the outcome via \`vibe set\` and \`vibe handoff --agent reviewer\` as described in steps/review.md.
5. Do NOT edit implementation files. Do NOT merge. Do NOT fix issues yourself.
`;
  writeText(aiPath(root, 'review-request.md'), md);
  state.review_status = 'requested';
  state.phase = 'review';
  state.owner_agent = 'reviewer';
  state.next_action = 'Run Codex review of .ai/review-request.md';
  saveState(root, state, 'claude-hook');
  logTask(root, 'claude-hook', 'review', `review request auto-generated for ${info.headShort}`);
}
