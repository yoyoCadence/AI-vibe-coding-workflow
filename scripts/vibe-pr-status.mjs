#!/usr/bin/env node
// Thin wrapper: node scripts/vibeflow/vibe-pr-status.mjs == node scripts/vibeflow/vibe.mjs pr-status
import { main } from './vibe.mjs';
main(['pr-status', ...process.argv.slice(2)]);
