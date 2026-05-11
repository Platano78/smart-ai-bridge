import { describe, it, expect } from 'vitest';
import { stripLLMWrappers, parseLLMJSON } from '../src/utils/llm-json-parser.js';

const FIELDS = { summary: 'string', findings: 'array', confidence: 'number', suggestedActions: 'array' };

describe('llm-json-parser', () => {
  describe('stripLLMWrappers', () => {
    it('strips closed <think>...</think> blocks', () => {
      const out = stripLLMWrappers('<think>reasoning</think>{"a":1}');
      expect(out).toBe('{"a":1}');
    });

    it('leaves unclosed <think> alone (handled at parse layer)', () => {
      const out = stripLLMWrappers('<think>truncated reasoning');
      expect(out).toBe('<think>truncated reasoning');
    });

    it('unwraps json code fence', () => {
      const out = stripLLMWrappers('```json\n{"a":1}\n```');
      expect(out).toBe('{"a":1}');
    });
  });

  describe('parseLLMJSON — happy paths', () => {
    it('parses raw JSON', () => {
      const r = parseLLMJSON('{"summary":"x","findings":["a"],"confidence":0.8,"suggestedActions":[]}', FIELDS);
      expect(r).toEqual({ summary: 'x', findings: ['a'], confidence: 0.8, suggestedActions: [] });
    });

    it('parses JSON after closed <think> block', () => {
      const r = parseLLMJSON('<think>reasoning</think>{"summary":"x","findings":[],"confidence":0.9,"suggestedActions":[]}', FIELDS);
      expect(r.summary).toBe('x');
    });

    it('parses JSON wrapped in code fences', () => {
      const r = parseLLMJSON('```json\n{"summary":"x","findings":[],"confidence":0.5,"suggestedActions":[]}\n```', FIELDS);
      expect(r.summary).toBe('x');
    });
  });

  describe('parseLLMJSON — adversarial cases from council/chatgpt review', () => {
    it('JSON containing literal <think> string is preserved (not falsely stripped)', () => {
      const txt = '{"summary":"x","findings":["the <think> tag is in line 42"],"confidence":0.9,"suggestedActions":[]}';
      const r = parseLLMJSON(txt, FIELDS);
      expect(r.summary).toBe('x');
      expect(r.findings).toEqual(['the <think> tag is in line 42']);
    });

    it('JSON emitted inside an unclosed <think> is still recovered (model started JSON early)', () => {
      const txt = '<think>let me draft this\n{"summary":"x","findings":["a"],"confidence":0.8,"suggestedActions":[]}';
      const r = parseLLMJSON(txt, FIELDS);
      expect(r).not.toBeNull();
      expect(r.summary).toBe('x');
    });

    it('pure truncated reasoning with no JSON returns null (caller can use prose fallback)', () => {
      const r = parseLLMJSON('<think>I should look at this file and analyze...\nThe function does X and Y', FIELDS);
      expect(r).toBeNull();
    });

    it('reasoning with braces inside an unclosed think but no real JSON returns null', () => {
      const r = parseLLMJSON('<think>I see something like { foo } in the code, also [bar]', FIELDS);
      expect(r).toBeNull();
    });

    it('answer before <think> survives when </think> is missing', () => {
      const txt = '{"summary":"early","findings":[],"confidence":0.9,"suggestedActions":[]}<think>then reasoning';
      const r = parseLLMJSON(txt, FIELDS);
      expect(r.summary).toBe('early');
    });
  });
});
