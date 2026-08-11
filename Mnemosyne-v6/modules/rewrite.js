/**
 * rewrite.js — Semantic Query Rewrite (v4.5-Pro Phase 3)
 *
 * Dynamically expands queries using abbreviations, session context,
 * and cross-language mapping. All stateless — no persona stored.
 */
'use strict';

let _sessionBuffer = [];
const SESSION_WINDOW = 20;

function feedSessionMessage(role, text) {
  _sessionBuffer.push({ role, text: text?.slice(0, 200), ts: Date.now() });
  if (_sessionBuffer.length > SESSION_WINDOW) _sessionBuffer.shift();
}

function extractSessionContext() {
  if (_sessionBuffer.length < 2) return { entities: [], topics: [] };
  const recent = _sessionBuffer.slice(-5);
  const entities = [], topics = [];
  for (const msg of recent) {
    const words = msg.text?.match(/[A-Z][a-z]{2,}|"[^"]{2,20}"|[\u4e00-\u9fff]{2,4}/g) || [];
    for (const w of words) { if (!entities.includes(w) && w.length > 1) entities.push(w); }
  }
  return { entities: [...new Set(entities)].slice(0, 10), topics: [] };
}

function rewriteQuery(query, opts = {}) {
  const ctx = extractSessionContext();
  const rewrites = [query];

  // 1. Abbreviation expansion (always useful, always safe)
  const expansions = {
    'v4.5': 'Mnemosyne v4.5', 'v4-pro': 'Mnemosyne v4-pro',
    'am': 'AgentMemory', 'cdb': 'ChromaDB', 'fts': 'SQLite FTS5',
  };
  for (const [abbr, full] of Object.entries(expansions)) {
    if (query.toLowerCase().includes(abbr) && !query.toLowerCase().includes(full.toLowerCase())) {
      rewrites.push(query.replace(new RegExp(abbr, 'i'), full));
    }
  }

  // 2. Pronoun resolution
  if (ctx.entities.length > 0 && /^(it|they|that|this|它|他|她|那|这)\b/i.test(query)) {
    for (const entity of ctx.entities.slice(0, 2)) {
      rewrites.push(entity + ' ' + query.replace(/^(it|they|that|this|它|他|她|那|这)\s*/i, ''));
    }
  }

  // 3. Cross-language: English query → try Chinese expansion
  if (/^[a-zA-Z\s?]{5,}$/.test(query) && !/[\u4e00-\u9fff]/.test(query)) {
    try {
      const crossMod = require('./crosslang.js');
      const expanded = crossMod.expandCrossLang(query);
      if (expanded.length > 1) rewrites.push(...expanded.slice(1));
    } catch {}
  }

  return [...new Set(rewrites)];
}

function validateRewrite(original, rewritten, ctx) {
  const origTerms = (original.match(/[\u4e00-\u9fff]{2,}|[a-zA-Z]{3,}/g) || []);
  for (const term of origTerms.slice(0, 3)) {
    if (!rewritten.includes(term)) return false;
  }
  return true;
}

module.exports = { feedSessionMessage, extractSessionContext, rewriteQuery, validateRewrite };
