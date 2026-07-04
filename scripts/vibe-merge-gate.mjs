#!/usr/bin/env node
// Thin wrapper: node scripts/vibeflow/vibe-merge-gate.mjs == node scripts/vibeflow/vibe.mjs merge-gate
import { main } from './vibe.mjs';
main(['merge-gate', ...process.argv.slice(2)]);
