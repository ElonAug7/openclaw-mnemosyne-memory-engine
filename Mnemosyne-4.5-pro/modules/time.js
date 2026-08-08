/**
 * time.js — Time-Aware Memory Refactoring (v4.5-Pro Phase 1)
 * 
 * BM25 beats v4.5 on temporal stability because exact word matching
 * naturally filters stale info. This module adds explicit time ordering
 * while preserving semantic recall.
 * 
 * Exports: getHalfLife(), relativeTime(), resolveConflicts(), markStale()
 */

const HALF_LIFE = {
  // Aggressive decay — factual info that changes often
  job:      7,   // "work at X", "job title"
  location: 7,   // "live in X", "office at Y"  
  project:  14,  // "working on X feature"
  status:   14,  // "currently doing X"
  // Moderate decay — preferences
  preference: 60, // "prefer X over Y", "like Z"
  habit:    60,   // "usually do X"
  style:    90,   // "coding style: functional"
  // No decay — immutable facts
  birthday:  0,   // never expires
  history:   0,   // historical events
  identity:  0,   // "name is X", "from Y"
};

const CATEGORY_PATTERNS = [
  { cat: 'job',      re: /工作|公司|入职|职位|job|work|company|position|role/i },
  { cat: 'location', re: /住|搬家|城市|办公室|地点|live|city|office|location|moved/i },
  { cat: 'project',  re: /项目|project|feature|feature|开发|develop|building|working on/i },
  { cat: 'status',   re: /目前|当前|正在|currently|now|status/i },
  { cat: 'preference', re: /偏好|喜欢|不喜欢|prefer|like|dislike|favorite|习惯/i },
  { cat: 'habit',    re: /通常|一般|每次|always|usually|every time|habit/i },
  { cat: 'style',    re: /风格|style|原则|principle|底线|code style/i },
  { cat: 'birthday', re: /生日|birthday|born/i },
  { cat: 'history',  re: /过去|以前|曾经|used to|previously|history/i },
  { cat: 'identity', re: /名字|姓名|我是|我叫|name is|I am|I'm|from/i },
];

function classifyMemory(text) {
  for (const { cat, re } of CATEGORY_PATTERNS) {
    if (re.test(text)) return cat;
  }
  return 'preference'; // default: moderate decay
}

function getHalfLife(textOrCategory) {
  if (typeof textOrCategory === 'string' && !HALF_LIFE[textOrCategory]) {
    textOrCategory = classifyMemory(textOrCategory);
  }
  return HALF_LIFE[textOrCategory] || 60;
}

function relativeTime(isoString) {
  if (!isoString) return '[unknown]';
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const hours = (now - then) / 3600000;
  
  if (hours < 1) return '[just now]';
  if (hours < 24) return `[${Math.round(hours)}h ago]`;
  const days = hours / 24;
  if (days < 7) return `[${Math.round(days)}d ago · recent]`;
  if (days < 30) return `[${Math.round(days/7)}w ago]`;
  if (days < 365) return `[${Math.round(days/30)}mo ago · stale]`;
  return `[${Math.round(days/365)}y ago · archived]`;
}

function markStale(memory, halflifeDays) {
  if (!halflifeDays || halflifeDays <= 0) return { ...memory, stale: false };
  if (!memory.ts && !memory.createdAt) return { ...memory, stale: false };
  
  const ts = memory.ts || memory.createdAt;
  const ageDays = (Date.now() - new Date(ts).getTime()) / 86400000;
  const expired = ageDays > halflifeDays * 2; // 2x half-life = expired
  
  return {
    ...memory,
    age: Math.round(ageDays),
    halflife: halflifeDays,
    stale: ageDays > halflifeDays,
    expired,
    label: expired ? '[EXPIRED]' : (ageDays > halflifeDays ? '[STALE]' : relativeTime(ts)),
  };
}

function resolveConflicts(records, entity) {
  // Group by entity, keep latest non-expired, mark superseded
  const groups = {};
  for (const r of records) {
    const key = r.entity || entity || r.text?.slice(0, 30);
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }
  
  const resolved = [];
  for (const [key, items] of Object.entries(groups)) {
    items.sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
    const latest = markStale(items[0], getHalfLife(items[0].text || ''));
    
    if (latest.expired) {
      resolved.push({ ...latest, status: 'expired', confidence: 0.1 });
    } else {
      resolved.push({ ...latest, status: 'current', confidence: latest.stale ? 0.5 : 1.0 });
      // Mark older entries as superseded
      for (const old of items.slice(1)) {
        resolved.push({ ...old, status: 'superseded', supersededBy: latest.text?.slice(0, 60), confidence: 0 });
      }
    }
  }
  
  return resolved;
}

module.exports = { HALF_LIFE, getHalfLife, relativeTime, markStale, resolveConflicts, classifyMemory };
