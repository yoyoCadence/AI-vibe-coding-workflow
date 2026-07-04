// VibeFlow — state, config, paths, task log
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJSON, writeJSON, nowISO, appendText, exists, writeText } from './util.mjs';

export const PHASES = ['idle', 'spec', 'build', 'verify', 'review', 'fix', 'merge_gate', 'done'];
export const ROLES = ['spec-writer', 'architect', 'implementer', 'verifier', 'reviewer', 'fix-agent', 'human'];
export const REVIEW_STATUS = ['none', 'requested', 'in_review', 'changes_requested', 'approved'];
export const MERGE_STATUS = ['none', 'blocked', 'ready', 'merged'];

const __dirname = path.dirname(fileURLToPath(import.meta.url)); // .../scripts[/vibeflow]/lib
export const scriptsDir = path.resolve(__dirname, '..');

/**
 * Locate the assets directory. Two layouts:
 *  - package repo:      <pkg>/scripts/lib  → assets at <pkg>/assets
 *  - installed project: <proj>/scripts/vibeflow/lib → assets at <proj>/scripts/vibeflow/assets
 */
export function assetsDir() {
  const candidates = [
    path.join(scriptsDir, 'assets'),
    path.resolve(scriptsDir, '..', 'assets'),
  ];
  for (const c of candidates) if (exists(c)) return c;
  throw new Error('VibeFlow assets directory not found (expected next to the scripts).');
}

/** Walk up from cwd to find the project root (the dir containing .ai/). */
export function findRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  for (;;) {
    if (exists(path.join(dir, '.ai'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function requireRoot() {
  const root = findRoot();
  if (!root) {
    console.error('[FAIL] No .ai/ directory found in this or any parent directory.');
    console.error('       Run: node scripts/vibeflow/vibe.mjs init   (from your project root)');
    process.exit(1);
  }
  return root;
}

export const aiPath = (root, ...p) => path.join(root, '.ai', ...p);

export const ROLE_KEYS = ['spec_writer', 'architect', 'implementer', 'verifier', 'reviewer', 'fix_agent'];

// Roles are fixed; tools are configurable. A profile maps every role to a
// tool (claude|codex|...), provider and model. Default keeps the common
// split (Claude builds, Codex reviews) but nothing in the workflow depends on it.
export const DEFAULT_PROFILES = {
  'claude-build-codex-review': {
    spec_writer: { tool: 'claude', provider: 'anthropic', model: 'claude-opus-4-8' },
    architect: { tool: 'claude', provider: 'anthropic', model: 'claude-opus-4-8' },
    implementer: { tool: 'claude', provider: 'anthropic', model: 'claude-sonnet-5' },
    verifier: { tool: 'claude', provider: 'anthropic', model: 'claude-haiku-4-5' },
    reviewer: { tool: 'codex', provider: 'openai', model: 'gpt-5-codex' },
    fix_agent: { tool: 'claude', provider: 'anthropic', model: 'claude-sonnet-5' },
  },
  'codex-build-claude-review': {
    spec_writer: { tool: 'claude', provider: 'anthropic', model: 'claude-opus-4-8' },
    architect: { tool: 'codex', provider: 'openai', model: 'gpt-5-codex' },
    implementer: { tool: 'codex', provider: 'openai', model: 'gpt-5-codex' },
    verifier: { tool: 'codex', provider: 'openai', model: 'gpt-5-codex' },
    reviewer: { tool: 'claude', provider: 'anthropic', model: 'claude-opus-4-8' },
    fix_agent: { tool: 'codex', provider: 'openai', model: 'gpt-5-codex' },
  },
};

export const DEFAULT_CONFIG = {
  default_provider: 'anthropic',
  active_profile: 'claude-build-codex-review',
  profiles: DEFAULT_PROFILES,
  // legacy flat mapping (pre-profile configs); still honored when the user
  // config has no profiles/active_profile
  agents: DEFAULT_PROFILES['claude-build-codex-review'],
  auto_review: true,
  hooks_enabled: true,
  allow_auto_pr: false,
  allow_auto_merge: false, // hard rule: the merge gate never merges; keep false
  require_pr: true,
  base_branch: 'main',
  protected_branches: ['main', 'master'],
  test_command: null,
};

export function loadConfig(root) {
  const user = readJSON(aiPath(root, 'vibe-flow.config.json')) || {};
  const cfg = { ...DEFAULT_CONFIG, ...user };
  cfg.profiles = { ...DEFAULT_PROFILES, ...(user.profiles || {}) };

  // Effective per-role mapping (cfg.roles):
  //  - profile mode: user config mentions profiles/active_profile
  //  - legacy mode:  only the flat `agents` key exists -> honor it untouched
  const profileMode = !!(user.profiles || user.active_profile);
  cfg.profile_mode = profileMode;
  if (!cfg.profiles[cfg.active_profile]) cfg.active_profile = 'claude-build-codex-review';
  const source = profileMode ? cfg.profiles[cfg.active_profile] : (user.agents || {});
  cfg.roles = {};
  for (const key of ROLE_KEYS) {
    cfg.roles[key] = { ...DEFAULT_PROFILES['claude-build-codex-review'][key], ...(source[key] || {}) };
  }
  cfg.allow_auto_merge = false; // enforced regardless of config
  return cfg;
}

export function loadState(root) {
  return readJSON(aiPath(root, 'state.json'));
}

export function requireState(root) {
  const s = loadState(root);
  if (!s) {
    console.error('[FAIL] .ai/state.json missing or invalid JSON. Run: vibe init (or restore it from git).');
    process.exit(1);
  }
  return s;
}

export function saveState(root, state, agent) {
  state.updated_at = nowISO();
  if (agent) state.updated_by = agent;
  writeJSON(aiPath(root, 'state.json'), state);
}

export function logTask(root, agent, phase, event) {
  const p = aiPath(root, 'task-log.md');
  if (!exists(p)) {
    writeText(p, '# Task Log\n\nAppend-only, machine-written. One row per workflow event.\n\n| time (UTC) | agent | phase | event |\n|---|---|---|---|\n');
  }
  appendText(p, `| ${nowISO()} | ${agent || '-'} | ${phase || '-'} | ${String(event).replace(/\|/g, '/').replace(/\n/g, ' ')} |\n`);
}

/** Agent identity: --agent flag > VIBE_AGENT env > 'unknown'. */
export function agentFromArgs(args) {
  return args.agent || process.env.VIBE_AGENT || 'unknown';
}
