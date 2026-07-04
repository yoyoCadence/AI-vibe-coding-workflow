#!/usr/bin/env node
// Thin wrapper: node scripts/vibeflow/vibe-init.mjs == node scripts/vibeflow/vibe.mjs init
import { main } from './vibe.mjs';
main(['init', ...process.argv.slice(2)]);
