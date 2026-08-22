/**
 * multihop.js — Multi-Hop Reasoning (v4.5-Pro Phase 4)
 *
 * BM25 multi-hop beats v4.5 because exact matching doesn't drift in chain reasoning.
 * v4.5-Pro decomposes complex questions into atomic sub-questions,
 * verifies each hop, and checks evidence chain completeness.
 *
 * Exports: decompose(), verifyHop(), buildEvidenceChain(), shouldStop()
 */

const DECOMPOSE_PATTERNS = [
  // "where + when" → [when, where]
  { re: /(.+)(?:时候|时间|when).*(?:哪里|哪儿|地方|where).*/i, 
    extract: (m) => [m[1] + '的时间', m[1] + '的地点'] },
  // "who + what" 
  { re: /(.+)(?:谁|who).*(?:什么|what|哪|which).*/i,
    extract: (m) => [m[1] + '是谁', m[1] + '是什么'] },
  // "X near Y" → [where is X, what is near X]
  { re: /(.+)(?:附近|周围|near|around).*(.+)/i,
    extract: (m) => [m[1] + '在哪里', m[2]] },
  // "after X, Y" → [when X, then Y]
  { re: /(.+)(?:之后|然后|以后|after|then).*(.+)/i,
    extract: (m) => [m[1], m[2]] },
  // "X at time Y" → [time Y, X at time Y]
  { re: /(.+)(?:在|at|during|on)\s+(.+)/i,
    extract: (m) => [m[2], m[1] + ' 在 ' + m[2]] },
];

function decompose(query) {
  const subQueries = [];
  
  for (const { re, extract } of DECOMPOSE_PATTERNS) {
    const m = query.match(re);
    if (m) {
      const subs = extract(m);
      subQueries.push(...subs.filter(s => s?.trim()));
      break; // First match only
    }
  }
  
  // If no pattern matched, check for question words
  if (!subQueries.length) {
    const hasMultiple = (query.match(/[?？]/g) || []).length > 1;
    const hasAnd = /\band\b|和|以及|还有/.test(query);
    if (hasMultiple || hasAnd) {
      // Split on conjunctions
      const parts = query.split(/\band\b|和|以及|还有/).filter(p => p.trim().length > 5);
      subQueries.push(...parts.map(p => p.trim()).filter(p => p.length > 5));
    }
  }
  
  // Always include original as fallback
  const filtered = subQueries.filter(s => s && s.trim().length > 3 && !/^[的了吧吗呢啊]$/.test(s.trim())); return filtered.length ? [...filtered, query] : [query];
}

function verifyHop(previousResult, currentResult, hopIndex) {
  if (!previousResult) return { valid: true, reason: 'first_hop' };
  if (!currentResult?.length) return { valid: false, reason: 'no_results' };
  
  // Check: does current result share any entities/topics with previous?
  const prevText = (previousResult[0]?.text || '').toLowerCase();
  const currText = (currentResult[0]?.text || '').toLowerCase();
  
  const prevWords = new Set(prevText.match(/[\u4e00-\u9fff]{2,}|[a-zA-Z]{3,}/g) || []);
  const currWords = currText.match(/[\u4e00-\u9fff]{2,}|[a-zA-Z]{3,}/g) || [];
  
  const overlap = currWords.filter(w => prevWords.has(w)).length;
  const minOverlap = Math.min(2, Math.floor(currWords.length * 0.1));
  
  if (overlap < minOverlap) {
    return { valid: false, reason: 'drift', overlap, expected: minOverlap, hop: hopIndex };
  }
  
  return { valid: true, overlap, hop: hopIndex };
}

function shouldStop(hopResults, maxHops = 3) {
  if (hopResults.length >= maxHops) return { stop: true, reason: 'max_hops' };
  
  const lastHop = hopResults[hopResults.length - 1];
  if (!lastHop?.valid) return { stop: true, reason: 'drift_detected' };
  if (!lastHop?.results?.length) return { stop: true, reason: 'no_results' };
  
  return { stop: false };
}

function buildEvidenceChain(hopResults, subQueries) {
  const chain = [];
  let complete = true;
  
  for (let i = 0; i < Math.min(subQueries.length, hopResults.length); i++) {
    const subQ = subQueries[i];
    const hop = hopResults[i];
    const sources = (hop?.results || []).slice(0, 3).map(r => ({
      text: (r.text || '').slice(0, 150),
      source: r.file || r.layer || 'unknown',
      score: r.score || r.combinedScore || 0,
    }));
    
    chain.push({
      step: i + 1,
      question: subQ,
      found: sources.length > 0,
      sources,
      valid: hop?.valid !== false,
    });
    
    if (sources.length === 0) complete = false;
  }
  
  return { chain, complete, stepsWithResults: chain.filter(c => c.found).length };
}

module.exports = { decompose, verifyHop, shouldStop, buildEvidenceChain };
