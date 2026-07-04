// VibeFlow — deterministic inspectors: git facts, PR facts, spec parsing, review-result parsing, secret scan
import { run, git, hasCmd, readText } from './util.mjs';
import { aiPath } from './state.mjs';

/** Collect git facts relative to the configured base branch. */
export function gitInfo(root, cfg, { fetch = false } = {}) {
  const info = { isRepo: false };
  const top = git(root, 'rev-parse', '--show-toplevel');
  if (!top.ok) return info;
  info.isRepo = true;
  info.top = top.stdout;

  const sr = git(root, 'symbolic-ref', '--short', 'HEAD');
  if (sr.ok) {
    info.branch = sr.stdout;
    info.detached = false;
  } else {
    info.branch = 'HEAD';
    info.detached = true;
  }

  const head = git(root, 'rev-parse', 'HEAD');
  info.head = head.ok ? head.stdout : null; // null => no commits yet
  info.headShort = info.head ? info.head.slice(0, 7) : null;
  info.headSubject = info.head ? git(root, 'log', '-1', '--pretty=%s').stdout : '';

  const st = git(root, 'status', '--porcelain');
  info.dirty = st.stdout ? st.stdout.split('\n').filter(Boolean) : [];

  const um = git(root, 'ls-files', '-u');
  info.unmerged = um.stdout ? [...new Set(um.stdout.split('\n').filter(Boolean).map((l) => l.split('\t').pop()))] : [];

  info.protected = (cfg.protected_branches || []).includes(info.branch);

  const base = cfg.base_branch || 'main';
  info.baseBranch = base;
  if (fetch) git(root, 'fetch', '--quiet', 'origin', base);
  let baseRef = null;
  if (git(root, 'rev-parse', '--verify', '--quiet', `origin/${base}`).ok) baseRef = `origin/${base}`;
  else if (git(root, 'rev-parse', '--verify', '--quiet', base).ok) baseRef = base;
  info.baseRef = baseRef;

  if (baseRef && info.head) {
    const lr = git(root, 'rev-list', '--left-right', '--count', `${baseRef}...HEAD`);
    if (lr.ok) {
      const [behind, ahead] = lr.stdout.split(/\s+/).map(Number);
      info.behindBase = behind;
      info.aheadBase = ahead;
    }
    const mb = git(root, 'merge-base', baseRef, 'HEAD');
    info.mergeBase = mb.ok ? mb.stdout : null;
  }
  return info;
}

/** PR facts via gh CLI (never fails hard; reports availability). */
export function prInfo(root) {
  if (!hasCmd('gh')) return { available: false, exists: false, note: 'gh CLI not installed' };
  const r = run('gh', [
    'pr', 'view', '--json',
    'number,state,isDraft,url,mergeable,reviewDecision,mergeStateStatus,baseRefName,headRefName,title',
  ], { cwd: root });
  if (r.ok) {
    try {
      return { available: true, exists: true, pr: JSON.parse(r.stdout) };
    } catch {
      return { available: true, exists: false, note: 'could not parse gh output' };
    }
  }
  const firstLine = (r.stderr || 'gh pr view failed').split('\n')[0];
  const benign = /no pull requests found|not found/i.test(firstLine);
  return { available: true, exists: false, note: firstLine, error: benign ? null : firstLine };
}

