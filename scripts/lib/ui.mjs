// VibeFlow — local web console.
// Safety model:
//  - binds 127.0.0.1 only
//  - state is read from .ai/ files; every mutation shells out to vibe.mjs
//    (same checks as the CLI), never bypasses them
//  - POSTs require the X-VibeFlow custom header (forces a CORS preflight, so
//    a malicious web page cannot fire blind requests at localhost)
//  - no merge / force-push / reset endpoints exist at all
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readText, P } from './util.mjs';
import { requireRoot, loadConfig, loadState, aiPath, scriptsDir, PHASES } from './state.mjs';
import { gitInfo, specInfo } from './inspect.mjs';

const VIBE = path.join(scriptsDir, 'vibe.mjs');
const UI_HTML = path.join(scriptsDir, 'ui', 'index.html');
const SIMPLE_CMDS = new Set(['status', 'preflight', 'handoff', 'review-request', 'pr-status', 'merge-gate']);
const TOOL_LABEL = { claude: 'Claude Code', codex: 'Codex' };

export function cmdUi(args) {
  const root = requireRoot();
  const port = Number(args.port) || 7317;
  const server = http.createServer((req, res) => {
    handle(root, req, res).catch((e) => sendJSON(res, 500, { error: e.message }));
  });
  server.listen(port, '127.0.0.1', () => {
    P.info(`VibeFlow console:  http://127.0.0.1:${port}`);
    P.info('Source of truth stays in .ai/; buttons run vibe.mjs commands. Ctrl+C to stop.');
  });
}

async function handle(root, req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const host = (req.headers.host || '').split(':')[0];
  if (host !== '127.0.0.1' && host !== 'localhost') return sendJSON(res, 403, { error: 'local access only' });

  if (req.method === 'GET' && url.pathname === '/') {
    const html = readText(UI_HTML);
    if (!html) return sendJSON(res, 500, { error: 'ui/index.html missing' });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }
  if (req.method === 'GET' && url.pathname === '/api/snapshot') {
    return sendJSON(res, 200, snapshot(root));
  }
  if (req.method === 'POST' && url.pathname === '/api/run') {
    if (req.headers['x-vibeflow'] !== '1') return sendJSON(res, 403, { error: 'missing X-VibeFlow header' });
    const body = await readBody(req);
    return sendJSON(res, 200, runAction(root, body));
  }
  sendJSON(res, 404, { error: 'not found' });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 65536) reject(new Error('body too large')); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { reject(new Error('bad JSON')); } });
    req.on('error', reject);
  });
}

