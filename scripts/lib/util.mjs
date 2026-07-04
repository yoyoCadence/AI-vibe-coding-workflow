// VibeFlow — shared low-level helpers (no dependencies, Node 18+)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const nowISO = () => new Date().toISOString();

/** Run a command without a shell (safe on Windows). */
export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    cwd: opts.cwd,
    input: opts.input,
    shell: opts.shell === true,
    windowsHide: true,
    stdio: opts.inherit ? 'inherit' : undefined,
  });
  if (opts.inherit) return { ok: !r.error && r.status === 0, code: r.status ?? -1, stdout: '', stderr: '' };
  return {
    ok: !r.error && r.status === 0,
    code: r.status ?? -1,
    stdout: (r.stdout || '').replace(/\r\n/g, '\n').replace(/\s+$/, ''),
    stderr: (r.stderr || '').replace(/\r\n/g, '\n').replace(/\s+$/, ''),
  };
}

export function hasCmd(cmd) {
  return run(cmd, ['--version']).ok;
}

export function git(cwd, ...args) {
  return run('git', args, { cwd });
}

export const exists = (p) => fs.existsSync(p);

export function readText(p) {
  if (!fs.existsSync(p)) return null;
  // strip UTF-8 BOM: Windows editors and PowerShell 5.1 add it, JSON.parse rejects it
  return fs.readFileSync(p, 'utf8').replace(new RegExp('^\\uFEFF'), '');
}

export function writeText(p, s) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s, 'utf8');
}

export function appendText(p, s) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, s, 'utf8');
}

export function readJSON(p) {
  const t = readText(p);
  if (t == null) return null;
  try { return JSON.parse(t); } catch { return null; }
}

export function writeJSON(p, obj) {
  writeText(p, JSON.stringify(obj, null, 2) + '\n');
}

/**
 * Replace (or append) a marker-delimited section in a markdown document.
 * Markers: <!-- vibeflow:NAME:start --> ... <!-- vibeflow:NAME:end -->
 */
export function replaceSection(text, name, body) {
  const start = `<!-- vibeflow:${name}:start -->`;
  const end = `<!-- vibeflow:${name}:end -->`;
  const block = `${start}\n${body.trim()}\n${end}`;
  if (text && text.includes(start) && text.includes(end)) {
    const i = text.indexOf(start);
    const j = text.indexOf(end) + end.length;
    return text.slice(0, i) + block + text.slice(j);
  }
  return (text ? text.replace(/\s+$/, '') + '\n\n' : '') + block + '\n';
}

/** Extract the current content of a marker-delimited section (or null). */
export function readSection(text, name) {
  if (!text) return null;
  const start = `<!-- vibeflow:${name}:start -->`;
  const end = `<!-- vibeflow:${name}:end -->`;
  const i = text.indexOf(start);
  const j = text.indexOf(end);
  if (i === -1 || j === -1 || j < i) return null;
  return text.slice(i + start.length, j).replace(/^\n/, '').replace(/\s+$/, '');
}

/** Recursive copy. Returns { copied, skipped } lists of destination paths. */
export function copyTree(src, dest, { overwrite = true } = {}) {
  const copied = [];
  const skipped = [];
  (function walk(s, d) {
    const st = fs.statSync(s);
    if (st.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      for (const e of fs.readdirSync(s)) walk(path.join(s, e), path.join(d, e));
    } else {
      if (!overwrite && fs.existsSync(d)) { skipped.push(d); return; }
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
      copied.push(d);
    }
  })(src, dest);
  return { copied, skipped };
}

// ---- console output (ASCII only: Windows consoles with CJK codepages mangle emoji) ----
export const P = {
  pass: (label, detail = '') => console.log(pad('[PASS]', label, detail)),
  warn: (label, detail = '') => console.log(pad('[WARN]', label, detail)),
  fail: (label, detail = '') => console.log(pad('[FAIL]', label, detail)),
  info: (msg) => console.log(msg),
};

function pad(tag, label, detail) {
  return `${tag} ${String(label).padEnd(24)} ${detail}`.replace(/\s+$/, '');
}

export function levelTag(level) {
  return level === 'pass' ? '[PASS]' : level === 'warn' ? '[WARN]' : '[FAIL]';
}
