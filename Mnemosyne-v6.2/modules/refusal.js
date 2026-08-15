/**
 * refusal.js — Abstention Front-Loading (v4.5-Pro Phase 2)
 *
 * v4.5 has 0% refusal rate on T1 (no LLM). This module brings
 * abstention detection down to the retrieval layer so even
 * lightweight configs can say "I don't know".
 *
 * Exports: shouldRefuse(), refusalConfidence(), scoreDistributionCheck()
 */

const REFUSAL_HISTORY = []; // Sliding window of query scores for calibration

function recordQueryScore(query, topScore, top3Scores) {
  REFUSAL_HISTORY.push({ query, topScore, top3: top3Scores, ts: Date.now() });
  if (REFUSAL_HISTORY.length > 200) REFUSAL_HISTORY.shift();
}

function scoreDistributionCheck(topScore, top3Scores) {
  // Auto-calibrate: use local thresholds until history builds up
  if (REFUSAL_HISTORY.length < 3) {
    // Bootstrap with sensible defaults
    return {
      calibrated: true,
      p10: 0.3, p50: 0.5,
      belowThreshold: topScore < 0.3,
      lowGap: top3Scores.length >= 2 && (top3Scores[0] - top3Scores[1]) < 0.1,
      score: topScore,
      gap: top3Scores.length >= 2 ? top3Scores[0] - top3Scores[1] : 0,
    };
  }
  
  const factScores = REFUSAL_HISTORY
    .filter(h => h.topScore > 0.1)
    .map(h => h.topScore)
    .sort((a, b) => a - b);
  
  if (!factScores.length) return { calibrated: false };
  
  const p10 = factScores[Math.floor(factScores.length * 0.1)];
  const p50 = factScores[Math.floor(factScores.length * 0.5)];
  
  // Gap between top-1 and top-2
  const gap = top3Scores.length >= 2 ? top3Scores[0] - top3Scores[1] : 0;
  
  return {
    calibrated: true,
    p10, p50,
    belowThreshold: topScore < p10,
    lowGap: gap < 0.05,
    score: topScore,
    gap,
  };
}

function shouldRefuse(results, opts = {}) {
  if (!results || !results.length) return {
    refuse: true,
    reason: 'no_results',
    confidence: 'high',
    message: 'No matching information found in memory.',
  };
  
  const topScore = results[0]?.score || results[0]?.combinedScore || 0;
  const top3Scores = results.slice(0, 3).map(r => r.score || r.combinedScore || 0);
  
  const dist = scoreDistributionCheck(topScore, top3Scores);
  
  // Case 1: No calibration yet — be permissive
  if (!dist.calibrated) return { refuse: false, reason: 'uncalibrated' };
  
  // Case 2: Top score below P10 threshold AND low gap → likely noise
  if (dist.belowThreshold && dist.lowGap) {
    recordQueryScore(opts.query || '', topScore, top3Scores);
    return {
      refuse: true,
      reason: 'low_confidence',
      confidence: 'high',
      message: 'No reliable information found. Results below confidence threshold.',
      details: { topScore, p10: dist.p10, gap: dist.gap },
    };
  }
  
  // Case 3: Keyword hit but semantic mismatch (hybrid gap)
  const hasSemantic = results.some(r => (r.layer === 'semantic' || r.mode === 'semantic') && (r.score || 0) > 0.1);
  if (topScore < 0.3 && !hasSemantic) {
    recordQueryScore(opts.query || '', topScore, top3Scores);
    return {
      refuse: false,
      reason: 'keyword_coincidence',
      confidence: 'low',
      message: 'Found possible keyword matches but low semantic relevance. Results may not be accurate.',
      results: results.slice(0, 3),
    };
  }
  
  recordQueryScore(opts.query || '', topScore, top3Scores);
  return { refuse: false, reason: 'confident' };
}

function refusalConfidence(dist) {
  if (!dist.calibrated) return 0.5;
  if (dist.belowThreshold && dist.lowGap) return 0.95; // Very confident it's noise
  if (dist.belowThreshold) return 0.7;
  return 0.3; // Confident it's valid
}

module.exports = { shouldRefuse, refusalConfidence, scoreDistributionCheck, recordQueryScore };
