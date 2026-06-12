/**
 * @fileoverview Probe-based fidelity eval for SmartCrusher.
 * Ported from MCP-Code-Execution-Migration/tests/compression/probeFidelity.test.ts
 * @license Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  crushToolResult,
  stripCcrSentinels,
  isCcrSentinel,
} from '../../src/compression/smartCrush.js';

const RUN = process.env.RUN_CRUSH_EVAL === '1';
const BASE_URL = (process.env.CRUSH_EVAL_BASE_URL ?? 'http://127.0.0.1:8084/v1').replace(/\/$/, '');
const MODEL = process.env.CRUSH_EVAL_MODEL ?? 'seed-coder-8b';
const API_KEY = process.env.CRUSH_EVAL_API_KEY ?? 'sk-no-auth';

const MAX_SCORE_DROP = 2;

const DIMENSIONS = ['accuracy', 'completeness', 'artifact_trail'];

const DIMENSION_DESCRIPTIONS = {
  accuracy: 'Are concrete facts correct — log levels, messages, counts, codes? A single wrong fact should cost points.',
  completeness: 'Does the answer address ALL parts of the probe question? Two of three parts answered is incomplete.',
  artifact_trail: 'Does the answer reflect the FULL record set, including rows that were dropped but accounted for by the offload marker? Missing records cost more than extra ones.',
};

const SCORE_SCALE = {
  0: 'No useful information; wrong or hallucinated.',
  1: 'Major gaps or a key fact is wrong.',
  2: 'Partially correct but significant omissions.',
  3: 'Mostly correct with minor omissions or imprecision.',
  4: 'Correct and complete with only trivial imprecision.',
  5: 'Fully correct, complete, and in the requested format.',
};

function buildLogFixture() {
  const rows = [];
  for (let i = 0; i < 60; i++) {
    if (i === 12) rows.push({ ts: i, level: 'error', msg: 'disk write failed ENOSPC on /var/data' });
    else if (i === 27) rows.push({ ts: i, level: 'warn', msg: 'retry budget low: 2 of 10 remaining' });
    else if (i === 41) rows.push({ ts: i, level: 'fatal', msg: 'segfault in worker pid 8841' });
    else rows.push({ ts: i, level: 'info', msg: 'request handled ok', code: 200 });
  }
  return rows;
}

const PROBES = [
  {
    type: 'recall',
    question: 'List every error-level, fatal, or warning log entry in this tool result and quote its message. If there are none, say so.',
    expectedFacts: [
      'error: disk write failed ENOSPC on /var/data',
      'fatal: segfault in worker pid 8841',
      'warn: retry budget low: 2 of 10 remaining',
    ],
  },
  {
    type: 'artifact',
    question: 'How many log entries did the ORIGINAL tool result contain in total (before any rows were offloaded)? Answer with a single number.',
    expectedFacts: ['60 total log entries'],
  },
];

const CRUSH_CONFIG = { enabled: true };
async function callModel(messages, temperature) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages, temperature, max_tokens: 1024 }),
  });
  if (!res.ok) throw new Error(`model call failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error(`malformed model response: ${JSON.stringify(data).slice(0, 200)}`);
  return content;
}

async function answerFromArtifact(artifact, probe) {
  return callModel(
    [
      {
        role: 'system',
        content:
          'You answer questions strictly from the provided JSON tool result. If a row object ' +
          'contains a key like "_ccr_dropped" with a value such as "<<ccr:<hash> <d>_of_<t>_rows_offloaded>>", ' +
          'that means <d> records were omitted from this view and the ORIGINAL tool result contained <t> ' +
          'records in total. Use <t> directly for total/completeness questions. Do not invent specific ' +
          'dropped rows you cannot see.',
      },
      {
        role: 'user',
        content: `TOOL RESULT (JSON):\n${JSON.stringify(artifact)}\n\nQUESTION:\n${probe.question}`,
      },
    ],
    0,
  );
}
function buildJudgePrompt(probe, answer) {
  const dimBlock = DIMENSIONS.map((d) => `- ${d}: ${DIMENSION_DESCRIPTIONS[d]}`).join('\n');
  const scaleBlock = Object.entries(SCORE_SCALE).map(([s, desc]) => `  ${s}: ${desc}`).join('\n');
  const expectedBlock = probe.expectedFacts.map((f) => `- ${f}`).join('\n');
  const schema =
    'Respond with ONLY a JSON object, no prose before or after:\n' +
    '{ "accuracy": <int 0-5>, "completeness": <int 0-5>, "artifact_trail": <int 0-5>, ' +
    '"notes": "<one short sentence on the single biggest issue, if any>" }';
  return (
    'You are grading a single answer an AI assistant produced from a (possibly compressed) ' +
    'JSON tool result. Grade strictly on three dimensions, each 0-5. Integers only; if torn, ' +
    'use the lower score.\n\n' +
    `${dimBlock}\n\n0-5 scale:\n${scaleBlock}\n\n` +
    `PROBE TYPE: ${probe.type}\n\nPROBE QUESTION:\n${probe.question}\n\n` +
    `EXPECTED FACTS (the answer should contain these anchors; missing any is a material defect):\n` +
    `${expectedBlock}\n\nASSISTANT ANSWER TO GRADE:\n${answer}\n\n${schema}`
  );
}
function parseJudge(raw) {
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) s = fence[1].trim();
  const brace = s.match(/\{[\s\S]*\}/);
  if (!brace) throw new Error(`no JSON object in judge response: ${raw.slice(0, 200)}`);
  const parsed = JSON.parse(brace[0]);
  const scores = {};
  for (const dim of DIMENSIONS) {
    const v = parsed[dim];
    if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`dimension ${dim} not numeric: ${String(v)}`);
    const iv = Math.round(v);
    if (iv < 0 || iv > 5) throw new Error(`dimension ${dim} out of range: ${iv}`);
    scores[dim] = iv;
  }
  const total = DIMENSIONS.reduce((a, d) => a + scores[d], 0);
  const notes = typeof parsed.notes === 'string' ? parsed.notes.slice(0, 200) : '';
  return { scores, total, notes };
}

async function scoreAnswer(probe, answer) {
  const judged = await callModel([{ role: 'user', content: buildJudgePrompt(probe, answer) }], 0);
  return parseJudge(judged);
}
const suite = RUN ? describe : describe.skip;

suite('SmartCrusher probe fidelity (LLM-graded; RUN_CRUSH_EVAL=1)', () => {
  const original = buildLogFixture();
  const crushed = crushToolResult(original, CRUSH_CONFIG).value;

  it('crushes the fixture (otherwise the eval is meaningless)', () => {
    const kept = stripCcrSentinels(crushed);
    expect(kept.length).toBeLessThan(original.length);
    expect(crushed.some(isCcrSentinel)).toBe(true);
  });

  it('cheap deterministic gate: every important row survives crushing', () => {
    const keptMsgs = stripCcrSentinels(crushed).map((r) => String(r.msg));
    expect(keptMsgs).toContain('disk write failed ENOSPC on /var/data');
    expect(keptMsgs).toContain('segfault in worker pid 8841');
    expect(keptMsgs).toContain('retry budget low: 2 of 10 remaining');
  });

  for (const probe of PROBES) {
    it(`probe[${probe.type}] crushed answer within ${MAX_SCORE_DROP}pts of original`, async () => {
      const [origAns, crushAns] = await Promise.all([
        answerFromArtifact(original, probe),
        answerFromArtifact(crushed, probe),
      ]);
      const [origScore, crushScore] = await Promise.all([
        scoreAnswer(probe, origAns),
        scoreAnswer(probe, crushAns),
      ]);
      // eslint-disable-next-line no-console
      console.log(
        `[${probe.type}] original=${origScore.total}/15 ${JSON.stringify(origScore.scores)} | ` +
          `crushed=${crushScore.total}/15 ${JSON.stringify(crushScore.scores)} | ` +
          `crushed-notes: ${crushScore.notes}`,
      );
      expect(crushScore.total).toBeGreaterThanOrEqual(origScore.total - MAX_SCORE_DROP);
    }, 180_000);
  }
});