/** Parse .ai/current-spec.md: metadata, acceptance criteria, scope allowlist. */
export function specInfo(root) {
  const text = readText(aiPath(root, 'current-spec.md'));
  if (!text || /^\s*$/.test(text)) return { exists: false };

  const section = (name) => {
    const m = new RegExp(`^##\\s+${name}\\b.*$`, 'mi').exec(text);
    if (!m) return null;
    const rest = text.slice(m.index + m[0].length);
    const next = rest.search(/^##\s+/m);
    return next === -1 ? rest : rest.slice(0, next);
  };

  const ac = section('Acceptance Criteria');
  const acOpen = ac ? (ac.match(/^\s*[-*]\s*\[ \]/gm) || []).length : 0;
  const acDone = ac ? (ac.match(/^\s*[-*]\s*\[[xX]\]/gm) || []).length : 0;

  const scope = section('Scope');
  const scopePrefixes = scope
    ? scope.split('\n')
        .map((l) => l.match(/^\s*[-*]\s+`?([^`]+?)`?\s*$/))
        .filter(Boolean)
        .map((m) => m[1].trim())
        .filter((s) => s && !s.startsWith('<!--'))
    : [];

  const meta = {};
  for (const m of text.matchAll(/^[-*]\s*(task_id|status|base_branch|working_branch|title)\s*:\s*(.+)$/gim)) {
    meta[m[1].toLowerCase()] = m[2].trim();
  }

  return {
    exists: true,
    placeholder: /vibeflow:no-active-spec/.test(text),
    hasAC: ac != null && acOpen + acDone > 0,
    acOpen,
    acDone,
    acSection: ac ? ac.trim() : '',
    scopePrefixes,
    meta,
  };
}

/** Parse .ai/review-result.md: verdict, reviewed commit, unresolved P0/P1 findings. */
export function reviewResultInfo(root) {
  const text = readText(aiPath(root, 'review-result.md'));
  if (!text || /vibeflow:no-review-yet/.test(text)) return { exists: false };
  const verdictM = text.match(/^[-*]\s*verdict\s*:\s*(\S+)/im);
  const commitM = text.match(/^[-*]\s*reviewed_commit\s*:\s*([0-9a-f]{7,40})/im);
  const blocking = [];
  for (const m of text.matchAll(/^\s*[-*]\s*\[(P0|P1)\]\s*(.*)$/gim)) {
    if (!/\[resolved\]/i.test(m[2])) blocking.push(`[${m[1].toUpperCase()}] ${m[2].trim()}`);
  }
  return {
    exists: true,
    verdict: verdictM ? verdictM[1].toLowerCase() : null,
    reviewedCommit: commitM ? commitM[1] : null,
    blocking,
  };
}

// ---- secret scanning (added lines of the diff only; matches are NEVER printed) ----
const SECRET_PATTERNS = [
  { id: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'github-token', re: /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/ },
  { id: 'openai-key', re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { id: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { id: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'generic-assignment', re: /(api[_-]?key|secret|token|passwd|password)\s*[:=]\s*['"][^'"\s]{12,}['"]/i },
];

/**
 * Scan added lines between two commits for secret-looking content.
 * Returns findings as { file, line, pattern } — never the matched text itself.
 */
export function secretScan(root, fromRef, toRef) {
  const findings = [];
  const d = git(root, 'diff', '--unified=0', '--no-color', `${fromRef}..${toRef}`);
  if (!d.ok) return { ok: false, findings };
  let file = null;
  let line = 0;
  for (const raw of d.stdout.split('\n')) {
    if (raw.startsWith('+++ b/')) { file = raw.slice(6); continue; }
    if (raw.startsWith('@@')) {
      const m = raw.match(/\+(\d+)/);
      line = m ? Number(m[1]) - 1 : 0;
      continue;
    }
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      line += 1;
      const content = raw.slice(1);
      if (/\.(example|sample|template)/.test(file || '')) continue;
      for (const p of SECRET_PATTERNS) {
        if (p.re.test(content)) { findings.push({ file, line, pattern: p.id }); break; }
      }
    }
  }
  // newly added .env-style files are a finding by themselves
  const ns = git(root, 'diff', '--name-status', '--no-color', `${fromRef}..${toRef}`);
  if (ns.ok && ns.stdout) {
    for (const row of ns.stdout.split('\n')) {
      const [status, name] = row.split('\t');
      if (status === 'A' && /(^|\/)\.env(\.|$)/.test(name || '') && !/\.(example|sample|template)$/.test(name)) {
        findings.push({ file: name, line: 0, pattern: 'env-file-added' });
      }
    }
  }
  return { ok: true, findings };
}

/** Changed files between merge-base and HEAD. */
export function changedFiles(root, fromRef, toRef) {
  const r = git(root, 'diff', '--name-status', '--no-color', `${fromRef}..${toRef}`);
  if (!r.ok || !r.stdout) return [];
  return r.stdout.split('\n').filter(Boolean).map((row) => {
    const parts = row.split('\t');
    return { status: parts[0], file: parts[parts.length - 1] };
  });
}

/** Paths that are always workflow-internal and never count as "unrelated". */
export const ALWAYS_IN_SCOPE = ['.ai/', '.claude/', '.agents/', 'scripts/vibeflow/', 'AGENTS.md', 'CLAUDE.md', '.github/workflows/vibeflow-'];

export function isInScope(file, prefixes) {
  const f = file.replace(/\\/g, '/');
  for (const p of ALWAYS_IN_SCOPE) if (f === p || f.startsWith(p)) return true;
  for (const raw of prefixes) {
    const p = raw.replace(/\\/g, '/').replace(/^\.\//, '');
    if (p.includes('*')) {
      const re = new RegExp('^' + p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
      if (re.test(f)) return true;
    } else if (f === p || f.startsWith(p.endsWith('/') ? p : p + '/') || f.startsWith(p)) {
      return true;
    }
  }
  return false;
}