function sendJSON(res, code, obj) {
  if (res.writableEnded) return;
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

// ---- actions: every mutation goes through vibe.mjs, argument-whitelisted ----

function runAction(root, body) {
  const { cmd } = body || {};
  let argv = null;
  if (SIMPLE_CMDS.has(cmd)) {
    argv = [cmd, '--agent', 'ui'];
    if (body.fetch === true && (cmd === 'preflight' || cmd === 'merge-gate')) argv.push('--fetch');
    if (cmd === 'preflight' && ['spec', 'build', 'review', 'merge'].includes(body.phase)) argv.push('--phase', body.phase);
  } else if (cmd === 'verify') {
    const command = String(body.command || '').trim();
    if (!command) return { code: 1, output: '[FAIL] verify needs an explicit test command' };
    argv = ['verify', '--agent', 'ui', '--', command];
  } else if (cmd === 'profile-set') {
    argv = ['profile', 'set', String(body.name || ''), '--agent', 'ui'];
  } else {
    return { code: 1, output: `[FAIL] command "${cmd}" is not allowed from the UI` };
  }
  const r = spawnSync(process.execPath, [VIBE, ...argv], { cwd: root, encoding: 'utf8', windowsHide: true });
  const output = [(r.stdout || ''), (r.stderr || '')].filter(Boolean).join('\n').trim();
  return { code: r.status ?? -1, output, argv: ['vibe', ...argv].join(' ') };
}

// ---- snapshot: everything the page needs, derived fresh from .ai/ + git ----

function snapshot(root) {
  const cfg = loadConfig(root);
  const state = loadState(root);
  const info = gitInfo(root, cfg);
  const spec = specInfo(root);
  const profiles = {};
  for (const [name, roles] of Object.entries(cfg.profiles)) profiles[name] = roles;

  return {
    now: new Date().toISOString(),
    root,
    state,
    phases: PHASES,
    config: {
      active_profile: cfg.active_profile,
      profile_mode: cfg.profile_mode,
      profiles,
      roles: cfg.roles,
      require_pr: cfg.require_pr,
      auto_review: cfg.auto_review,
      test_command: cfg.test_command,
    },
    git: info.isRepo ? {
      branch: info.branch, detached: info.detached, protected: info.protected,
      head: info.headShort, subject: info.headSubject,
      dirty: info.dirty.length, ahead: info.aheadBase ?? null, behind: info.behindBase ?? null,
    } : null,
    spec: {
      exists: spec.exists && !spec.placeholder,
      status: spec.meta?.status || null,
      task_id: spec.meta?.task_id || null,
      acOpen: spec.acOpen || 0,
      acDone: spec.acDone || 0,
    },
    files: {
      handoff: readText(aiPath(root, 'handoff.md')) || '',
      reviewRequest: readText(aiPath(root, 'review-request.md')) || '',
      reviewResult: readText(aiPath(root, 'review-result.md')) || '',
      spec: readText(aiPath(root, 'current-spec.md')) || '',
    },
    next: nextStep(cfg, state, spec, info),
  };
}

/** Deterministic "what now, where, with which tool" recommendation. */
function nextStep(cfg, state, spec, info) {
  const notes = [];
  if (!state) return { title: '初始化', where: '終端機', human: false, command: 'node scripts/vibeflow/vibe.mjs init', notes };
  const roles = cfg.roles;
  const pick = (roleKey) => {
    const m = roles[roleKey] || {};
    return { role: roleKey, tool: m.tool || 'claude', toolLabel: TOOL_LABEL[m.tool] || m.tool, model: m.model || '' };
  };
  const skillCmd = (m, step) => (m.tool === 'codex' ? `$${step}` : `/${step}`);
  if ((state.blockers || []).length) notes.push(`有 blockers:${state.blockers.join(';')}`);
  if (info.isRepo && info.protected && !['idle', 'spec', 'done'].includes(state.phase)) {
    notes.push(`目前在保護分支 ${info.branch} — 先切回工作分支`);
  }

  switch (state.phase) {
    case 'idle':
    case 'done': {
      const m = pick('spec_writer');
      return { title: '開新任務(寫 spec)', ...m, where: m.toolLabel, human: false, command: `${skillCmd(m, 'vibe-spec')} <描述你的需求>`, notes };
    }
    case 'spec': {
      if (spec.exists && !spec.placeholder && (spec.meta?.status || '').toLowerCase() !== 'approved') {
        return { title: '人工核准 spec', role: 'human', where: '人工步驟', human: true, command: '編輯 .ai/current-spec.md,把 status: draft 改成 status: approved', notes: [...notes, '只有人類可以核准 spec;核准前 build/review 都會被 script 擋下'] };
      }
      const m = spec.exists && !spec.placeholder ? pick('implementer') : pick('spec_writer');
      return spec.exists && !spec.placeholder
        ? { title: 'Spec 已核准 → 開始實作', ...m, where: m.toolLabel, human: false, command: skillCmd(m, 'vibe-build'), notes }
        : { title: '完成 spec', ...m, where: m.toolLabel, human: false, command: `${skillCmd(m, 'vibe-spec')} <描述你的需求>`, notes };
    }
    case 'build': {
      const m = pick('implementer');
      return { title: '實作進行中', ...m, where: m.toolLabel, human: false, command: skillCmd(m, 'vibe-build'), notes: [...notes, '完成後 commit,並跑 verify 記錄測試'] };
    }
    case 'verify': {
      const m = pick('verifier');
      const tc = cfg.test_command ? ` (建議: ${cfg.test_command})` : '';
      return { title: '執行測試並記錄', ...m, where: '終端機 / 下方 verify', human: false, command: `node scripts/vibeflow/vibe.mjs verify -- <測試指令>${tc}`, notes };
    }
    case 'review': {
      const m = pick('reviewer');
      const cmd = m.tool === 'codex'
        ? `codex exec -m ${m.model} "Read .ai/review-request.md and follow its Reviewer instructions exactly."`
        : `開新的 Claude Code session(不要用寫 code 的那個),輸入 /vibe-review`;
      return { title: '執行驗收 review', ...m, where: m.toolLabel, human: false, command: cmd, notes: [...notes, 'reviewer 必須是獨立 session,只能寫 .ai/review-result.md'] };
    }
    case 'fix': {
      const m = pick('fix_agent');
      return { title: '修正 reviewer findings', ...m, where: m.toolLabel, human: false, command: m.tool === 'codex' ? '$vibe-fix' : '/vibe-build', notes: [...notes, '依 .ai/review-result.md 逐條修;修完重跑 verify + review-request'] };
    }
    case 'merge_gate': {
      if (cfg.require_pr && !state.pr_number) {
        return { title: '人工開 PR', role: 'human', where: '終端機(人工)', human: true, command: 'gh pr create --fill', notes: [...notes, '開完 PR 再跑 merge-gate'] };
      }
      if (state.merge_status === 'ready' && state.merge_gate?.ok) {
        return { title: '人工 merge(gate 已 READY)', role: 'human', where: '終端機(人工)', human: true, command: `gh pr merge ${state.pr_number || '<PR>'} --squash --delete-branch`, notes: [...notes, 'merge 後跑: node scripts/vibeflow/vibe.mjs set phase=done merge_status=merged'] };
      }
      const m = pick('verifier');
      return { title: '跑 merge gate', ...m, where: '下方按鈕 / 終端機', human: false, command: 'node scripts/vibeflow/vibe.mjs merge-gate --fetch', notes };
    }
    default:
      return { title: `未知 phase: ${state.phase}`, where: '-', human: false, command: 'node scripts/vibeflow/vibe.mjs status', notes };
  }
}
