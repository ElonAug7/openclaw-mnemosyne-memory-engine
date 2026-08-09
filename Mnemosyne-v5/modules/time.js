/**
 * time.js — Time-Aware Memory Refactoring (v5.1)
 *
 * v5.1: IMP→半衰期映射规则 — 9维 imp 得分自动推导半衰期类别
 * 解决"技术事实被误标为闲聊导致7天快速沉底"的不可逆信息丢失问题
 *
 * Exports: getHalfLife(), relativeTime(), resolveConflicts(), markStale(),
 *          impToHalfLife(), classifyByImp(), getOverrideDecay()
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
  decision:  0,   // v5.1: decisions are permanent
  tech_fact: 90,  // v5.1: technical facts have long decay
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

// v5.1: IMP 模式 → 半衰期类别映射
// 优先级高于文本分类（imp 信号比文本关键词更可靠）
const IMP_TO_CATEGORY = [
  { re: /决定|确认|结论|选定|采纳|最终方案|定了|拍板|agreed|decided|final/i, cat: 'decision' },
  { re: /优化|改进|重构|架构|设计|代码|bug|修复|性能|安全|配置|系统|功能|模块|评估|分析|方案/i, cat: 'tech_fact' },
  { re: /待办|todo|fixme|下一步|计划|回头|稍后|提醒我|记得|别忘了|截止|deadline/i, cat: 'status' },
  { re: /喜欢|不喜欢|偏好|必须|不能|不许|不准|不要|坚决|原则|底线|风格|配色|习惯|想要/i, cat: 'preference' },
];

// v5.1: 用户手动衰减修正（decay-override.json）
const OVERRIDE_FILE = require('path').join(__dirname, '..', '..', 'memory', 'engine', 'decay-override.json');
let _overrideCache = null;

function loadOverrides() {
  if (_overrideCache) return _overrideCache;
  try { _overrideCache = JSON.parse(require('fs').readFileSync(OVERRIDE_FILE, 'utf8')); }
  catch { _overrideCache = {}; }
  return _overrideCache;
}

function getOverrideDecay(textHint) {
  const ov = loadOverrides();
  const key = (textHint || '').slice(0, 80).trim();
  return ov[key] || null; // { halfLife: N } 或 null
}

function classifyMemory(text) {
  for (const { cat, re } of CATEGORY_PATTERNS) {
    if (re.test(text)) return cat;
  }
  return 'preference'; // default: moderate decay
}

// v5.1: 基于 IMP 模式分类半衰期（优先级高于文本分类）
function classifyByImp(text) {
  for (const { re, cat } of IMP_TO_CATEGORY) {
    if (re.test(text)) return cat;
  }
  return null; // 未匹配，回退到文本分类
}

// v5.1: 综合 IMP + 文本分类 → 半衰期
function impToHalfLife(text, imp) {
  // 1. 检查手动修正
  const override = getOverrideDecay(text);
  if (override && override.halfLife !== undefined) return override.halfLife;

  // 2. IMP 模式分类（高 imp 消息优先用 imp 信号）
  if (imp && imp >= 0.5) {
    const impCat = classifyByImp(text);
    // 注意: 用 !== undefined 而非 ||，因为 0 是合法值（永不衰减）
    if (impCat && HALF_LIFE[impCat] !== undefined) return HALF_LIFE[impCat];
  }

  // 3. 文本分类回退
  const textCat = classifyMemory(text);
  return HALF_LIFE[textCat] !== undefined ? HALF_LIFE[textCat] : 60;
}

function getHalfLife(textOrCategory) {
  if (typeof textOrCategory === 'string' && HALF_LIFE[textOrCategory] === undefined) {
    textOrCategory = classifyMemory(textOrCategory);
  }
  // 注意: 用!== undefined 而非 ||，0=永不衰减
  return HALF_LIFE[textOrCategory] !== undefined ? HALF_LIFE[textOrCategory] : 60;
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
  if (halflifeDays === undefined || halflifeDays === null || halflifeDays < 0) return { ...memory, stale: false };
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

module.exports = { HALF_LIFE, getHalfLife, relativeTime, markStale, resolveConflicts, classifyMemory, impToHalfLife, classifyByImp, getOverrideDecay };
