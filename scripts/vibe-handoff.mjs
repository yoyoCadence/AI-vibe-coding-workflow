#!/usr/bin/env node
// Thin wrapper: node scripts/vibeflow/vibe-handoff.mjs == node scripts/vibeflow/vibe.mjs handoff
import { main } from './vibe.mjs';
main(['handoff', ...process.argv.slice(2)]);
