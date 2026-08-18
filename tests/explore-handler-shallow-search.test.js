/**
 * @fileoverview Regression test for ExploreHandler.performShallowSearch dropping
 * every other match because its pattern RegExp used the global ('g') flag and was
 * reused across lines via RegExp.prototype.test — a stateful call that advances
 * lastIndex and causes alternating false negatives.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { ExploreHandler } from '../src/handlers/explore-handler.js';

describe('ExploreHandler.performShallowSearch', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) {
      await fsp.rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('reports all five matching lines, not just every other one', async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'explore-shallow-'));
    const filePath = path.join(tmpDir, 'fixture.js');
    const lines = [
      'a lock',
      'b acquire',
      'c lock',
      'd acquire',
      'e lock'
    ];
    await fsp.writeFile(filePath, lines.join('\n'), 'utf8');

    const handler = new ExploreHandler({ handlerName: 'Explore' });
    const findings = await handler.performShallowSearch([filePath], ['lock', 'acquire'], 20);

    expect(findings.evidence).toHaveLength(5);
  });
});

describe('ExploreHandler.performDeepSearch', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) {
      await fsp.rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('does not drop a file entirely when its only matching line lands on a suppressed test() call', async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'explore-deep-'));
    const fileA = path.join(tmpDir, 'a.js');
    const fileB = path.join(tmpDir, 'b.js');
    // No trailing newline: fixtures are single-line files, so each file
    // contributes exactly one test() call to the shared, stateful regex.
    // fileA's call matches and advances lastIndex past its own string; fileB's
    // call resumes searching from that leftover lastIndex on a shorter string,
    // finds nothing, and drops fileB from the results entirely — not merely
    // undercounting it.
    await fsp.writeFile(fileA, 'hello lock world', 'utf8');
    await fsp.writeFile(fileB, 'acquire now', 'utf8');

    const handler = new ExploreHandler({ handlerName: 'Explore' });
    const findings = await handler.performDeepSearch([fileA, fileB], ['lock', 'acquire'], 20);

    expect(findings.filesFound).toHaveLength(2);
  });
});
