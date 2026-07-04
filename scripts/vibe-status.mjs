#!/usr/bin/env node
// Thin wrapper: node scripts/vibeflow/vibe-status.mjs == node scripts/vibeflow/vibe.mjs status
import { main } from './vibe.mjs';
main(['status', ...process.argv.slice(2)]);
