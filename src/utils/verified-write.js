/**
 * @fileoverview verified-write - post-write readback verification
 * @module utils/verified-write
 *
 * Purpose: `fs.writeFile` reports success as soon as the OS accepts the write —
 * it does NOT guarantee the bytes on disk match what was requested (short/partial
 * writes, ENOSPC, encoding mangling, or a concurrent writer clobbering the file
 * between write and return can all leave disk content that diverges from
 * `content` while the write call itself resolved cleanly). writeFileVerified
 * closes that gap by reading the file back immediately after writing and
 * comparing byte-for-byte; on mismatch it throws loudly instead of letting a
 * caller report success on a corrupted file.
 */

import { promises as fs } from 'fs';

class WriteVerificationError extends Error {
  constructor({ filePath, expectedLength, actualLength, firstDivergentLine, expectedExcerpt, actualExcerpt, backupPath, label }) {
    const lines = [
      `[${label}] Write verification FAILED for "${filePath}".`,
      `Expected length: ${expectedLength} chars. Actual on-disk length: ${actualLength} chars.`,
      `First divergent line: ${firstDivergentLine}.`,
      `Expected: ${JSON.stringify(expectedExcerpt)}`,
      `Actual:   ${JSON.stringify(actualExcerpt)}`,
      backupPath ? `Backup available at: ${backupPath}` : null,
      'The file on disk does NOT match the intended content. Do NOT trust this edit — re-read the file.'
    ].filter(Boolean);

    super(lines.join('\n'));
    this.name = 'WriteVerificationError';
    this.code = 'WRITE_VERIFY_MISMATCH';
    this.filePath = filePath;
    this.expectedLength = expectedLength;
    this.actualLength = actualLength;
    this.firstDivergentLine = firstDivergentLine;
    this.backupPath = backupPath || null;
  }
}

function findFirstDivergentLine(expected, actual) {
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const max = Math.max(expectedLines.length, actualLines.length);
  for (let i = 0; i < max; i++) {
    if (expectedLines[i] !== actualLines[i]) {
      return i + 1;
    }
  }
  return max;
}

async function writeFileVerified(absolutePath, content, { label = 'write', backupPath = null } = {}) {
  await fs.writeFile(absolutePath, content, 'utf8');
  const onDisk = await fs.readFile(absolutePath, 'utf8');

  if (onDisk === content) return;

  const firstDivergentLine = findFirstDivergentLine(content, onDisk);
  const expectedExcerpt = content.split('\n')[firstDivergentLine - 1] ?? '';
  const actualExcerpt = onDisk.split('\n')[firstDivergentLine - 1] ?? '';

  throw new WriteVerificationError({
    filePath: absolutePath,
    expectedLength: content.length,
    actualLength: onDisk.length,
    firstDivergentLine,
    expectedExcerpt: expectedExcerpt.slice(0, 200),
    actualExcerpt: actualExcerpt.slice(0, 200),
    backupPath,
    label
  });
}

export { writeFileVerified, WriteVerificationError };
