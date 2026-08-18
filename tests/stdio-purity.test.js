import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

// SAB is a stdio MCP server: stdout carries JSON-RPC frames and nothing else.
// A console.log() call in src/ writes to stdout and injects a non-JSON line
// into the protocol stream, silently corrupting it (the SDK's line parser
// tolerates and skips unparseable lines, but a stricter client will not).
// All logging must go to stderr via console.error().

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(repoRoot, 'src');

function walkJsFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walkJsFiles(full) : full.endsWith('.js') ? [full] : [];
  });
}

describe('stdio purity', () => {
  it('contains no console.log calls under src/ (stdout is the JSON-RPC channel)', () => {
    // Every console method that writes to STDOUT, not just log(). Node sends
    // log/debug/info/dir/table to stdout and only warn/error/trace to stderr —
    // `console.debug` in particular reads like a suppressed debug channel and is
    // not one. Five `console.debug?.()` calls in model-discovery.js shipped live
    // MCP-stream corruption past the previous log-only version of this guard.
    //
    // The optional-chaining forms are matched too: `console.debug?.(` and
    // `console?.debug(` both call through, and both slipped by a regex that
    // expected a bare `.` followed by `(`.
    const callRegex = /\bconsole\s*\??\.\s*(?:log|debug|info|dir|table)\s*(?:\?\.)?\s*\(/;
    const offenders = walkJsFiles(srcRoot).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, idx) => (callRegex.test(line) ? [`${path.relative(repoRoot, file)}:${idx + 1}`] : []))
    );

    expect(
      offenders,
      `console.log() calls found under src/ (stdout is the JSON-RPC channel; use console.error()):\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('emits only valid JSON on stdout during a real handshake', async () => {
    const child = spawn('node', [path.join(srcRoot, 'server.js')], {
      cwd: repoRoot,
      env: { ...process.env, SAB_DISABLE_READINESS_AUDIT: 'true' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let spawnError = null;
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.on('error', (err) => { spawnError = err; });

    try {
      const requests = [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      ];
      child.stdin.write(requests.map((r) => JSON.stringify(r)).join('\n') + '\n');

      const toolsResponse = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for tools/list response. stdout so far:\n${stdout}`)), 60000);
        const check = () => {
          if (spawnError) { clearTimeout(timer); reject(new Error(`Failed to spawn server: ${spawnError.message}`)); return; }
          for (const line of stdout.split('\n').filter((l) => l.trim())) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.id === 2) { clearTimeout(timer); resolve(parsed); return; }
            } catch { /* incomplete/non-JSON line, keep waiting */ }
          }
        };
        child.stdout.on('data', check);
        child.on('exit', () => { clearTimeout(timer); reject(new Error(`Server exited before tools/list response arrived. stdout:\n${stdout}`)); });
        check();
      });

      const lines = stdout.split('\n').filter((l) => l.trim());
      const badLines = lines.filter((l) => { try { JSON.parse(l); return false; } catch { return true; } });

      expect(badLines, `non-JSON stdout lines found:\n${badLines.map((l) => l.slice(0, 150)).join('\n')}`).toEqual([]);
      expect(toolsResponse.result?.tools?.length).toBeGreaterThan(0);
    } finally {
      child.kill();
    }
  }, 65000);
});
