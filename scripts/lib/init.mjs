// VibeFlow — installer: copies templates, skills, adapters and scripts into a target project
import path from 'node:path';
import fs from 'node:fs';
import { git, readText, writeText, readJSON, writeJSON, replaceSection, copyTree, exists, nowISO, P } from './util.mjs';
import { assetsDir, scriptsDir, loadState, logTask } from './state.mjs';

const STEP_SKILLS = {
  'vibe-init': { file: 'init.md', desc: 'Initialize or repair the VibeFlow AI workflow in this project (.ai/ state, skills, hooks)' },
  'vibe-spec': { file: 'spec.md', desc: 'Turn a vague request into a reviewable spec with testable acceptance criteria (spec-writer + architect)' },
  'vibe-build': { file: 'build.md', desc: 'Implement the approved spec on a safe working branch, with preflight checks (implementer)' },
  'vibe-handoff': { file: 'handoff.md', desc: 'Update the .ai/ handoff files so another agent can continue with zero chat context' },
  'vibe-review': { file: 'review.md', desc: 'Review the current task against spec, diff, tests and the rubric; write .ai/review-result.md (reviewer)' },
  'vibe-merge-gate': { file: 'merge-gate.md', desc: 'Run the deterministic merge gate before a PR is merged (verifier/human)' },
};

function stubSkill(name, desc, base) {
  return `---
name: ${name}
description: ${desc}. Part of the VibeFlow workflow (Spec -> Build -> Verify -> Review -> Fix -> PR -> Merge Gate).
---

This is a thin entry point. Read and follow, in this order:

1. \`${base}/vibe-flow/SKILL.md\` — core rules (always, non-negotiable)
2. \`${base}/vibe-flow/steps/${STEP_SKILLS[name].file}\` — this step's procedure
`;
}

