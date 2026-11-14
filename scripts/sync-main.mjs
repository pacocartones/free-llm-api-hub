#!/usr/bin/env node
// The imported policy is intentionally frozen before any merge changes repository code.
import { generatedTargets, STATIC_TARGETS, isGenerated, parseNul } from './generated-targets.mjs';

export function generatedPathSet(indexPaths) {
  return new Set(generatedTargets(indexPaths.filter(p => p.startsWith('site/')))
    .flatMap(p => p === 'collections' && STATIC_TARGETS.includes(p)
      ? indexPaths.filter(name => name.startsWith(`${p}/`)) : [p]));
}

export function parseUnmerged(output) {
  if (output && !output.endsWith('\0')) throw new Error('Unterminated unmerged record');
  const result = new Map();
  for (const record of parseNul(output)) {
    const tab = record.indexOf('\t');
    const metadata = /^(\d{6}) ([0-9a-f]{40}|[0-9a-f]{64}) ([123])$/.exec(record.slice(0, tab));
    if (tab < 0 || !metadata || !record.slice(tab + 1)) throw new Error('Malformed unmerged record');
    const path = record.slice(tab + 1);
    if (!result.has(path)) result.set(path, new Map());
    const stage = Number(metadata[3]);
    if (result.get(path).has(stage)) throw new Error('Duplicate unmerged stage');
    result.get(path).set(stage, { mode: metadata[1], oid: metadata[2] });
  }
  return result;
}
