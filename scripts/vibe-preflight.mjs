#!/usr/bin/env node
// Thin wrapper: node scripts/vibeflow/vibe-preflight.mjs == node scripts/vibeflow/vibe.mjs preflight
import { main } from './vibe.mjs';
main(['preflight', ...process.argv.slice(2)]);
