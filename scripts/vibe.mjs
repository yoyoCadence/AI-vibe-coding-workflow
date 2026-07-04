#!/usr/bin/env node
// VibeFlow CLI — deterministic state/handoff/preflight/review/merge-gate tooling.
// Zero dependencies. Node 18+. Windows/macOS/Linux.
import { pathToFileURL } from 'node:url';
import { cmdInit } from './lib/init.mjs';
import {
  cmdStatus, cmdPreflight, cmdHandoff, cmdReviewRequest,
  cmdPrStatus, cmdMergeGate, cmdVerify, cmdSet, cmdHookStop,
} from './lib/commands.mjs';

const VALUE_FLAGS = new Set(['target', 'phase', 'agent', 'notes', 'command']);

function parseArgs(argv) {
  const args = { _: [], passthrough: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { args.passthrough = argv.slice(i + 1); break; }
    if (a.startsWith('--')) {
      let key = a.slice(2);
      let value = true;
      const eq = key.indexOf('=');
      if (eq !== -1) { value = key.slice(eq + 1); key = key.slice(0, eq); }
      key = key.replace(/-/g, '_');
      if (value === true && VALUE_FLAGS.has(key) && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) {
        value = argv[++i];
      }
      args[key] = value;
    } else {
      args._.push(a);
    }
  }
  return args;
}

const HELP = `VibeFlow — AI coding workflow tooling (Spec -> Build -> Verify -> Review -> Fix -> PR -> Merge Gate)

Usage: node scripts/vibeflow/vibe.mjs <command> [options]

Commands:
  init            Install/repair VibeFlow in a project   [--target <dir>] [--force] [--with-github-action]
  status          Show workflow + git state at a glance
  preflight       Safety checks before working           [--phase spec|build|review|merge] [--fetch] [--agent <role>]
  handoff         Refresh .ai/handoff.md snapshot        [--notes "text"] [--agent <role>] [--auto] [--quiet]
  review-request  Generate .ai/review-request.md         [--agent <role>]
  pr-status       Show + record PR state (needs gh)
  merge-gate      Full pre-merge checklist               [--fetch] [--agent <role>]
  verify          Run tests and record result            verify -- <test command>
  set             Validated state updates                set phase=build owner_agent=implementer next_action="..."
  hook-stop       (internal) Claude Code Stop hook entry point

All commands read/write .ai/state.json, .ai/handoff.md and .ai/task-log.md.
Docs: docs/workflow.md in the VibeFlow package.`;

export function main(argv) {
  const [cmd, ...rest] = argv;
  const args = parseArgs(rest);
  try {
    switch (cmd) {
      case 'init': return cmdInit(args);
      case 'status': return cmdStatus(args);
      case 'preflight': return cmdPreflight(args);
      case 'handoff': return cmdHandoff(args);
      case 'review-request': return cmdReviewRequest(args);
      case 'pr-status': return cmdPrStatus(args);
      case 'merge-gate': return cmdMergeGate(args);
      case 'verify': return cmdVerify(args, args.passthrough);
      case 'set': return cmdSet(args, args._);
      case 'hook-stop': return cmdHookStop();
      case undefined:
      case 'help':
      case '--help':
      case '-h':
        console.log(HELP);
        return;
      default:
        console.error(`[FAIL] unknown command "${cmd}"\n`);
        console.log(HELP);
        process.exit(1);
    }
  } catch (e) {
    console.error(`[FAIL] ${e.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
