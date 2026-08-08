/**
 * rewrite.js — Semantic Query Rewrite (v4.5-Pro Phase 3)
 *
 * TencentDB rewrites well but static Persona causes knowledge update collapse.
 * v4.5-Pro uses dynamic, stateless session-level context extraction.
 *
 * Exports: extractSessionContext(), rewriteQuery(), validateRewrite()
 */

// Never persisted — ephemeral session context only
let _sessionBuffer = [];
const SESSION_WINDOW = 20; // Last N messages for context extraction

function feedSessionMessage(role, text) {
  _sessionBuffer.push({ role, text: text?.slice(0, 200), ts: Date.now() });
  if (_sessionBuffer.length > SESSION_WINDOW) _sessionBuffer.shift();
}

function extractSessionContext() {
  if (_sessionBuffer.length < 2) return { entities: [], topics: [] };
  
  const recent = _sessionBuffer.slice(-5);
  const entities = [];
  const topics = [];
  
  for (const msg of recent) {
    // Extract potential entities (capitalized words, quoted phrases, CJK proper nouns)
    const words = msg.text?.match(/[A-Z][a-z]{2,}|"[^"]{2,20}"|[\u4e00-\u9fff]{2,4}/g) || [];
    for (const w of words) {
      if (!entities.includes(w) && w.length > 1) entities.push(w);
    }
    // Extract topic indicators
    const topicWords = msg.text?.match(/\b(about|regarding|关于|讨论|聊|问)\s+(\w{2,20})/gi) || [];
    for (const t of topicWords) topics.push(t);
  }
  
  return {
    entities: [...new Set(entities)].slice(0, 10),
    topics: [...new Set(topics)].slice(0, 5),
    lastQuery: _sessionBuffer[_sessionBuffer.length - 1]?.text?.slice(0, 100) || '',
  };
}

function rewriteQuery(query, opts = {}) {
  const ctx = extractSessionContext();
  const rewrites = [query]; // Original always included
  
  // 1. Resolve pronouns using session context
  if (/^(它|他|她|那|这|那个|这个|they|it|that|this|those|these)\b/i.test(query)) {
    for (const entity of ctx.entities.slice(0, 3)) {
      rewrites.push(query.replace(/^(它|他|她|那|这|那个|这个|they|it|that|this|those|these)/i, entity));
    }
  }
  
  // 2. Expand abbreviations / partial names
  const expansions = {
    'v4': 'Mnemosyne v4', 'v4.5': 'Mnemosyne v4.5', 'v4-pro': 'Mnemosyne v4-pro',
    'am': 'AgentMemory', 'cdb': 'ChromaDB', 'fts': 'SQLite FTS5',
  };
  for (const [abbr, full] of Object.entries(expansions)) {
    if (query.toLowerCase().includes(abbr) && !query.toLowerCase().includes(full.toLowerCase())) {
      rewrites.push(query.replace(new RegExp(abbr, 'i'), full));
    }
  }
  
  // 3. Post-retrieval expansion (called after first search)
  if (opts.firstResults?.length) {
    const newTerms = [];
    for (const r of opts.firstResults.slice(0, 5)) {
      const text = r.text || '';
      const keywords = text.match(/[\u4e00-\u9fff]{2,4}|[A-Z][a-z]{3,}/g) || [];
      for (const kw of keywords.slice(0, 3)) {
        if (!query.includes(kw) && !newTerms.includes(kw)) newTerms.push(kw);
      }
    }
    if (newTerms.length) {
      rewrites.push(query + ' OR ' + [...new Set(newTerms)].slice(0, 5).join(' OR '));
    }
  }
  
  // Safety valve: validate each rewrite
  return rewrites.filter(r => validateRewrite(query, r, ctx));
}

function validateRewrite(original, rewritten, ctx) {
  // Rule 1: Rewrite must contain all key terms from original (or their session equivalents)
  const origTerms = original.match(/[\u4e00-\u9fff]{2,}|[a-zA-Z]{3,}/g) || [];
  for (const term of origTerms.slice(0, 3)) {
    if (!rewritten.includes(term) && !ctx.entities.includes(term)) {
      return false; // Lost original meaning
    }
  }
  
  // Rule 2: No hallucinated entities — new entities must come from session or expansions
  const newTerms = rewritten.match(/[\u4e00-\u9fff]{2,}|[a-zA-Z]{3,}/g) || [];
  const knownSet = new Set([...origTerms, ...ctx.entities, ...ctx.topics]);
  for (const term of newTerms) {
    if (!knownSet.has(term) && term.length > 3) {
      return false; // Introduced unknown entity
    }
  }
  
  return true;
}

module.exports = { feedSessionMessage, extractSessionContext, rewriteQuery, validateRewrite };