export function cmdInit(args) {
  const target = path.resolve(args.target || process.cwd());
  fs.mkdirSync(target, { recursive: true });
  const assets = assetsDir();
  const force = !!args.force;
  const created = [];
  const skipped = [];
  const notes = [];

  const isRepo = git(target, 'rev-parse', '--show-toplevel').ok;
  if (!isRepo) notes.push('Target is NOT a git repo yet. Run: git init  (VibeFlow needs git for preflight/merge-gate).');

  // detect default/base branch
  let base = 'main';
  const oh = git(target, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD');
  if (oh.ok) base = oh.stdout.replace(/^origin\//, '');
  else if (git(target, 'rev-parse', '--verify', '--quiet', 'main').ok) base = 'main';
  else if (git(target, 'rev-parse', '--verify', '--quiet', 'master').ok) base = 'master';

  // 1) .ai/ from templates. --force may reset them, but NEVER while a task is
  //    in flight — that would erase the live handoff/spec/review state.
  const liveState = loadState(target);
  const ACTIVE_PHASES = ['spec', 'build', 'verify', 'review', 'fix', 'merge_gate'];
  const taskInFlight = !!(liveState && ACTIVE_PHASES.includes(liveState.phase));
  if (force && taskInFlight) {
    notes.push(`--force ignored for .ai/ — task ${liveState.current_task_id || '?'} is in phase "${liveState.phase}". Finish it or run: vibe set phase=done, then re-run with --force.`);
  }
  const aiForce = force && !taskInFlight;
  const tplDir = path.join(assets, 'templates', 'ai');
  for (const f of fs.readdirSync(tplDir)) {
    const dest = path.join(target, '.ai', f);
    if (exists(dest) && !aiForce) { skipped.push(rel(target, dest)); continue; }
    let content = readText(path.join(tplDir, f));
    if (f === 'state.json') {
      const s = JSON.parse(content);
      s.project = path.basename(target);
      s.base_branch = base;
      s.updated_at = nowISO();
      s.updated_by = 'vibe-init';
      content = JSON.stringify(s, null, 2) + '\n';
    }
    if (f === 'vibe-flow.config.json') {
      const c = JSON.parse(content);
      c.base_branch = base;
      content = JSON.stringify(c, null, 2) + '\n';
    }
    writeText(dest, content);
    created.push(rel(target, dest));
  }

  // 2) scripts (self-contained copy under scripts/vibeflow/, including assets)
  const scriptsDest = path.join(target, 'scripts', 'vibeflow');
  if (path.resolve(scriptsDir) !== path.resolve(scriptsDest)) {
    for (const f of fs.readdirSync(scriptsDir)) {
      const src = path.join(scriptsDir, f);
      if (f === 'assets') continue; // copied below from resolved assets dir
      if (fs.statSync(src).isDirectory()) copyTree(src, path.join(scriptsDest, f));
      else fs.copyFileSync(src, ensureDirFor(path.join(scriptsDest, f)));
    }
    copyTree(assets, path.join(scriptsDest, 'assets'));
    created.push(rel(target, scriptsDest) + path.sep + '** (vibe scripts + assets)');
  }

  // 3) skills for both agents (managed content: always refreshed)
  for (const [dir, label] of [['.claude/skills', 'Claude Code'], ['.agents/skills', 'Codex']]) {
    const baseDir = path.join(target, ...dir.split('/'));
    copyTree(path.join(assets, 'skills', 'vibe-flow'), path.join(baseDir, 'vibe-flow'));
    for (const [name, meta] of Object.entries(STEP_SKILLS)) {
      writeText(path.join(baseDir, name, 'SKILL.md'), stubSkill(name, meta.desc, dir));
    }
    created.push(`${dir}/vibe-flow + 6 step skills (${label})`);
  }

  // 4) Claude subagents (user-tunable: don't clobber)
  const agentsSrc = path.join(assets, 'adapters', 'claude', 'agents');
  for (const f of fs.readdirSync(agentsSrc)) {
    const dest = path.join(target, '.claude', 'agents', f);
    if (exists(dest) && !force) { skipped.push(rel(target, dest)); continue; }
    fs.copyFileSync(path.join(agentsSrc, f), ensureDirFor(dest));
    created.push(rel(target, dest));
  }

  // 5) Claude settings (hooks) — never overwrite an existing settings.json
  const settingsSrc = path.join(assets, 'adapters', 'claude', 'settings.json');
  const settingsDest = path.join(target, '.claude', 'settings.json');
  if (!exists(settingsDest)) {
    fs.copyFileSync(settingsSrc, ensureDirFor(settingsDest));
    created.push(rel(target, settingsDest));
  } else if (!(readText(settingsDest) || '').includes('vibeflow')) {
    const side = path.join(target, '.claude', 'settings.vibeflow.json');
    fs.copyFileSync(settingsSrc, ensureDirFor(side));
    notes.push(`.claude/settings.json already exists — wrote ${rel(target, side)}; merge its "hooks" and "permissions" blocks by hand.`);
  } else {
    skipped.push(rel(target, settingsDest));
  }

  // 6) CLAUDE.md / AGENTS.md pointer sections (marker-managed, safe to re-run)
  const snippet = readText(path.join(assets, 'adapters', 'shared', 'memory-snippet.md'));
  for (const f of ['CLAUDE.md', 'AGENTS.md']) {
    const p = path.join(target, f);
    writeText(p, replaceSection(readText(p), 'docs', snippet));
    created.push(rel(target, p) + ' (vibeflow section)');
  }

  // 7) optional GitHub Action
  if (args.with_github_action) {
    const wfSrc = path.join(assets, 'github', 'workflows', 'vibeflow-codex-review.yml');
    const wfDest = path.join(target, '.github', 'workflows', 'vibeflow-codex-review.yml');
    if (exists(wfDest) && !force) skipped.push(rel(target, wfDest));
    else { fs.copyFileSync(wfSrc, ensureDirFor(wfDest)); created.push(rel(target, wfDest)); }
    notes.push('GitHub Action installed — add the OPENAI_API_KEY secret to the repo for Codex PR reviews.');
  }

  if (loadState(target)) logTask(target, 'vibe-init', 'idle', 'vibe init completed');

  P.info(`VibeFlow installed into ${target}`);
  P.info('');
  P.info('Created/updated:');
  for (const c of created) P.info(`  + ${c}`);
  if (skipped.length) {
    P.info('Kept existing (use --force to overwrite):');
    for (const s of skipped) P.info(`  = ${s}`);
  }
  for (const n of notes) P.warn('note', n);
  P.info('');
  P.info('Next steps:');
  P.info('  1. Review .ai/vibe-flow.config.json (models, base_branch, auto_review)');
  P.info('  2. Commit the new files.');
  P.info('  3. In Claude Code:  /vibe-spec  to start your first task.');
  P.info('  4. In Codex:       $vibe-review  when a review is requested.');
}

function rel(root, p) {
  return path.relative(root, p) || p;
}

function ensureDirFor(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  return p;
}
