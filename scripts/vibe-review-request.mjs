#!/usr/bin/env node
// Thin wrapper: node scripts/vibeflow/vibe-review-request.mjs == node scripts/vibeflow/vibe.mjs review-request
import { main } from './vibe.mjs';
main(['review-request', ...process.argv.slice(2)]);
