/**
 * @fileoverview Unified truncation detection utility
 * @module utils/truncation-detector
 */

const UNIVERSAL_MARKERS = [/\.\.\.$/, /```\s*$/, /\/\/\s*\.\.\./, /\/\*\s*\.\.\./, /#\s*\.\.\./];

function detectOutputTruncation(text, options = {}) {
  const { minLength = 20, format = 'general', maxTokens, spec, estimateTokensFn } = options;
  if (!text || text.length < minLength) return true;

  const last200 = text.slice(-200);
  if (UNIVERSAL_MARKERS.some(p => p.test(last200))) return true;

  if (maxTokens && estimateTokensFn) {
    if (estimateTokensFn(text) >= maxTokens * 0.95) return true;
  }

  if (format === 'modification') return detectModTruncation(text);
  if (format === 'code') return detectCodeTruncation(text, spec);
  return detectGeneralTruncation(text);
}

function detectModTruncation(responseText) {
  const searchCount = (responseText.match(/<<<<<<< SEARCH/g) || []).length;
  const replaceCount = (responseText.match(/>>>>>>> REPLACE/g) || []).length;
  const separatorCount = (responseText.match(/=======/g) || []).length;
  if (searchCount > replaceCount || searchCount > separatorCount) return true;

  const blocks = responseText.match(/=======\n([\s\S]*?)>>>>>>> REPLACE/g) || [];
  for (const block of blocks) {
    const content = block.replace(/^=======\n/, '').replace(/>>>>>>> REPLACE$/, '');
    const braces = (content.match(/\{/g) || []).length - (content.match(/\}/g) || []).length;
    const brackets = (content.match(/\[/g) || []).length - (content.match(/\]/g) || []).length;
    const parens = (content.match(/\(/g) || []).length - (content.match(/\)/g) || []).length;
    if (braces !== 0 || brackets !== 0 || parens !== 0) return true;
  }

  const modMarkers = [/<<<<<<< SEARCH\s*$/, /=======\s*$/, /\{\s*$/, /\[\s*$/];
  const last200 = responseText.slice(-200);
  if (modMarkers.some(p => p.test(last200))) return true;

  const lastLine = responseText.trim().split('\n').pop() || '';
  return /[,\(\[\{:]\s*$/.test(lastLine) ||
         /^\s*(if|for|while|function|class|const|let|var|import|export)\s+\w*$/.test(lastLine);
}

function detectCodeTruncation(code, spec) {
  const codeMarkers = [/\/\/\s*(TODO|FIXME|incomplete)/i, /{\s*$/, /\(\s*$/];
  if (codeMarkers.some(p => p.test(code.slice(-100)))) return true;

  if (spec) {
    const specMentionsExport = /export/i.test(spec);
    const hasExport = /export\s+(default\s+)?(class|function|const|let|var|interface|type)\s+\w+/i.test(code);
    if (specMentionsExport && !hasExport && code.length > 100) return true;
  }

  // Structural balance checks — unbalanced delimiters signal a truncated output
  const openBraces = (code.match(/\{/g) || []).length;
  const closeBraces = (code.match(/\}/g) || []).length;
  if (openBraces > closeBraces) return true;

  const openParens = (code.match(/\(/g) || []).length;
  const closeParens = (code.match(/\)/g) || []).length;
  if (openParens > closeParens) return true;

  const openBrackets = (code.match(/\[/g) || []).length;
  const closeBrackets = (code.match(/\]/g) || []).length;
  if (openBrackets > closeBrackets) return true;

  // Backtick/template-literal balance: odd count means unterminated template or code fence
  const backticks = (code.match(/`/g) || []).length;
  if (backticks % 2 !== 0) return true;

  // Triple-quote balance (Python strings / multiline strings)
  const tripleDouble = (code.match(/"""/g) || []).length;
  if (tripleDouble % 2 !== 0) return true;

  return false;
}

function detectGeneralTruncation(content) {
  const last100 = content.slice(-100);
  if (/[{(\[,]$/.test(last100) || /```$/.test(last100)) return true;
  return /^\s*$/.test(last100);
}

export { detectOutputTruncation, detectModTruncation, detectCodeTruncation, detectGeneralTruncation };
