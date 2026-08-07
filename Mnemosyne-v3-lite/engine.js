#!/usr/bin/env node
/**
 * Mnemosyne v3-lite — OpenClaw 精简记忆引擎
 *
 * 移除: 版本管理/备份导出/会话权限/蒸馏审阅/信号发送/开发日志/内容索引/时间线/配置命令/imp校准
 * 保留: record/sync/search/consolidate/status/health/todos/embed/reindex/cleanup/stats/init
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const zlib = require('zlib');
const { execFile, execFileSync } = require('child_process');

// ============================================================
// 路径解析（可移植，无硬编码）
// ============================================================

const ROOT = process.env.OPENCLAW_WORKSPACE || path.join(os.homedir(), '.openclaw', 'workspace');
const ENGINE_DIR = __dirname;
const TEMPLATES_DIR = path.join(ENGINE_DIR, 'templates');

const MEM = path.join(ROOT, 'memory');
const D = {
  index:  path.join(MEM, 'index'),
  // v5.1：短期记忆拆三层
  shortRaw:  path.join(MEM, 'short', 'raw'),
  shortWorking: path.join(MEM, 'short', 'working'),
  shortInject: path.join(MEM, 'short', 'inject'),
  shortArchive: path.join(MEM, 'short', 'archive'),
  medium: path.join(MEM, 'medium'),
  mediumArchive: path.join(MEM, 'medium', 'archive'),
  long:   path.join(MEM, 'long'),
  engine: path.join(MEM, 'engine'),
  versions: path.join(MEM, 'versions'),
};
// 兼容旧路径（迁移前引用）
D.short = D.shortRaw;

const STATE_FILE  = path.join(D.engine, 'state.json');
const INDEX_FILE  = path.join(D.index, 'index.md');
const LONG_FILE   = path.join(ROOT, 'MEMORY.md');
const LONG_LINK   = path.join(D.long, 'MEMORY.md');
const PROTO_FILE  = path.join(ROOT, 'MEMORY-PROTOCOL.md');
const OFFSETS_FILE = path.join(D.engine, 'transcript-offsets.json');
const VECTORS_FILE = path.join(D.engine, 'embeddings.json');
const TODOS_FILE  = path.join(D.engine, 'todos.json');
const TODOS_MD    = path.join(MEM, 'todos.md');
const CONFIG_FILE = path.join(D.engine, 'config.json');

// 配置默认值（首次运行生成，之后从 config.json 读取）
const DEFAULT_CONFIG = {
  retention: { injectDays: 7, rawDays: 30, mediumDays: 180, logDays: 3, suggestionDays: 14, trashDays: 15 },
  thresholds: { shortSignalTurns: 5, mediumSignalTurns: 20, workingUpdateMsgs: 3, mediumCheckIntervalMs: 3600000, rawMaxLines: 100, rawMaxChars: 800, mediumMinDensity: 50, consolidateIntervalMs: 1800000, consolidateMinMsgs: 8, consolidateMinHighImp: 2, consolidateMinImpSum: 3.0, dailyDistillHour: 22 },
  recordRaw: true,  // 可选：关闭则不再保存 raw 对话记录（JSONL），其他功能正常
  embed: { defaultEnabled: true, maxRecentDays: 30, dims: 512 },
  weights: {
    keyword:  { working:0.08, inject:0.10, raw:0.12, medium:0.22, long:0.25, idx:0.18, semantic:0.05 },
    semantic: { working:0.08, inject:0.10, raw:0.10, medium:0.25, long:0.22, idx:0.05, semantic:0.20 },
    hybrid:   { working:0.10, inject:0.12, raw:0.15, medium:0.22, long:0.18, idx:0.08, semantic:0.15 },
    recent:   { working:0.25, inject:0.20, raw:0.25, medium:0.15, long:0.10, idx:0.03, semantic:0.02 },
    history:  { working:0.02, inject:0.03, raw:0.05, medium:0.20, long:0.45, idx:0.20, semantic:0.05 },
  },
};

function loadConfig() {
  ensureDirs();
  try { const c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); return deepMerge(DEFAULT_CONFIG, c); }
  catch { fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2)); return JSON.parse(JSON.stringify(DEFAULT_CONFIG)); }
}
function deepMerge(def, over) { const r = JSON.parse(JSON.stringify(def)); for (const k in over) { if (over[k] && typeof over[k]==='object' && !Array.isArray(over[k])) r[k]=deepMerge(def[k]||{},over[k]); else r[k]=over[k]; } return r; }

const CFG = loadConfig();
const SHORT_THRESHOLD = CFG.thresholds.shortSignalTurns;
const MEDIUM_THRESHOLD = CFG.thresholds.mediumSignalTurns;
const WORKING_UPDATE_THRESHOLD = CFG.thresholds.workingUpdateMsgs;
const MEDIUM_CHECK_INTERVAL_MS = CFG.thresholds.mediumCheckIntervalMs;
const MAX_RAW_LINES_PER_DAY = CFG.thresholds.rawMaxLines;
const TRANSCRIPT_WINDOW_MS = 48 * 3600 * 1000; // 只同步最近 48h 内修改过的转录文件
const SHORT_RETAIN_DAYS = 30;   // 短期记忆保留天数（之后 gzip 归档）
const MEDIUM_RETAIN_DAYS = 180; // 中期记忆保留天数
const EMBED_RECENT_DAYS = CFG.embed.maxRecentDays;   // 语义索引只覆盖最近 N 天的短期对话
const ARCHIVE_INTERVAL_MS = 6 * 3600 * 1000; // sync 时归档检查节流
const VERSION_RETAIN = 50; // 保留最近 50 个 MEMORY.md 版本
const VERSION_COOLDOWN = 3600 * 1000; // 同一小时不重复快照（避免高频刷写）
const LOCK_FILE = path.join(D.engine, 'lockfile');
const LOCK_TIMEOUT_MS = 120000; // 锁超时 2 分钟
const DISTILL_PROPOSALS_FILE = path.join(D.engine, 'distill-proposals.json');

// ============================================================
// 进程锁：防止多个 cron 同时写 memory 文件（P0 安全加固）
// ============================================================

function acquireLock(label = 'unknown') {
  ensureDirs();
  const pid = String(process.pid);
  try {
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid, label, at: nowIso() }), { flag: 'wx' });
    return true;
  } catch (e) {
    if (e.code === 'EEXIST') {
      // 检查是否超时（锁持有者可能已崩溃）
      try {
        const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
        const age = Date.now() - new Date(lock.at).getTime();
        if (age > LOCK_TIMEOUT_MS) {
          fs.unlinkSync(LOCK_FILE);
          fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid, label, at: nowIso() }), { flag: 'wx' });
          return true;
        }
      } catch {}
      return false;
    }
    throw e;
  }
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch {}
}

// ============================================================
// 模板加载（从 templates/ 目录，引擎内嵌兜底）
// ============================================================

function loadTemplate(name) {
  const file = path.join(TEMPLATES_DIR, name);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const fallbacks = {
    'MEMORY.md': `# MEMORY.md — 长期记忆\n\n## 用户偏好\n- （待填充）\n\n## 关键事实\n- （待填充）\n\n## 当前项目\n- （待填充）\n\n## 重要事件\n- （待填充）\n\n## 变更记录\n- （空）\n`,
    'index.md': `# 记忆索引\n\n| 日期 | 关键词 | 摘要块 | 一句话 |\n|------|--------|--------|--------|\n`,
    'MEMORY-PROTOCOL.md': `# 分层记忆协议\n\n## 短期 memory/short/ — hook 自动记录\n## 中期 memory/medium/ — 摘要块\n## 长期 MEMORY.md — 全局摘要\n## 索引 memory/index/ — 思考时最先查\n`,
  };
  return fallbacks[name] || '';
}

// ============================================================
// 工具函数
// ============================================================

const today = () => dayOf(Date.now());
function dayOf(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return dayOf(Date.now());
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const nowIso = () => new Date().toISOString();
const out = (o) => console.log(JSON.stringify(o, null, 2));

function daysAgo(dateStr) {
  const t = new Date(dateStr + 'T00:00:00').getTime();
  if (isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / 86400000);
}

function hashStr(s, mod) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  if (mod) return (h >>> 0) % mod;
  return (h >>> 0).toString(36);
}

// 内容哈希（用于版本比较）
function contentHash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function ensureDirs() {
  fs.mkdirSync(ROOT, { recursive: true });
  for (const dir of Object.values(D)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(LONG_FILE))  fs.writeFileSync(LONG_FILE, loadTemplate('MEMORY.md'));
  if (!fs.existsSync(INDEX_FILE)) fs.writeFileSync(INDEX_FILE, loadTemplate('index.md'));
  if (!fs.existsSync(PROTO_FILE)) fs.writeFileSync(PROTO_FILE, loadTemplate('MEMORY-PROTOCOL.md'));
  try {
    if (!fs.existsSync(LONG_LINK)) fs.symlinkSync(LONG_FILE, LONG_LINK);
  } catch { /* 静默跳过 */ }
  // 引擎调试日志轮转：超过 50KB 截断保留尾部
  const debugLog = path.join(D.engine, 'hook-debug.log');
  try {
    if (fs.existsSync(debugLog) && fs.statSync(debugLog).size > 51200) {
      const buf = fs.readFileSync(debugLog, 'utf8');
      fs.writeFileSync(debugLog, buf.slice(buf.length - 20480));
    }
  } catch {}
}

function loadState() {
  try {
    return Object.assign({
      enabled: true, turns: 0, totalMessages: 0,
      lastSignalAt: null, lastMessageAt: null,
      semanticEnabled: true,
    }, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
  } catch {
    return { enabled: true, turns: 0, totalMessages: 0, lastSignalAt: null, lastMessageAt: null };
  }
}

function saveState(s) {
  ensureDirs();
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

function readMaybeGz(full) {
  const buf = fs.readFileSync(full);
  if (full.endsWith('.gz')) return zlib.gunzipSync(buf).toString('utf8');
  return buf.toString('utf8');
}

// ============================================================
// 重要性评分（功能 9）
// ============================================================

const IMP_DECISION = /决定|确认|结论|选定|采纳|最终方案|定了|拍板|agreed|decided|final decision/i;
const IMP_TODO     = /待办|todo|fixme|下一步|计划|回头|稍后|提醒我|记得|别忘了|截止|deadline|明天|后天/i;
const IMP_FACT     = /\d+\s*(元|块|￥|\$|天|小时|点|号|月|年|%)/;
const IMP_TECH     = /优化|改进|重构|架构|设计|代码|bug|修复|性能|安全|配置|系统|功能|模块|评估|分析|方案/i;
const IMP_CHITCHAT = /^(哈哈+|嗯+|好的?|ok|okay|谢谢|收到|明白|6+|👍|🙏|😄|😂|❤️)\s*[!！。.~]*$/i;

// imp 评分逻辑（文档化，P1 可校准）
// 基准: user=0.35, assistant=0.30
// 加成:
//   +0.30 含决策词（决定/确认/最终方案/agreed 等）
//   +0.25 含待办/提醒词（todo/下一步/记得/别忘了 等）
//   +0.12 含技术/分析词（优化/架构/代码/bug/修复/评估/方案 等）
//   +0.10 含数字+单位（元/块/天/小时/月/年/%）
//   +0.05 以问号结尾（提问）
//   +0.05 长度>500字符（长消息信息量大）
// 封顶: 1.0
// 闲聊降级: 仅含哈哈/嗯/好的/ok/谢谢/收到/明白 等 → 固定 0.1
// 手动校准: engine.js imp-calibrate --date "2026-08-06" --line <N> --imp 0.8
function importanceOf(role, text) {
  const t = String(text || '').trim();
  if (!t) return 0;
  if (IMP_CHITCHAT.test(t)) return 0.1;
  let score = role === 'user' ? 0.35 : 0.3;
  // 技术/分析类：先加权（避免被后续决策/todo覆盖）
  if (IMP_TECH.test(t))     score += 0.12;
  if (IMP_DECISION.test(t)) score += 0.3;
  if (IMP_TODO.test(t))     score += 0.25;
  if (IMP_FACT.test(t))     score += 0.1;
  if (role === 'user' && /[?？]\s*$/.test(t)) score += 0.05;
  if (t.length > 500) score += 0.05; // 长消息通常信息量大
  return Math.min(1, Math.round(score * 100) / 100);
}

// ============================================================
// 记忆文件遍历（含归档 .gz）
// ============================================================

function allMemoryFiles() {
  const files = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(md|jsonl|json|gz)$/.test(entry.name)) {
        files.push({ full, rel: path.relative(ROOT, full) });
      }
    }
  }
  walk(MEM);
  for (const f of [LONG_FILE, PROTO_FILE]) {
    if (fs.existsSync(f)) files.push({ full: f, rel: path.relative(ROOT, f) });
  }
  return files;
}

// ============================================================
// 转录同步 + 多会话聚合（功能 12）
// ============================================================

function openclawHome() {
  return process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw');
}

// P2 加固：语义去重 — 规范化文本后比较，抵抗格式差异
function alreadyRecorded(day, text) {
  const file = path.join(D.short, `${day}.jsonl`);
  if (!fs.existsSync(file)) return false;
  const normalized = normalizeForDedup(String(text));
  if (normalized.length < 8) return false; // 太短不比较，但也允许记录
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (let i = Math.max(0, lines.length - 400); i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    try {
      const o = JSON.parse(l);
      const existing = normalizeForDedup(String(o.text || ''));
      // 前 120 字符匹配 OR 语义 hash 匹配
      if (existing === normalized) return true;
      if (existing.length >= 30 && normalized.length >= 30 &&
          existing.slice(0, Math.min(120, existing.length)) === normalized.slice(0, Math.min(120, existing.length))) return true;
    } catch {}
  }
  return false;
}

// 规范化：去时间戳格式、去空白差异、去前缀元数据
function normalizeForDedup(s) {
  return s
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.\d]*Z?/g, '')
    .replace(/\[\d{2}:\d{2}\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function syncTranscripts() {
  ensureDirs();
  const agentsDir = path.join(openclawHome(), 'agents');
  let offsets = {};
  try { offsets = JSON.parse(fs.readFileSync(OFFSETS_FILE, 'utf8')); } catch {}
  const stat = { added: 0, files: 0, sessions: new Set() };
  if (!fs.existsSync(agentsDir)) { stat.sessions = 0; return stat; }

  const now = Date.now();
  for (const agent of fs.readdirSync(agentsDir)) {
    const sessDir = path.join(agentsDir, agent, 'sessions');
    let entries = [];
    try { entries = fs.readdirSync(sessDir); } catch { continue; }
    for (const name of entries) {
      if (!name.endsWith('.jsonl') || name.endsWith('.trajectory.jsonl')) continue;
      const full = path.join(sessDir, name);
      let st; try { st = fs.statSync(full); } catch { continue; }
      if (now - st.mtimeMs > TRANSCRIPT_WINDOW_MS) continue;
      stat.files++;

      let off = offsets[full] || 0;
      if (st.size < off) off = st.size;
      if (st.size === off) { offsets[full] = off; continue; }

      let chunk;
      try {
        const fd = fs.openSync(full, 'r');
        const len = st.size - off;
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, off);
        fs.closeSync(fd);
        chunk = buf.toString('utf8');
      } catch { continue; }
      offsets[full] = st.size;

      const lines = chunk.split('\n');
      const tail = lines.pop();
      if (tail && tail.trim()) offsets[full] -= Buffer.byteLength(tail, 'utf8');

      const sessName = name.replace('.jsonl', '');
      for (const line of lines) {
        if (!line.trim()) continue;
        let o; try { o = JSON.parse(line); } catch { continue; }
        if (o.type !== 'message') continue;
        const m = o.message || {};
        // v5：user + assistant 都摄取（覆盖子代理等非 hook 会话），靠 alreadyRecorded 去重
        if (m.role !== 'assistant' && m.role !== 'user') continue;
        let text = '';
        if (typeof m.content === 'string') text = m.content;
        else if (Array.isArray(m.content)) {
          text = m.content.filter(b => b && b.type === 'text' && b.text).map(b => b.text).join('\n');
        }
        text = String(text).trim();
        if (!text) continue;
        const ts = o.timestamp || nowIso();
        const day = dayOf(ts);
        if (alreadyRecorded(day, text)) continue;
        const entry = {
          ts, role: m.role, text: compressForStorage(text),
          source: 'transcript', sess: sessName.slice(0, 12),
          imp: importanceOf(m.role, text),
        };
        fs.appendFileSync(path.join(D.short, `${day}.jsonl`), JSON.stringify(entry) + '\n');
        stat.added++;
        stat.sessions.add(sessName);
      }
    }
  }
  stat.sessions = stat.sessions.size;
  try { fs.writeFileSync(OFFSETS_FILE, JSON.stringify(offsets, null, 2)); } catch {}
  return stat;
}

// 多会话聚合视图（功能 12）
function cmdSessions() {
  const agentsDir = path.join(openclawHome(), 'agents');
  const sessions = [];
  if (!fs.existsSync(agentsDir)) return out({ total: 0, sessions });
  const now = Date.now();
  for (const agent of fs.readdirSync(agentsDir)) {
    const sessDir = path.join(agentsDir, agent, 'sessions');
    let entries = [];
    try { entries = fs.readdirSync(sessDir); } catch { continue; }
    for (const name of entries) {
      if (!name.endsWith('.jsonl') || name.endsWith('.trajectory.jsonl')) continue;
      const full = path.join(sessDir, name);
      let st; try { st = fs.statSync(full); } catch { continue; }
      if (now - st.mtimeMs > TRANSCRIPT_WINDOW_MS) continue;
      let firstTs = null, lastTs = null, msgs = 0, firstUser = '';
      try {
        for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
          if (!line.trim()) continue;
          let o; try { o = JSON.parse(line); } catch { continue; }
          if (o.type !== 'message') continue;
          const m = o.message || {};
          if (m.role !== 'user' && m.role !== 'assistant') continue;
          msgs++;
          if (!firstTs) firstTs = o.timestamp;
          lastTs = o.timestamp;
          if (m.role === 'user' && !firstUser) {
            const c = typeof m.content === 'string' ? m.content
              : Array.isArray(m.content) ? m.content.filter(b => b && b.type === 'text').map(b => b.text).join(' ') : '';
            firstUser = String(c).replace(/\s+/g, ' ').trim().slice(0, 80);
          }
        }
      } catch { continue; }
      if (!msgs) continue;
      sessions.push({
        agent, session: name.replace('.jsonl', ''),
        messages: msgs, firstTs, lastTs, topic: firstUser,
      });
    }
  }
  sessions.sort((a, b) => String(b.lastTs).localeCompare(String(a.lastTs)));
  out({ total: sessions.length, windowHours: 48, sessions: sessions.slice(0, 50) });
}

// ============================================================
// 索引自动补全
// ============================================================

function reindex() {
  ensureDirs();
  let idx = fs.readFileSync(INDEX_FILE, 'utf8');
  const added = [];
  for (const f of fs.readdirSync(D.medium).sort()) {
    if (!f.endsWith('.md')) continue;
    const date = f.replace('.md', '');
    let txt; try { txt = fs.readFileSync(path.join(D.medium, f), 'utf8'); } catch { continue; }
    const sections = txt.split(/^## /m).slice(1);
    for (const sec of sections) {
      const [head] = sec.split('\n');
      const title = head.replace(/^\d{2}:\d{2}\s*/, '').trim();
      if (!title) continue;
      if (idx.includes(f) && idx.includes(title)) continue;
      const kwMatch = sec.match(/关键词[：:]\s*(.+)/);
      const kw = kwMatch ? kwMatch[1].trim() : '-';
      const row = `| ${date} | ${kw} | medium/${f} | ${title} |`;
      idx += (idx.endsWith('\n') ? '' : '\n') + row + '\n';
      added.push(row);
    }
  }
  if (added.length) fs.writeFileSync(INDEX_FILE, idx);
  return { added: added.length };
}

// ============================================================
// 自动归档（功能 4）：短期 >30 天按月份 gzip 合并，中期 >180 天单文件 gzip
// P1 改进：归档时同步生成轻量索引（日期+关键词+imp），搜索先查索引再决定是否解压
// ============================================================

function buildArchiveIndex(filePath, data) {
  // 从 JSONL 数据提取索引行：每行 → {ts, imp, keywords}
  const lines = String(data).split('\n').filter(l => l.trim());
  const idx = [];
  for (const line of lines) {
    try {
      const m = JSON.parse(line);
      const words = (String(m.text || '').match(/[\u4e00-\u9fff]{2,6}/g) || [])
        .filter(w => !/^[的地得了吗呢啊哦嗯哈是你我他她它这那]+$/.test(w))
        .slice(0, 5);
      idx.push({ ts: m.ts, imp: m.imp || 0.3, kw: words.join(',') });
    } catch {}
  }
  return idx;
}

function archiveOld() {
  ensureDirs();
  const stat = { shortArchived: 0, mediumArchived: 0 };

  for (const f of fs.readdirSync(D.short)) {
    const m = f.match(/^(\d{4}-\d{2}-\d{2})\.jsonl$/);
    if (!m || daysAgo(m[1]) < SHORT_RETAIN_DAYS) continue;
    const src = path.join(D.short, f);
    const month = m[1].slice(0, 7);
    const dst = path.join(D.shortArchive, `${month}.jsonl.gz`);
    const idxDst = path.join(D.shortArchive, `${month}.idx.json`);
    const data = fs.readFileSync(src);
    let merged = data;
    if (fs.existsSync(dst)) {
      try { merged = Buffer.concat([zlib.gunzipSync(fs.readFileSync(dst)), Buffer.from('\n'), data]); } catch {}
    }
    // P1: 生成归档索引
    let idxEntries = [];
    if (fs.existsSync(idxDst)) {
      try { idxEntries = JSON.parse(fs.readFileSync(idxDst, 'utf8')); } catch {}
    }
    idxEntries = idxEntries.concat(buildArchiveIndex(src, data));
    fs.writeFileSync(idxDst, JSON.stringify(idxEntries));
    fs.writeFileSync(dst, zlib.gzipSync(merged));
    fs.unlinkSync(src);
    stat.shortArchived++;
  }

  for (const f of fs.readdirSync(D.medium)) {
    const m = f.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    if (!m || daysAgo(m[1]) < MEDIUM_RETAIN_DAYS) continue;
    const src = path.join(D.medium, f);
    const dst = path.join(D.mediumArchive, f + '.gz');
    fs.writeFileSync(dst, zlib.gzipSync(fs.readFileSync(src)));
    fs.unlinkSync(src);
    stat.mediumArchived++;
  }

  if (stat.shortArchived || stat.mediumArchived) {
    const s = loadState();
    s.lastArchiveAt = nowIso();
    saveState(s);
  }
  return stat;
}

// ============================================================
// TODO 提取（功能 6）
// ============================================================

const TODO_PATTERNS = [
  /(?:待办|TODO|FIXME)[：:]\s*(.+)/gi,
  /(?:提醒我|别忘了)[：:,，]?\s*([^。\n]{8,80})/g,
  /(?:下一步|计划)[：:]\s*(.+)/gi,
];

// 待办噪音过滤：匹配这些模式的片段不应当作待办
const TODO_NOISE = [
  /^[，,。.、！!？?]+$/,
  /^[的了吧吗呢啊哦呀]+$/,
  /^[0-9a-f]{8}-[0-9a-f]{4}/i,
  /^(很多|一些|这个|那个|这些|那些|什么|怎么|为什么)/,
  /[,，]"$/,
  /[）\)】」]$/,
  /^(天地|宇宙|万物|世间|人生)/,
];

function isTodoNoise(text) {
  if (text.length < 8) return true; // 至少 8 字符（约 4 个中文词）
  // 纯标点/虚词
  if (/^[，,。.、！!？?；;：:…""''\s]+$/.test(text)) return true;
  // 匹配噪音模式
  for (const pat of TODO_NOISE) {
    if (pat.test(text)) return true;
  }
  return false;
}

function loadTodos() {
  try { return JSON.parse(fs.readFileSync(TODOS_FILE, 'utf8')); } catch { return []; }
}
// ---- engine.part2.js ----

function saveTodos(todos) {
  ensureDirs();
  fs.writeFileSync(TODOS_FILE, JSON.stringify(todos, null, 2));
  // 渲染 Markdown 视图
  let md = `# 待办清单\n\n> 引擎自动提取 + 手动添加。完成：\`engine.js todos --done --id <N>\`，更新：\`engine.js todos\`\n\n`;
  const open = todos.filter(t => t.status === 'open');
  const done = todos.filter(t => t.status === 'done').slice(-15);
  md += `## 进行中（${open.length}）\n\n`;
  if (!open.length) md += `- （空）\n`;
  for (const t of open) md += `- [ ] ${t.text}  \`#${t.id}${t.src ? ' | ' + t.src : ''}\`\n`;
  md += `\n## 已完成（最近 ${done.length}）\n\n`;
  for (const t of done) md += `- [x] ${t.text}  \`#${t.id}\`\n`;
  fs.writeFileSync(TODOS_MD, md);
}

function extractTodosFromText(text, src) {
  const found = [];
  for (const pat of TODO_PATTERNS) {
    pat.lastIndex = 0;
    let m;
    while ((m = pat.exec(text)) !== null) {
      const item = m[1].trim();
      if (!isTodoNoise(item) && item.length <= 120 && !found.includes(item)) found.push(item);
      if (found.length > 20) break;
    }
  }
  return found.map(text2 => ({ text: text2, src }));
}

function extractTodos() {
  const todos = loadTodos();
  const seen = new Set(todos.map(t => t.text));
  let added = 0;

  const add = (text2, src) => {
    if (seen.has(text2)) return;
    seen.add(text2);
    todos.push({
      id: todos.length ? Math.max(...todos.map(t => t.id)) + 1 : 1,
      text: text2, src, status: 'open',
      createdAt: nowIso(), doneAt: null,
    });
    added++;
  };

  // 1. 从中期摘要块的「待办」行提取
  for (const f of fs.readdirSync(D.medium)) {
    if (!f.endsWith('.md')) continue;
    let txt; try { txt = fs.readFileSync(path.join(D.medium, f), 'utf8'); } catch { continue; }
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*-\s*(?:待办|TODO)[：:]\s*(.+)$/i);
      if (m) m[1].split(/[;；]/).map(s => s.trim()).filter(s => s && s !== '无' && s !== '-' && s !== '（空）').forEach(t => add(t, `medium/${f}`));
    }
  }

  // 2. 从最近 7 天短期对话提取
  for (const f of fs.readdirSync(D.short)) {
    const m = f.match(/^(\d{4}-\d{2}-\d{2})\.jsonl$/);
    if (!m || daysAgo(m[1]) > 7) continue;
    for (const line of fs.readFileSync(path.join(D.short, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let o; try { o = JSON.parse(line); } catch { continue; }
      if (o.role !== 'user') continue;
      for (const t of extractTodosFromText(o.text, `short/${f}`)) add(t.text, t.src);
    }
  }

  saveTodos(todos);
  return { added, total: todos.length, open: todos.filter(t => t.status === 'open').length };
}

function cmdTodos(opts) {
  ensureDirs();
  const todos = loadTodos();
  if (opts.add) {
    todos.push({
      id: todos.length ? Math.max(...todos.map(t => t.id)) + 1 : 1,
      text: opts.add, src: 'manual', status: 'open',
      createdAt: nowIso(), doneAt: null,
    });
    saveTodos(todos);
    return out({ added: true, total: todos.length, open: todos.filter(t => t.status === 'open').length });
  }
  if (opts.done !== undefined) {
    const id = parseInt(opts.done, 10);
    const t = todos.find(x => x.id === id);
    if (!t) return out({ error: `未找到 #${id}，用 todos 命令查看清单` });
    t.status = 'done';
    t.doneAt = nowIso();
    saveTodos(todos);
    return out({ done: true, id, text: t.text, open: todos.filter(x => x.status === 'open').length });
  }
  // 默认：重新提取 + 展示
  const r = extractTodos();
  out({ ...r, todos: loadTodos().filter(t => t.status === 'open').map(t => ({ id: t.id, text: t.text, src: t.src })) });
}

// ============================================================
// v5.1 P0：工作记忆 — 从最近 raw 对话提取当前任务/决策/待确认
// ============================================================

const WORKING_FILE = path.join(D.shortWorking, 'current.json');

function buildWorkingMemory() {
  ensureDirs();
  const rawLines = [];
  // 读取最近 2 天的 raw 对话
  for (const f of fs.readdirSync(D.shortRaw).sort().slice(-2)) {
    if (!f.endsWith('.jsonl')) continue;
    for (const line of fs.readFileSync(path.join(D.shortRaw, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { rawLines.push(JSON.parse(line)); } catch {}
    }
  }

  // 取最近 8 条高重要性消息
  const recent = rawLines.filter(l => (l.imp || 0) >= 0.35).slice(-12);
  const userMsgs = recent.filter(l => l.role === 'user');

  // 提取当前任务
  let currentTask = '', taskState = 'idle';
  for (const m of userMsgs.reverse()) {
    const t = String(m.text || '').slice(0, 200);
    // 任务信号：要求/做/改/写 开头的句子
    const taskMatch = t.match(/(?:帮我|给我|请|现在|先|做|改|写|实现|升级|修复).{3,60}/);
    if (taskMatch && !currentTask) { currentTask = taskMatch[0]; taskState = 'in_progress'; break; }
  }
  if (!currentTask) { currentTask = '浏览/讨论中'; taskState = 'idle'; }

  // 最近决策（含决定/确认/选择的消息）
  const decisions = recent
    .filter(l => IMP_DECISION.test(String(l.text || '')))
    .slice(-6)
    .map(l => String(l.text || '').replace(/\n/g, ' ').slice(0, 100));

  // 待确认问题（含问号 或 用户纠正）
  const openQuestions = recent
    .filter(l => /[?？]/.test(String(l.text || '')) || /不对|不是|改为|应该是|更正/.test(String(l.text || '')))
    .slice(-5)
    .map(l => String(l.text || '').replace(/\n/g, ' ').slice(0, 120));

  // 最近事实（含数字/版本号/名称的消息）
  const facts = recent
    .filter(l => /\d+\s*(元|块|￥|\$|版本|v\d|分钟|小时|天|\.\d)/.test(String(l.text || '')) && (l.imp || 0) >= 0.3)
    .slice(-6)
    .map(l => String(l.text || '').replace(/\n/g, ' ').slice(0, 100));

  const wm = {
    current_task: currentTask, task_state: taskState,
    recent_decisions: decisions, open_questions: openQuestions,
    recent_facts: facts,
    source_msg_count: recent.length, updated_at: nowIso(),
  };
  fs.writeFileSync(WORKING_FILE, JSON.stringify(wm, null, 2));
  return wm;
}

function loadWorkingMemory() {
  try { return JSON.parse(fs.readFileSync(WORKING_FILE, 'utf8')); }
  catch { return buildWorkingMemory(); }
}

// ============================================================
// v5.1 P0：可注入摘要 — 结构化压缩 raw 对话，只注入精华
// ============================================================

function buildInjectableSummary(day) {
  ensureDirs();
  day = day || today();
  const rawFile = path.join(D.shortRaw, day + '.jsonl');
  if (!fs.existsSync(rawFile)) return null;

  const msgs = [];
  for (const line of fs.readFileSync(rawFile, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { msgs.push(JSON.parse(line)); } catch {}
  }
  if (msgs.length < 3) return null;

  const userMsgs = msgs.filter(m => m.role === 'user');
  const assistantMsgs = msgs.filter(m => m.role === 'assistant');
  const highImp = msgs.filter(m => (m.imp || 0) >= 0.5);

  // 提取话题（从重要消息中提取中文 2-6 字高频词）
  const topicFreq = {};
  for (const m of highImp) {
    const words = String(m.text || '').match(/[\u4e00-\u9fff]{2,6}/g) || [];
    for (const w of words) {
      if (/^[的地得了吗呢啊哦嗯哈]+$/.test(w)) continue;
      topicFreq[w] = (topicFreq[w] || 0) + 1;
    }
  }
  const topics = Object.entries(topicFreq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);

  // 提取事实（含数字/日期的 user 陈述）
  const facts = [];
  for (const m of userMsgs) {
    const t = String(m.text || '');
    if (/\d/.test(t) && t.length > 15 && t.length < 300) {
      facts.push(t.replace(/\n/g, ' ').slice(0, 150));
      if (facts.length >= 5) break;
    }
  }

  // 提取决策（user 含决定/确认/选的消息）
  const decisions = [];
  for (const m of [...userMsgs, ...assistantMsgs]) {
    if (decisions.length >= 4) break;
    const t = String(m.text || '');
    if (IMP_DECISION.test(t) && t.length > 10) {
      decisions.push(t.replace(/\n/g, ' ').slice(0, 150));
    }
  }

  // 待确认
  const openQuestions = [];
  for (const m of userMsgs) {
    if (openQuestions.length >= 3) break;
    const t = String(m.text || '');
    if (/[?？]/.test(t) && t.length > 10) {
      openQuestions.push(t.replace(/\n/g, ' ').slice(0, 150));
    }
  }

  // 生成一句话摘要
  const topicSummary = topics.length ? topics.slice(0, 5).join('、') : '一般对话';
  const summary = `${day} 对话（${msgs.length} 条）：涉及 ${topicSummary}`;

  const inject = {
    summary, topics,
    facts, decisions, open_questions: openQuestions,
    source_refs: [`short/raw/${day}.jsonl`],
    message_count: msgs.length, high_imp_count: highImp.length,
    confidence: Math.min(0.95, 0.5 + highImp.length / Math.max(1, msgs.length) * 0.5),
    updated_at: nowIso(),
  };

  const outFile = path.join(D.shortInject, day + '.json');
  fs.writeFileSync(outFile, JSON.stringify(inject, null, 2));
  return inject;
}

// ============================================================
// v5.1 P0：中长期实时追踪 — 不依赖轮次信号，检测是否需要摘要
// ============================================================

function checkMediumNeeded() {
  ensureDirs();
  const s = loadState();
  const lastCheck = s.lastMediumCheckAt ? new Date(s.lastMediumCheckAt).getTime() : 0;
  if (Date.now() - lastCheck < MEDIUM_CHECK_INTERVAL_MS) return false;

  s.lastMediumCheckAt = nowIso();
  saveState(s);

  const todayMed = path.join(D.medium, today() + '.md');
  if (fs.existsSync(todayMed)) return false; // 今天已有摘要

  // 检查 raw 对话量
  let rawMsgCount = 0, rawImpTotal = 0;
  const recentDays = [];
  for (const f of fs.readdirSync(D.shortRaw).sort().slice(-3)) {
    if (!f.endsWith('.jsonl')) continue;
    recentDays.push(f);
    for (const line of fs.readFileSync(path.join(D.shortRaw, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      rawMsgCount++;
      try { rawImpTotal += JSON.parse(line).imp || 0; } catch {}
    }
  }

  // 触发条件：今天消息 > 20 条且重要性总合 > 5
  const todayCount = (() => {
    const tf = path.join(D.shortRaw, today() + '.jsonl');
    if (!fs.existsSync(tf)) return 0;
    return fs.readFileSync(tf, 'utf8').split('\n').filter(l => l.trim()).length;
  })();

  return todayCount >= MEDIUM_THRESHOLD;
}

// ============================================================
// v5.2：自动整合 — 无需提醒，自动把新对话提炼为中期摘要块并同步索引
// 触发：record / sync 时节流检查；条件满足即写入 medium/ + reindex
// ============================================================

function localHM(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function readNewMessages(sinceTs) {
  const since = sinceTs ? new Date(sinceTs).getTime() : 0;
  const msgs = [];
  const files = fs.existsSync(D.shortRaw)
    ? fs.readdirSync(D.shortRaw).filter(f => f.endsWith('.jsonl')).sort().slice(-2)
    : [];
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(D.shortRaw, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const m = JSON.parse(line);
        if (new Date(m.ts).getTime() > since && String(m.text || '').trim().length >= 6) msgs.push(m);
      } catch {}
    }
  }
  return msgs;
}

function buildAutoSummaryBlock(msgs) {
  const highImp = msgs.filter(m => (m.imp || 0) >= 0.5);
  const clean = t => String(t || '').replace(/\s+/g, ' ').trim();

  // 话题词频（优先高重要性消息）
  const topicFreq = {};
  for (const m of (highImp.length ? highImp : msgs)) {
    const words = String(m.text || '').match(/[\u4e00-\u9fff]{2,6}/g) || [];
    for (const w of words) {
      if (/^[的地得了吗呢啊哦嗯哈是你我他她它这那]+$/.test(w)) continue;
      topicFreq[w] = (topicFreq[w] || 0) + 1;
    }
  }
  const topics = Object.entries(topicFreq).sort((a, b) => b[1] - a[1]).slice(0, 6).map(e => e[0]);

  const decisions = [...new Set(msgs
    .filter(m => IMP_DECISION.test(String(m.text || '')) && String(m.text || '').length > 10)
    .map(m => clean(m.text).slice(0, 120)))].slice(0, 4);

  const facts = [...new Set(msgs
    .filter(m => m.role === 'user' && /\d/.test(String(m.text || '')) && String(m.text || '').length > 15)
    .map(m => clean(m.text).slice(0, 120)))].slice(0, 4);

  const todos = [];
  for (const pat of TODO_PATTERNS) {
    for (const m of msgs) {
      const re = new RegExp(pat.source, pat.flags);
      let mm;
      while ((mm = re.exec(String(m.text || ''))) && todos.length < 3) {
        const t = (mm[1] || mm[0] || '').trim();
        if (t.length >= 4) todos.push(t.slice(0, 100));
      }
    }
  }

  const times = msgs.map(m => new Date(m.ts).getTime()).sort((a, b) => a - b);
  const firstTs = times[0], lastTs = times[times.length - 1];
  const now = localHM(Date.now());
  const title = `自动摘要 ${localHM(firstTs)}–${localHM(lastTs)}（${msgs.length}条）`;

  const lines = [`## ${now} ${title}`];
  lines.push(`- 结论/决策：${decisions.length ? decisions.join('；') : '无'}`);
  lines.push(`- 关键事实：${facts.length ? facts.join('；') : '无'}`);
  lines.push(`- 待办：${todos.length ? todos.join('；') : '无'}`);
  lines.push(`- 关键词：${topics.length ? topics.join(', ') : '一般对话'}`);

  return { text: lines.join('\n'), title, topics, lastTs: new Date(lastTs).toISOString() };
}

function autoConsolidate(opts = {}) {
  ensureDirs();
  const s = loadState();
  const force = !!opts.force;
  const check = !!opts.check;

  // 节流：默认 30 分钟检查一次
  const interval = CFG.thresholds.consolidateIntervalMs || 1800000;
  if (!force && !check && s.lastConsolidateAt &&
      Date.now() - new Date(s.lastConsolidateAt).getTime() < interval) {
    return { needed: false, reason: 'throttled' };
  }

  const msgs = readNewMessages(s.lastConsolidateTs || null);
  const highImpCount = msgs.filter(m => (m.imp || 0) >= 0.5).length;
  // P1: imp 累积值触发（替代硬阈值 8 条）
  const impSum = msgs.reduce((acc, m) => acc + (m.imp || 0.3), 0);
  const minMsgs = CFG.thresholds.consolidateMinMsgs || 8;
  const minHighImp = CFG.thresholds.consolidateMinHighImp || 2;
  const minImpSum = CFG.thresholds.consolidateMinImpSum || 3.0;
  const needed = msgs.length >= minMsgs || highImpCount >= minHighImp || impSum >= minImpSum;

  if (!needed) {
    if (!check) { s.lastConsolidateAt = nowIso(); saveState(s); }
    return { needed: false, reason: 'below-threshold', newMessages: msgs.length, highImpCount, impSum: Math.round(impSum * 100) / 100 };
  }
  if (check) return { needed: true, newMessages: msgs.length, highImpCount, impSum: Math.round(impSum * 100) / 100 };

  const block = buildAutoSummaryBlock(msgs);
  const medFile = path.join(D.medium, today() + '.md');
  let med = fs.existsSync(medFile) ? fs.readFileSync(medFile, 'utf8') : `# ${today()} 中期摘要\n`;
  fs.writeFileSync(medFile, med.trimEnd() + '\n\n' + block.text + '\n');
  try { reindex(); } catch {}
  try { buildContentIndex(); } catch {}

  s.lastConsolidateTs = block.lastTs;
  s.lastConsolidateAt = nowIso();
  s.lastSignalAt = nowIso();  // v3-lite: consolidate 替代 signal
  s.autoConsolidations = (s.autoConsolidations || 0) + 1;
  saveState(s);
  try { appendDevLog(`自动整合 ${msgs.length} 条 → medium/${today()}.md`); } catch {}
  return {
    needed: true, written: `medium/${today()}.md`,
    messages: msgs.length, highImpCount, topics: block.topics, indexUpdated: true,
  };
}

// ============================================================
// v5.1 P0：长期事实建议 — 从近期摘要提取候选，不自动写 memory.md
// 改为写入 proposals 文件，由 agent 人工审阅后确认写入（P0 安全加固）
// ============================================================

const SUGGESTIONS_FILE = path.join(D.engine, 'suggestions.json');

function suggestLongTermFacts() {
  ensureDirs();
  const suggestions = [];
  // 噪音过滤：排除 exec 错误、调试输出、警报消息
  const NOISE = /⚠️|Exec failed|exit|\berror\b|警报|pgrep|nohup|SIGTERM|[0-9a-f]{8}-[0-9a-f]{4}/i;

  // 扫描最近 3 天的 injectable summaries
  for (const f of fs.readdirSync(D.shortInject).sort().slice(-3)) {
    if (!f.endsWith('.json')) continue;
    try {
      const inj = JSON.parse(fs.readFileSync(path.join(D.shortInject, f), 'utf8'));
      for (const fact of inj.facts || []) {
        if (fact.length > 20 && fact.length < 200 && !NOISE.test(fact)) {
          suggestions.push({
            candidate: fact,
            source: `short/inject/${f}`,
            confidence: inj.confidence || 0.7,
            status: 'candidate',
            extracted_at: nowIso(),
            note: '需人工确认后写入 MEMORY.md',
          });
        }
      }
    } catch {}
  }

  if (suggestions.length) {
    fs.writeFileSync(SUGGESTIONS_FILE, JSON.stringify({ updated_at: nowIso(), suggestions: suggestions.slice(0, 15) }, null, 2));
  }
  return suggestions;
}

// ============================================================
// P0 安全：distill proposals — nightly distill 写入候选，agent 审阅后确认
// ============================================================

function loadDistillProposals() {
  try { return JSON.parse(fs.readFileSync(DISTILL_PROPOSALS_FILE, 'utf8')); }
  catch { return { proposals: [], updated_at: null }; }
}

function saveDistillProposal(entry) {
  // entry: { section, content, source, confidence, reason }
  const dp = loadDistillProposals();
  dp.proposals.push({ ...entry, id: dp.proposals.length + 1, status: 'pending', created_at: nowIso() });
  dp.updated_at = nowIso();
  fs.writeFileSync(DISTILL_PROPOSALS_FILE, JSON.stringify(dp, null, 2));
  // 跟踪最后蒸馏时间（用于离线保护）
  const s = loadState();
  s.lastDistillAt = nowIso();
  saveState(s);
  return dp.proposals.length;
}

function cmdDistillProposals(opts) {
  ensureDirs();
  const dp = loadDistillProposals();
  if (opts.list || !opts.apply) {
    const pending = dp.proposals.filter(p => p.status === 'pending');
    return out({ total: dp.proposals.length, pending: pending.length, proposals: pending.slice(0, 20), updated_at: dp.updated_at });
  }
  // apply: 将指定 proposal 写入 MEMORY.md
  const id = parseInt(opts.apply, 10);
  const p = dp.proposals.find(x => x.id === id);
  if (!p || p.status !== 'pending') return out({ error: 'proposal not found or already processed' });

  if (!acquireLock(`distill-apply-${id}`)) return out({ error: 'lock busy, try later' });

  try {
    let mem = fs.readFileSync(LONG_FILE, 'utf8');
    const sectionMarker = `## ${p.section}`;
    // 查找对应小节，追加条目；不存在则在末尾追加整个小节
    const idx = mem.indexOf(sectionMarker);
    if (idx >= 0) {
      const afterSection = mem.indexOf('\n## ', idx + sectionMarker.length);
      const insertAt = afterSection >= 0 ? afterSection : mem.length;
      // 去重：检查是否已有相同内容
      const sectionContent = mem.slice(idx, insertAt);
      if (sectionContent.includes(p.content.slice(0, 40))) {
        p.status = 'skipped'; p.note = '已有相似内容';
      } else {
        mem = mem.slice(0, insertAt) + `\n- ${p.content}` + mem.slice(insertAt);
        p.status = 'applied';
      }
    } else {
      mem += `\n\n${sectionMarker}\n- ${p.content}\n`;
      p.status = 'applied';
    }
    fs.writeFileSync(LONG_FILE, mem);
    snapshotMEMORY(true);
    buildContentIndex();
    appendDevLog(`审阅通过: ${p.content.slice(0, 40)}…`);
  } finally { releaseLock(); }

  dp.updated_at = nowIso();
  fs.writeFileSync(DISTILL_PROPOSALS_FILE, JSON.stringify(dp, null, 2));
  out({ applied: p.status === 'applied', proposal: p });
}

function cmdDistillReject(opts) {
  const id = parseInt(opts.id, 10);
  const dp = loadDistillProposals();
  const p = dp.proposals.find(x => x.id === id);
  if (!p) return out({ error: 'proposal not found' });
  p.status = 'rejected'; p.rejected_at = nowIso(); p.reason = opts.reason || '';
  dp.updated_at = nowIso();
  fs.writeFileSync(DISTILL_PROPOSALS_FILE, JSON.stringify(dp, null, 2));
  out({ rejected: true, proposal: p });
}

// P1: imp 手动校准 — 修正特定消息的重要性评分
function cmdImpCalibrate(opts) {
  const date = opts.date || today();
  const rawFile = path.join(D.shortRaw, date + '.jsonl');
  if (!fs.existsSync(rawFile)) return out({ error: 'raw file not found: ' + rawFile });
  const lines = fs.readFileSync(rawFile, 'utf8').split('\n').filter(l => l.trim());
  const lineNum = parseInt(opts.line, 10);
  if (!lineNum || lineNum < 1 || lineNum > lines.length) return out({ error: 'invalid line number, total: ' + lines.length });
  const target = lines[lineNum - 1];
  let msg; try { msg = JSON.parse(target); } catch { return out({ error: 'not valid JSON' }); }
  const oldImp = msg.imp;
  msg.imp = parseFloat(opts.imp);
  if (isNaN(msg.imp) || msg.imp < 0 || msg.imp > 1) return out({ error: 'imp must be 0-1' });
  lines[lineNum - 1] = JSON.stringify(msg);
  fs.writeFileSync(rawFile, lines.join('\n') + '\n');
  // 记录校准
  const calLog = path.join(D.engine, 'imp-calibration.json');
  let cal = [];
  try { cal = JSON.parse(fs.readFileSync(calLog, 'utf8')); } catch {}
  cal.push({ date, line: lineNum, oldImp, newImp: msg.imp, text: String(msg.text || '').slice(0, 80), at: nowIso(), reason: opts.reason || '' });
  fs.writeFileSync(calLog, JSON.stringify(cal, null, 2));
  out({ calibrated: true, date, line: lineNum, oldImp, newImp: msg.imp, text: String(msg.text || '').slice(0, 80) });
}

// P1: 对话记录开关 — 可选择不保存 raw，其他功能照常
function cmdRecordRaw(opts) {
  const cfg = loadConfig();
  const has = (k) => Object.prototype.hasOwnProperty.call(opts, k);
  if (has('enable')) cfg.recordRaw = true;
  else if (has('disable')) cfg.recordRaw = false;
  else return out({ recordRaw: cfg.recordRaw !== false, usage: 'engine.js record-raw --enable|--disable' });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  out({ recordRaw: cfg.recordRaw !== false, note: cfg.recordRaw !== false ? '对话记录已开启' : '对话记录已关闭（仅关闭 raw，其他功能正常）' });
}

// ============================================================
// MEMORY.md 版本化 & 冲突检测
// 每次 save 或外部写入后自动快照，保留最近 VERSION_RETAIN 个版本
// 冲突判定：对比当前版与前版，输出标题级差异
// ============================================================

function snapshotMEMORY(force) {
  if (!fs.existsSync(LONG_FILE)) return null;
  const content = fs.readFileSync(LONG_FILE, 'utf8');
  const hash = contentHash(content);
  const last = lastSnapshot();
  if (!force && last && last.hash === hash) return null; // 无变化
  if (!force && last && Date.now() - new Date(last.ts).getTime() < VERSION_COOLDOWN) return null;

  const verId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const info = { id: verId, ts: nowIso(), size: content.length, hash, sections: parseSections(content) };
  const file = path.join(D.versions, `${verId}.json`);
  fs.writeFileSync(file, JSON.stringify({ ...info, content }, null, 2));

  // 清理旧版本
  const all = listVersions();
  if (all.length > VERSION_RETAIN) {
    for (const v of all.slice(VERSION_RETAIN)) fs.unlinkSync(v.path);
  }
  return { version: verId, hash, sections: info.sections.length };
}

function parseSections(content) {
  const sections = [];
  const lines = content.split('\n');
  let current = null;
  for (const line of lines) {
    const m = line.match(/^#{1,3}\s+(.+)/);
    if (m) {
      if (current) sections.push(current);
      current = { title: m[1].trim(), level: line.match(/^#+/)[0].length, items: [] };
    } else if (current && line.trim().startsWith('-')) {
      current.items.push(line.trim());
    }
  }
  if (current) sections.push(current);
  return sections;
}

function lastSnapshot() {
  const all = listVersions();
  return all.length ? require(all[0].path) : null;
}

function listVersions() {
  if (!fs.existsSync(D.versions)) return [];
  return fs.readdirSync(D.versions)
    .filter(f => f.endsWith('.json'))
    .sort().reverse()
    .map(f => ({ id: f.replace('.json', ''), path: path.join(D.versions, f) }));
}

function cmdVersion(opts) {
  ensureDirs();
  // same-hour dedup
  const last = lastSnapshot();
  if (last && Date.now() - new Date(last.ts).getTime() < VERSION_COOLDOWN && opts.force === undefined) {
    return out({ snapshotted: false, note: '一小时内已快照，用 --force 强制', previous: last.id });
  }
  const r = snapshotMEMORY(true);
  if (!r) return out({ snapshotted: false, note: '无变更' });
  out({ snapshotted: true, version: r.version, hash: r.hash, sections: r.sections });
}

function cmdVersionHistory() {
  ensureDirs();
  const all = listVersions().slice(0, 20);
  const entries = [];
  for (const v of all) {
    try {
      const d = require(v.path);
      entries.push({ id: d.id, ts: d.ts, hash: d.hash, size: d.size, sectionTitles: (d.sections || []).map(s => s.title) });
    } catch {}
  }
  out({ total: all.length, versions: entries });
}

function cmdVersionDiff(opts) {
  ensureDirs();
  const all = listVersions();
  if (all.length < 2) return out({ error: '至少需要 2 个版本才能对比' });

  const newer = opts.v1 ? all.find(v => v.id === opts.v1) : all[0];
  const older = opts.v2 ? all.find(v => v.id === opts.v2) : all[1];
  if (!newer || !older) return out({ error: '指定版本不存在' });

  const na = require(newer.path);
  const ob = require(older.path);
  const changes = [];

  // 节级对比
  for (const ns of na.sections || []) {
    const os = (ob.sections || []).find(s => s.title === ns.title);
    if (!os) { changes.push({ type: 'added', title: ns.title, items: ns.items }); continue; }
    const added = ns.items.filter(i => !os.items.includes(i));
    const removed = os.items.filter(i => !ns.items.includes(i));
    if (added.length || removed.length) {
      changes.push({ type: 'modified', title: ns.title, added, removed });
    }
  }
  for (const os of ob.sections || []) {
    if (!(na.sections || []).find(s => s.title === os.title)) {
      changes.push({ type: 'removed', title: os.title, items: os.items });
    }
  }

  out({
    v1: { id: newer.id, ts: na.ts },
    v2: { id: older.id, ts: ob.ts },
    sameHash: na.hash === ob.hash,
    changes,
  });
}

// 冲突检测（输出长期记忆中可能存在矛盾的条目）
function cmdConflict() {
  ensureDirs();
  const content = fs.existsSync(LONG_FILE) ? fs.readFileSync(LONG_FILE, 'utf8') : '';
  const pairs = [];
  // 启发式：在同一节下查找包含否定词或矛盾关键词的相邻条目
  const sections = content.split(/^#{1,3}\s+/m).slice(1);
  for (const sec of sections) {
    const items = sec.split('\n').filter(l => l.trim().startsWith('-'));
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        // 同主题矛盾词
        const negators = /不再|不再需要|取消|废除|推翻|撤回|过时|废弃|迁移|替换为|取代/;
        if (negators.test(a) || negators.test(b)) {
          // 提取公共关键词
          const kwA = a.replace(/[-+]/g, '').slice(0, 20);
          const kwB = b.replace(/[-+]/g, '').slice(0, 20);
          const share = [...new Set(kwA)].filter(c => c !== ' ' && kwB.includes(c));
          if (share.length > 3) {
            pairs.push({ a: a.trim().slice(0, 120), b: b.trim().slice(0, 120), sharedChars: share.length });
          }
        }
      }
    }
  }
  // 同时检查变更记录表
  const changeLog = content.match(/## 变更记录[\s\S]*/);
  const conflicts = pairs.slice(0, 10);
  out({
    hasConflicts: conflicts.length > 0,
    conflicts,
    recommendation: conflicts.length ? '建议 review 后决定保留哪条，旧条目建议移入变更记录' : '未检测到明显冲突',
    changeLog: changeLog ? changeLog[0].split('\n').filter(l => l.trim().startsWith('-')).length + ' 条变更记录' : '无变更记录节',
  });
}

// ============================================================
// MEMORY.md 结构化索引（多字段：关键词/标签/实体/时间/节）
// ============================================================

const CONTENT_INDEX_FILE = null; // v5.1: 已合并到 index/index.md，此行仅作向后兼容

function buildContentIndex() {
  ensureDirs();
  // 删除旧 JSON 文件（迁移）
  const oldJson = path.join(D.index, 'content-index.json');
  try { if (fs.existsSync(oldJson)) fs.unlinkSync(oldJson); } catch {}

  const content = fs.existsSync(LONG_FILE) ? fs.readFileSync(LONG_FILE, 'utf8') : '';
  const sections = content.split(/^#{1,3}\s+/m).slice(1);
  const entries = [];

  for (const sec of sections) {
    const lines = sec.split('\n');
    const title = lines[0].trim();
    const body = lines.slice(1).join(' ');

    const keywords = new Set();
    for (const kw of body.match(/[A-Z][a-z]{2,}|[\u4e00-\u9fff]{2,4}|["「]([^"」]+)["」]/g) || []) {
      keywords.add(kw.replace(/[\"「」]/g, '').toLowerCase());
    }
    const entities = [];
    for (const m of body.match(/https?:\/\/[^\s]+|[\w.]+@[\w.]+|\d{4}-\d{2}-\d{2}|v?\d+\.\d+[.\d]*/g) || []) {
      entities.push(m);
    }
    entries.push({ section: title, items: lines.filter(l => l.trim().startsWith('-')).length, keywords: [...keywords].slice(0, 20), entities: entities.slice(0, 5) });
  }

  // 追加结构化索引到 index/index.md 末尾
  const marker = '<!-- content-index:start -->';
  const endMarker = '<!-- content-index:end -->';
  let idx = fs.readFileSync(INDEX_FILE, 'utf8');

  let block = marker + '\n';
  for (const e of entries) {
    block += '- **' + e.section + '**（' + e.items + ' 条目）';
    if (e.keywords.length) block += ' | 词: ' + e.keywords.slice(0, 8).join(', ');
    if (e.entities.length) block += ' | 实体: ' + e.entities.join(', ');
    block += '\n';
  }
  block += endMarker + '\n';

  if (idx.includes(marker)) {
    const startIdx = idx.indexOf(marker);
    const endIdx = idx.indexOf(endMarker) + endMarker.length;
    idx = idx.slice(0, startIdx) + block + idx.slice(endIdx);
  } else {
    idx += '\n' + block;
  }
  fs.writeFileSync(INDEX_FILE, idx);
  return entries;
}

function loadContentIndex() {
  return { builtAt: null, sections: [] };
}

function cmdContentIndex(opts) {
  ensureDirs();
  const entries = buildContentIndex();
  out({ builtAt: nowIso(), sectionCount: entries.length, sections: entries, note: '已同步到 memory/index/index.md（查看末尾标记块）' });
}

// ============================================================

// 记忆层友好名称映射
const LAYER_NAMES = {
  working:'工作台', inject:'今日摘要', raw:'对话记录',
  medium:'中期归档', long:'长期知识', idx:'索引',
  semantic:'语义搜索',
};
function layerName(key) { return LAYER_NAMES[key] || key; }

// P1 查询优先级/权重策略（多路并行召回）
// ============================================================

function queryWeights(opts) {
  const mode = opts.mode || 'keyword';
  // working=工作记忆, inject=可注入摘要, raw=短期原文, medium=中期摘要, long=长期, idx=索引, semantic=语义向量
  const weights = {
    semantic: { working: 0.08, inject: 0.1, raw: 0.1, medium: 0.25, long: 0.22, idx: 0.05, semantic: 0.2 },
    hybrid:   { working: 0.1, inject: 0.12, raw: 0.15, medium: 0.22, long: 0.18, idx: 0.08, semantic: 0.15 },
    keyword:  { working: 0.08, inject: 0.1, raw: 0.12, medium: 0.22, long: 0.28, idx: 0.2, semantic: 0 },
    recent:   { working: 0.25, inject: 0.2, raw: 0.25, medium: 0.15, long: 0.1, idx: 0.03, semantic: 0.02 },
    history:  { working: 0.02, inject: 0.03, raw: 0.05, medium: 0.2, long: 0.45, idx: 0.2, semantic: 0.05 },
  };
  return weights[mode] || weights.keyword;
}

// 单层搜索结果
function searchLayer(query, layer, opts = {}) {
  const terms = query.split(/\s+/).filter(Boolean);
  const results = [];

  const match = (text) => {
    const lower = text.toLowerCase();
    return lower.includes(query.toLowerCase()) || terms.some(t => lower.includes(t.toLowerCase()));
  };

  if (layer === 'working') {
    try {
      const wm = loadWorkingMemory();
      const candidates = [
        { field: 'task', text: wm.current_task || '' },
        ...(wm.recent_decisions || []).map(d => ({ field: 'decision', text: d })),
        ...(wm.open_questions || []).map(q => ({ field: 'question', text: q })),
        ...(wm.recent_facts || []).map(f => ({ field: 'fact', text: f })),
      ];
      for (const c of candidates) {
        if (match(c.text)) {
          results.push({ layer, sub: c.field, text: c.text.slice(0, 200), score: c.field === 'task' ? 2 : 1, imp: 0.7 });
        }
      }
    } catch {}
  }

  if (layer === 'inject') {
    for (const f of fs.readdirSync(D.shortInject).sort().slice(-3)) {
      if (!f.endsWith('.json')) continue;
      try {
        const inj = JSON.parse(fs.readFileSync(path.join(D.shortInject, f), 'utf8'));
        const candidates = [
          { field: 'summary', text: inj.summary || '' },
          ...(inj.topics || []).map(t => ({ field: 'topic', text: t })),
          ...(inj.facts || []).map(fa => ({ field: 'fact', text: fa })),
          ...(inj.decisions || []).map(d => ({ field: 'decision', text: d })),
        ];
        for (const c of candidates) {
          if (match(c.text)) {
            results.push({ layer, sub: c.field, text: c.text.slice(0, 200), score: c.field === 'summary' ? 2 : 1.5, imp: inj.confidence || 0.7, file: `short/inject/${f}` });
          }
        }
      } catch {}
    }
  }

  if (layer === 'raw') {
    for (const f of fs.readdirSync(D.shortRaw).sort().slice(-3)) {
      if (!f.endsWith('.jsonl')) continue;
      let ln = 0;
      for (const line of fs.readFileSync(path.join(D.shortRaw, f), 'utf8').split('\n')) {
        ln++;
        if (!line.trim()) continue;
        let o; try { o = JSON.parse(line); } catch { continue; }
        const text = String(o.text || '');
        if (match(text)) {
          results.push({ layer, sub: 'raw', text: text.slice(0, 200), score: 1, imp: o.imp || 0.3, ts: o.ts, file: `short/raw/${f}`, line: ln });
        }
        if (results.filter(r => r.layer === 'raw').length >= 5) break;
      }
    }
  }

  if (layer === 'medium') {
    for (const f of fs.readdirSync(D.medium).sort().slice(-5)) {
      if (!f.endsWith('.md')) continue;
      let txt; try { txt = fs.readFileSync(path.join(D.medium, f), 'utf8'); } catch { continue; }
      const sections = txt.split(/^## /m).slice(1);
      for (const sec of sections) {
        const [head, ...rest] = sec.split('\n');
        const body = rest.join(' ');
        if (match(head) || match(body)) {
          results.push({ layer, sub: 'summary', text: head.trim().slice(0, 200), score: 1.5, imp: 0.7, file: `medium/${f}` });
        }
        if (results.filter(r => r.layer === 'medium').length >= 5) break;
      }
    }
  }

  if (layer === 'long') {
    if (fs.existsSync(LONG_FILE)) {
      const txt = fs.readFileSync(LONG_FILE, 'utf8');
      const lines = txt.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (match(lines[i]) && lines[i].trim().startsWith('-')) {
          results.push({ layer, sub: 'long', text: lines[i].trim().slice(0, 200), score: 2, imp: 0.9, file: 'MEMORY.md', line: i + 1 });
          if (results.filter(r => r.layer === 'long').length >= 5) break;
        }
      }
    }
  }

  if (layer === 'idx') {
    if (fs.existsSync(INDEX_FILE)) {
      for (const line of fs.readFileSync(INDEX_FILE, 'utf8').split('\n')) {
        if (line.startsWith('|') && match(line)) {
          results.push({ layer, sub: 'index', text: line.slice(0, 200), score: 1.5, imp: 0.6, file: 'memory/index/index.md' });
          if (results.filter(r => r.layer === 'idx').length >= 5) break;
        }
      }
    }
  }

  return results;
}

// 多路并行召回 + 统一排序
async function multiPathSearch(query, opts = {}) {
  const weights = queryWeights(opts);
  const layerNames = Object.keys(weights).filter(k => weights[k] > 0);

  // 并行召回（所有层同时搜索）
  const layerResults = {};
  for (const layer of layerNames) {
    if (layer === 'semantic') {
      const vec = loadVectors();
      if (!vec.items.length) continue;
      const r = await semanticSearch(query, 8);
      if (r && r.hits) layerResults[layer] = r.hits.map(h => ({ ...h, layer: 'semantic', sub: 'vector' }));
    } else {
      layerResults[layer] = searchLayer(query, layer, opts);
    }
  }

  // 统一排序：layer_weight * (score * (1 + imp))
  const merged = [];
  const seen = new Set();
  for (const [layer, results] of Object.entries(layerResults)) {
    const w = weights[layer] || 0.1;
    for (const r of results) {
      const combinedScore = Math.round(w * (r.score || 1) * (1 + (r.imp || 0.3)) * 1000) / 1000;
      const key = r.file ? `${r.file}:${r.line || r.text?.slice(0, 40)}` : `${r.layer}:${r.text?.slice(0, 40)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ...r, combinedScore, weight: Math.round(w * 100) / 100 });
    }
  }

  merged.sort((a, b) => b.combinedScore - a.combinedScore);
  
  // 替换层名为友好名称
  for (const r of merged) r.layer = layerName(r.layer);
  
  // 统计各层命中数
  const layerStats = {};
  for (const r of merged) layerStats[r.layer] = (layerStats[r.layer] || 0) + 1;

  return { total: merged.length, layers: layerStats, results: merged.slice(0, 20), weights: layerNames.reduce((o, l) => ({ ...o, [l]: Math.round(weights[l] * 100) / 100 }), {}) };
}

// ============================================================
// 权限模块：控制对记忆层的访问
// ============================================================

const PERM_FILE = path.join(D.engine, 'permissions.json');

function loadPermissions() {
  try { return JSON.parse(fs.readFileSync(PERM_FILE, 'utf8')); }
  catch {
    const def = { default: 'read', agents: {}, sessions: {} };
    fs.writeFileSync(PERM_FILE, JSON.stringify(def, null, 2));
    return def;
  }
}

function savePermissions(p) {
  ensureDirs();
  fs.writeFileSync(PERM_FILE, JSON.stringify(p, null, 2));
}

function checkPermission(agentId, sessionId) {
  const p = loadPermissions();
  const agentPerm = agentId && p.agents[agentId];
  const sessionPerm = sessionId && p.sessions[sessionId];
  return { canRead: true, canWrite: (agentPerm || sessionPerm || p.default) !== 'read', level: agentPerm || sessionPerm || p.default };
}

function cmdPermission(opts) {
  ensureDirs();
  const p = loadPermissions();

  // 设置权限
  if (opts.agent && opts.level) {
    p.agents[opts.agent] = opts.level;
    savePermissions(p);
    return out({ set: true, agent: opts.agent, level: opts.level });
  }
  if (opts.session && opts.level) {
    p.sessions[opts.session] = opts.level;
    savePermissions(p);
    return out({ set: true, session: opts.session, level: opts.level });
  }
  if (opts.default) {
    p.default = opts.default;
    savePermissions(p);
    return out({ set: true, default: p.default });
  }

  // 查看
  out({
    default: p.default,
    agentCount: Object.keys(p.agents).length,
    sessionCount: Object.keys(p.sessions).length,
    agents: p.agents,
    sessions: p.sessions,
  });
}

// ============================================================
// Gateway 配置读取（HTTP wake API / embedding API key）
// ============================================================

function openclawConfigPaths() {
  return [
    process.env.OPENCLAW_CONFIG_PATH,
    path.join(os.homedir(), '.openclaw', 'openclaw.json'),
  ].filter(Boolean);
}

function loadGatewayConfig() {
  const envPort = process.env.OPENCLAW_GATEWAY_PORT;
  const envToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  if (envPort && envToken) return { port: parseInt(envPort, 10), token: envToken };
  for (const cp of openclawConfigPaths()) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cp, 'utf8'));
      const gw = cfg.gateway || {};
      const port = gw.port || 18789;
      const token = (gw.auth && gw.auth.token) || null;
      if (token) return { port, token };
    } catch { /* 继续 */ }
  }
  return null;
}

// 从 openclaw 配置里找 DashScope API key（用于 embedding）
function findDashScopeKey() {
  if (process.env.DASHSCOPE_API_KEY) return process.env.DASHSCOPE_API_KEY;
  let best = null;
  for (const cp of openclawConfigPaths()) {
    let cfg;
    try { cfg = JSON.parse(fs.readFileSync(cp, 'utf8')); } catch { continue; }
    (function walk(o, baseUrl) {
      if (!o || typeof o !== 'object') return;
      if (typeof o.baseUrl === 'string') baseUrl = o.baseUrl;
      if (typeof o.apiKey === 'string') {
        const isDashScope = baseUrl && baseUrl.includes('dashscope') && !baseUrl.includes('coding');
        const looksLikeDS = o.apiKey.startsWith('sk-');
        if (isDashScope) best = { key: o.apiKey, prio: 2 };
        else if (!best && looksLikeDS) best = { key: o.apiKey, prio: 1 };
      }
      for (const k of Object.keys(o)) walk(o[k], baseUrl);
    })(cfg, null);
    if (best && best.prio === 2) break;
  }
  return best ? best.key : null;
}

// ============================================================
// 摘要信号发送（v4 逻辑保留）
// ============================================================

function resolveBin(name) {
  const envKey = name === 'openclaw' ? 'OPENCLAW_BIN' : 'NODE_BIN';
  if (process.env[envKey] && fs.existsSync(process.env[envKey])) return process.env[envKey];
  const candidates = name === 'node'
    ? [process.execPath]
    : [
        path.join(os.homedir(), '.npm-global', 'bin', name),
        '/usr/local/bin/' + name,
        '/usr/bin/' + name,
      ];
  for (const c of candidates) {
    try { if (fs.existsSync(c) && fs.statSync(c).isFile()) return c; } catch {}
  }
  try {
    const result = execFileSync('which', [name], { encoding: 'utf8', timeout: 3000 }).trim();
    if (result && fs.existsSync(result)) return result;
  } catch {}
  return name;
}

function sendSignal(turns, signalType, callback) {
  if (typeof signalType === 'function') { callback = signalType; signalType = 'short'; }
  const isMedium = signalType === 'medium';
  const label = isMedium ? '中期摘要' : '短期摘要';
  let msg = `⚙️ 【记忆系统】已 ${turns} 轮，触发${label}信号。\n`;
  if (isMedium) {
    msg += `按 MEMORY-PROTOCOL.md 执行：\n` +
      `1) 详细摘要块 → memory/medium/${today()}.md（20轮对话总结）\n` +
      `2) 追加索引 → memory/index/index.md\n` +
      `3) 更新 MEMORY.md（只增不改，冲突加注释）\n` +
      `4) 运行 node tools/memory-engine/engine.js todos（提取待办）`;
  } else {
    msg += `刷新短期记忆和长期记忆。`;
  }

  const openclawBin = resolveBin('openclaw');
  execFile(openclawBin, ['system', 'event', '--mode', 'now', '--text', msg], { timeout: 10000 }, (err) => {
    if (!err) {
      const s = loadState();
      delete s.lastSignalError;
      saveState(s);
      if (callback) callback(null);
      return;
    }
    const gwConfig = loadGatewayConfig();
    if (gwConfig) {
      sendSignalViaHTTP(gwConfig, msg, callback);
    } else {
      const s = loadState();
      s.lastSignalError = `CLI failed: ${err.message}; no gateway config for HTTP fallback`;
      saveState(s);
      if (callback) callback(err);
    }
  });
}

function sendSignalViaHTTP(gwConfig, msg, callback) {
  const payload = JSON.stringify({ text: msg, mode: 'now' });
  const opts = {
    hostname: '127.0.0.1',
    port: gwConfig.port,
    path: '/hooks/wake',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + gwConfig.token,
      'Content-Length': Buffer.byteLength(payload),
    },
    timeout: 10000,
  };
  const req = http.request(opts, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) { if (callback) callback(null); }
      else {
        const err = new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`);
        const s = loadState();
        s.lastSignalError = err.message;
        saveState(s);
        if (callback) callback(err);
      }
    });
  });
  req.on('error', (err) => {
    const s = loadState();
    s.lastSignalError = `HTTP wake also failed: ${err.message}`;
    saveState(s);
    if (callback) callback(err);
  });
  req.write(payload);
  req.end();
}

// ============================================================
// 语义向量（功能 2）：远端 DashScope embedding + 本地字向量回退
// ============================================================

// 本地字向量：中文字符 + 英文词的稀疏哈希向量（零依赖，无网络也能用）
function localEmbed(text) {
  const cfg = loadConfig();
  const dim = cfg.embed.dims || 512;
  const v = new Float64Array(dim);
  const t = String(text).toLowerCase();
  // 中文 unigram + bigram + trigram（更好的语义捕获）
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (/[\u4e00-\u9fff]/.test(c)) {
      v[parseInt(hashStr(c), 36) % dim] += 1;
      if (i + 1 < t.length && /[\u4e00-\u9fff]/.test(t[i + 1])) {
        v[parseInt(hashStr(c + t[i + 1]), 36) % dim] += 1.5;
      }
    }
  }
  // 英文/数字词
  for (const w of t.match(/[a-z0-9_\-]{2,}/g) || []) {
    v[parseInt(hashStr(w), 36) % dim] += 1;
  }
  return normalize(v);
}

function normalize(v) {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  if (!norm) return Array.from(v);
  return Array.from(v, x => Math.round((x / norm) * 10000) / 10000);
}

function cosine(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

async function remoteEmbed(texts) {
  const key = findDashScopeKey();
  if (!key) return null;
  // DashScope 单次最多 10 条，分批请求
  const all = [];
  for (let i = 0; i < texts.length; i += 10) {
    const batch = texts.slice(i, i + 10);
    try {
      const r = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings', {
        method: 'POST',
        headers: { 'Authorization': '***' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'text-embedding-v4', input: batch, dimensions: 256 }),
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return null;
      const j = await r.json();
      if (!j.data || !j.data.length) return null;
      all.push(...j.data.sort((a, b) => a.index - b.index).map(d => d.embedding));
    } catch { return null; }
  }
  return all;
}

function loadVectors() {
  try { return JSON.parse(fs.readFileSync(VECTORS_FILE, 'utf8')); }
  catch { return { mode: null, dim: 0, items: [], updatedAt: null, remoteFailed: false }; }
}

function saveVectors(v) {
  ensureDirs();
  v.updatedAt = nowIso();
  fs.writeFileSync(VECTORS_FILE, JSON.stringify(v));
}

// 构建/刷新语义索引：短期对话消息 + 中期摘要块
async function cmdEmbed(opts) {
  ensureDirs();
  const s = loadState();

  // --enable / --disable 开关
  if (opts.enable !== undefined) {
    s.semanticEnabled = true;
    saveState(s);
    return out({ semanticEnabled: true, note: '语义搜索已开启。运行 embed 构建索引。' });
  }
  if (opts.disable !== undefined) {
    s.semanticEnabled = false;
    saveState(s);
    return out({ semanticEnabled: false, note: '语义搜索已关闭。索引文件保留，可随时 --enable 恢复。' });
  }

  if (!s.semanticEnabled && opts.force === undefined) {
    return out({ error: '语义搜索未开启。先运行: engine.js embed --enable，再运行 embed 构建索引。' });
  }

  const force = opts.force !== undefined;

  // 收集待索引文本块
  const chunks = []; // { id, file, line, ts, imp, text }
  for (const f of fs.readdirSync(D.short).sort()) {
    const m = f.match(/^(\d{4}-\d{2}-\d{2})\.jsonl$/);
    if (!m || daysAgo(m[1]) > EMBED_RECENT_DAYS) continue;
    let ln = 0;
    for (const line of fs.readFileSync(path.join(D.short, f), 'utf8').split('\n')) {
      ln++;
      if (!line.trim()) continue;
      let o; try { o = JSON.parse(line); } catch { continue; }
      const text = String(o.text || '').slice(0, 300);
      if (!text) continue;
      chunks.push({ id: `s:${f}:${ln}`, file: `short/raw/${f}`, line: ln, ts: o.ts, imp: o.imp || 0.3, text });
    }
  }
  for (const f of fs.readdirSync(D.medium).sort()) {
    if (!f.endsWith('.md')) continue;
    let txt; try { txt = fs.readFileSync(path.join(D.medium, f), 'utf8'); } catch { continue; }
    const sections = txt.split(/^## /m).slice(1);
    let secIdx = 0;
    for (const sec of sections) {
      secIdx++;
      const text = sec.slice(0, 500).replace(/\s+/g, ' ').trim();
      if (text) chunks.push({ id: `m:${f}:${secIdx}`, file: `memory/medium/${f}`, line: null, ts: null, imp: 0.7, text });
    }
  }

  const old = loadVectors();
  const chunkIds = new Set(chunks.map(c => c.id));
  // 清理已不存在的块（归档/删除后），保留仍有效的旧向量
  const kept = old.items.filter(i => chunkIds.has(i.id));
  const oldMap = new Map(kept.map(i => [i.id, i]));
  const fresh = chunks.filter(c => force || !oldMap.has(c.id));

  if (!fresh.length && !force) {
    return out({ embedded: 0, total: kept.length, mode: old.mode, note: '索引已最新，用 --force 重建' });
  }

  // 尝试远端 embedding
  const remote = await remoteEmbed(fresh.map(c => c.text));
  if (remote) {
    // 远端成功：丢弃旧的本地向量项（维度不兼容），全部用远端重建
    const base = old.mode === 'remote' ? kept : [];
    const items = [...base];
    for (let i = 0; i < fresh.length; i++) {
      items.push({ id: fresh[i].id, ...pickMeta(fresh[i]), vec: remote[i] });
    }
    const deduped = dedupe(items);
    saveVectors({ mode: 'remote', dim: remote[0].length, items: deduped, remoteFailed: false });
    return out({ embedded: fresh.length, total: deduped.length, mode: 'remote', dims: remote[0].length });
  }

  // 远端失败：本地字向量回退
  if (old.mode === 'remote') {
    // 保留既有远端索引，只标记失败（不混入本地向量污染索引）
    saveVectors({ mode: 'remote', dim: old.dim, items: kept, remoteFailed: true });
    return out({ embedded: 0, total: kept.length, mode: 'remote', remoteFailed: true, note: '远端 embedding 暂不可用，保留既有索引' });
  }
  const items = [...kept];
  for (const c of fresh) items.push({ id: c.id, ...pickMeta(c), vec: localEmbed(c.text) });
  const deduped = dedupe(items);
  saveVectors({ mode: 'local', dim: 512, items: deduped, remoteFailed: false });
  return out({ embedded: fresh.length, total: deduped.length, mode: 'local', dims: 512, note: '本地字向量（远端不可用）' });
}

function pickMeta(c) {
  return { file: c.file, line: c.line, ts: c.ts, imp: c.imp, text: c.text.slice(0, 200) };
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(i => (seen.has(i.id) ? false : (seen.add(i.id), true)));
}

// ============================================================
// Git 备份（功能 10）
// ============================================================

function cmdBackup(opts) {
  ensureDirs();
  const run = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();

  // 自动版本快照
  let version = null;
  try { version = snapshotMEMORY(true); buildContentIndex(); } catch {}

  // 确认是 git 仓库
  try {
    run(['rev-parse', '--git-dir']);
  } catch {
    run(['init', '-b', 'main']);
  }
  // 确认身份
  try { run(['config', 'user.name']); } catch { run(['config', 'user.name', 'memory-engine']); }
  try { run(['config', 'user.email']); } catch { run(['config', 'user.email', 'memory-engine@local']); }

  // 只提交记忆相关文件（白名单，不误提交其他工作区文件）
  const paths = ['MEMORY.md', 'MEMORY-PROTOCOL.md', 'memory', 'tools/memory-engine'];
  run(['add', '--', ...paths.filter(p => fs.existsSync(path.join(ROOT, p)))]);

  const status = run(['status', '--porcelain', '--', ...paths.filter(p => fs.existsSync(path.join(ROOT, p)))]);
  if (!status && opts.force === undefined) {
    return out({ backup: true, committed: false, note: '无变更，无需提交' });
  }
  const msg = opts.msg || `memory: 自动备份 ${nowIso()}`;
  const commitOut = run(['commit', '-m', msg]);
  const sha = run(['rev-parse', '--short', 'HEAD']);
  const files = status ? status.split('\n').length : 0;
  out({ backup: true, committed: true, sha, files, message: msg, log: commitOut.split('\n')[0] });
}

function cmdBackupLog() {
  try {
    const log = execFileSync('git', ['log', '--oneline', '-20', '--', 'memory', 'MEMORY.md'], { cwd: ROOT, encoding: 'utf8' }).trim();
    out({ log: log ? log.split('\n') : [] });
  } catch (e) {
    out({ error: String(e.message).slice(0, 200) });
  }
}

// ============================================================
// v5.1 内置清理：定期删除无用文件（inject/日志/过期建议/孤立文件）
// ============================================================

const CLEANUP_RULES = {
  get injectMaxDays() { return loadConfig().retention.injectDays; },
  get trashMaxDays() { return loadConfig().retention.trashDays; },
  get suggestionsMaxDays() { return loadConfig().retention.suggestionDays; },
  get debugLogMaxDays() { return loadConfig().retention.logDays; },
  emptyDirs: true,
  dryRun: false,
};

function cmdCleanup(opts) {
  ensureDirs();
  const dryRun = opts.dry !== undefined;
  const stat = { deletedFiles: 0, freedBytes: 0, details: [] };

  const remove = (full, label) => {
    let size = 0;
    try { size = fs.statSync(full).size; } catch { return; }
    if (!dryRun) {
      try { fs.unlinkSync(full); } catch { return; }
    }
    stat.deletedFiles++;
    stat.freedBytes += size;
    stat.details.push({ action: 'deleted', file: path.relative(ROOT, full), size, reason: label });
  };

  const removeDir = (full, label) => {
    if (!dryRun) {
      try { fs.rmdirSync(full); } catch {}
    }
    stat.details.push({ action: 'rmdir', dir: path.relative(ROOT, full), reason: label });
  };

  // 1. 过期 inject 文件
  for (const f of fs.readdirSync(D.shortInject)) {
    const m = f.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
    if (!m || daysAgo(m[1]) <= CLEANUP_RULES.injectMaxDays) continue;
    remove(path.join(D.shortInject, f), `inject 超过 ${CLEANUP_RULES.injectMaxDays} 天`);
  }

  // 2. 过期 suggestions 条目（从 JSON 中清除旧条目）
  if (fs.existsSync(SUGGESTIONS_FILE)) {
    try {
      const sug = JSON.parse(fs.readFileSync(SUGGESTIONS_FILE, 'utf8'));
      const cutoff = Date.now() - CLEANUP_RULES.suggestionsMaxDays * 86400000;
      const before = sug.suggestions.length;
      sug.suggestions = (sug.suggestions || []).filter(
        s => new Date(s.extracted_at).getTime() > cutoff
      );
      if (sug.suggestions.length < before) {
        if (!dryRun) fs.writeFileSync(SUGGESTIONS_FILE, JSON.stringify(sug, null, 2));
        stat.details.push({
          action: 'pruned', file: 'memory/engine/suggestions.json',
          removed: before - sug.suggestions.length, kept: sug.suggestions.length,
          reason: `suggestions 超过 ${CLEANUP_RULES.suggestionsMaxDays} 天`,
        });
      }
    } catch {}
  }

  // 3. 引擎调试日志
  for (const f of fs.readdirSync(D.engine)) {
    if (!f.startsWith('hook-debug') && !f.endsWith('.log')) continue;
    const fp = path.join(D.engine, f);
    let st; try { st = fs.statSync(fp); } catch { continue; }
    if (Date.now() - st.mtimeMs < CLEANUP_RULES.debugLogMaxDays * 86400000) continue;
    remove(fp, `调试日志超过 ${CLEANUP_RULES.debugLogMaxDays} 天`);
  }

  // 4. 过期版本快照（超出 VERSION_RETAIN 的删除）
  const allVer = listVersions();
  if (allVer.length > VERSION_RETAIN) {
    for (const v of allVer.slice(VERSION_RETAIN)) {
      remove(v.path, `版本快照超出保留数 ${VERSION_RETAIN}`);
    }
  }

  // 5. 孤立的 workmemory 备份文件（只保留 current.json）
  for (const f of fs.readdirSync(D.shortWorking)) {
    if (f === 'current.json') continue;
    remove(path.join(D.shortWorking, f), '非当前工作记忆文件');
  }

  // 5b. 回收站过期清理
  const trashDir = path.join(MEM, ".trash");
  if (fs.existsSync(trashDir)) {
    for (const f of fs.readdirSync(trashDir)) {
      if (f.endsWith(".meta")) continue;
      const metaFile = path.join(trashDir, f + ".meta");
      let deletedAt = null;
      try { deletedAt = JSON.parse(fs.readFileSync(metaFile, "utf8")).deletedAt; } catch {}
      if (deletedAt && daysAgo(deletedAt.slice(0,10)) > CLEANUP_RULES.trashMaxDays) {
        remove(path.join(trashDir, f), );
        try { fs.unlinkSync(metaFile); } catch {}
      }
    }
  }

  // 6. 清理空目录
  if (CLEANUP_RULES.emptyDirs && !dryRun) {
    const dirsToCheck = [D.shortRaw, D.shortWorking, D.shortInject, D.shortArchive, D.mediumArchive, D.versions];
    for (const dir of dirsToCheck) {
      try {
        if (fs.existsSync(dir) && !fs.readdirSync(dir).length) {
          fs.rmdirSync(dir);
          stat.details.push({ action: 'rmdir', dir: path.relative(ROOT, dir), reason: '空目录' });
        }
      } catch {}
    }
  }

  // 7. 索引 devlog 压缩（只保留最近 20 条）
  if (!dryRun) {
    try {
      const idxText = fs.readFileSync(INDEX_FILE, 'utf8');
      const ds = idxText.indexOf('<!-- devlog:start -->');
      const de = idxText.indexOf('<!-- devlog:end -->');
      if (ds > 0 && de > ds) {
        const lines = idxText.slice(ds, de).split('\n').filter(l => l.trim().startsWith('| 20'));
        if (lines.length > 20) {
          const newBlock = '<!-- devlog:start -->\n' + lines.slice(0, 20).join('\n') + '\n<!-- devlog:end -->';
          const newIdx = idxText.slice(0, ds) + newBlock + idxText.slice(de + '<!-- devlog:end -->'.length);
          fs.writeFileSync(INDEX_FILE, newIdx);
          stat.details.push({ action: 'pruned', file: 'memory/index/index.md', removed: lines.length - 20, kept: 20, reason: 'devlog 压缩到 20 条' });
        }
      }
    } catch {}
  }

  out({
    cleanup: true, dryRun,
    deletedFiles: stat.deletedFiles, freedBytes: stat.freedBytes,
    freedKB: Math.round(stat.freedBytes / 1024 * 100) / 100,
    details: stat.details.slice(0, 30),
    rules: CLEANUP_RULES,
    note: dryRun ? 'DRY RUN — 未实际删除，加 --confirm 执行' : '已执行清理',
  });
}

// 静默版清理（sync 自动触发，不打印）
function cmdCleanupSilent() {
  const savedLog = console.log;
  console.log = () => {};
  try { cmdCleanup({ dry: false }); } catch {} finally { console.log = savedLog; }
}

// ---- engine.part3.js ----

// ============================================================
// P1 敏感信息脱敏
// ============================================================

const SENSITIVE_PATTERNS = [
  [/(?:sk|api[_-]?key|token|secret|password|bearer)\s*[:=]\s*['"]?[a-zA-Z0-9_\-.]{16,}['"]?/gi, (m) => m.slice(0, m.indexOf(m.match(/[=:]/)?.[0] || '') + 1) + ' [已脱敏]'],
  [/eyJ[a-zA-Z0-9_\-]{20,}/g, '[JWT已脱敏]'],
  [/(?:-----BEGIN\s*(?:RSA\s*)?PRIVATE\s*KEY-----)[\s\S]*?-----END\s*(?:RSA\s*)?PRIVATE\s*KEY-----/g, '[私钥已脱敏]'],
  [/\b\d{15,19}\b/g, (m) => m.slice(0, 4) + '****' + m.slice(-4)],
];

function sanitizeText(text) {
  let s = String(text || '');
  for (const [pat, repl] of SENSITIVE_PATTERNS) s = s.replace(pat, repl);
  return s;
}

// 存储前压缩：去表格、截代码块、收空白、截断长文本
function compressForStorage(text) {
  let s = String(text || '');
  // Markdown 表格 → 压缩标注
  s = s.replace(/\|[-\s|]+\|[\s\S]*?(?=\n\n|\n##|\n---|$)/g, (m) => {
    const rows = m.trim().split('\n').filter(l => l.includes('|'));
    return rows.length > 3 ? `\n[表格: ${rows.length}行]\n` : m;
  });
  // 代码块 → 仅保留语言标签
  s = s.replace(/```[\s\S]*?```/g, (m) => {
    const lang = m.match(/```(\w+)/);
    return lang ? `[代码块: ${lang[1]}]` : '[代码块]';
  });
  // JSON/大段数据 → 摘要
  s = s.replace(/(\{[\s\S]{200,}\}|\[[\s\S]{200,}\])/g, (m) => {
    try { const o=JSON.parse(m); const keys=Array.isArray(o)?`[${o.length}项]`:Object.keys(o).join(','); return `[JSON: ${keys}]`; }
    catch { return m.length>200?`[数据: ${m.length}字符]`:m; }
  });
  // 多连续空行 → 单空行
  s = s.replace(/\n{3,}/g, '\n\n');
  // 超长分隔线 → 短
  s = s.replace(/^[-=*_]{10,}$/gm, '---');
  // 截断：可配置
  const maxChars = CFG.thresholds.rawMaxChars || 800;
  if (s.length > maxChars) s = s.slice(0, maxChars) + '…';
  return s.trim();
}

// ============================================================
// v3 配置管理
// ============================================================

function cmdConfig(opts) {
  ensureDirs();
  const cfg = loadConfig();
  if (opts.get) {
    const path = opts.get.split('.');
    let v = cfg;
    for (const p of path) { if (v && typeof v === 'object') v = v[p]; else break; }
    return out({ key: opts.get, value: v });
  }
  if (opts.set && opts.value !== undefined) {
    const path2 = opts.set.split('.');
    let newCfg = JSON.parse(JSON.stringify(cfg));
    let target = newCfg;
    for (let i = 0; i < path2.length - 1; i++) { if (!target[path2[i]]) target[path2[i]] = {}; target = target[path2[i]]; }
    const last = path2[path2.length - 1];
    let val = opts.value;
    if (val === 'true') val = true; else if (val === 'false') val = false; else if (!isNaN(Number(val))) val = Number(val);
    target[last] = val;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(newCfg, null, 2));
    return out({ set: true, key: opts.set, value: val, note: '已更新。下次 sync 生效。' });
  }
  if (opts.reset !== undefined) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return out({ reset: true, note: '配置已恢复默认' });
  }
  out(cfg);
}

// ============================================================
// P1 hook补偿扫描：检测未提炼raw/缺失摘要/索引断裂/工作记忆过期
// ============================================================



// ============================================================
// raw 文件截断：保持短期记忆精简
// ============================================================

function truncateRawFiles() {
  const stat = { trimmed: 0, freedLines: 0, rescued: 0 };
  for (const f of fs.readdirSync(D.shortRaw)) {
    if (!f.endsWith('.jsonl')) continue;
    const fp = path.join(D.shortRaw, f);
    const lines = fs.readFileSync(fp, 'utf8').split('\n').filter(l => l.trim());
    if (lines.length <= MAX_RAW_LINES_PER_DAY) continue;
    const parsed = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    // 极高重要性消息（imp ≥ 0.7）：截断前先存入中期摘要，防止原文永久丢失
    const veryHigh = parsed.filter(p => (p.imp || 0) >= 0.7);
    if (veryHigh.length > 0) {
      const medFile = path.join(D.medium, f.replace('.jsonl', '.md'));
      let existing = '';
      try { existing = fs.readFileSync(medFile, 'utf8'); } catch {}
      const snippet = veryHigh.map(m =>
        `- [HIGH ${m.ts || ''}] (${m.role}) ${String(m.text || '').slice(0, 200)}`
      ).join('\n');
      fs.writeFileSync(medFile, (existing.trimEnd() + '\n\n## 截断保护\n' + snippet + '\n').trimStart());
      stat.rescued += veryHigh.length;
    }
    // 保留高重要性行 + 最后 N 行
    const hiImp = parsed.filter(p => (p.imp || 0) >= 0.5);
    const tail = parsed.slice(-Math.floor(MAX_RAW_LINES_PER_DAY / 2));
    const keep = new Map();
    for (const p of [...hiImp, ...tail]) keep.set(JSON.stringify(p), p);
    stat.freedLines += lines.length - keep.size;
    fs.writeFileSync(fp, [...keep.values()].sort((a, b) => (a.ts || '').localeCompare(b.ts || '')).map(p => JSON.stringify(p)).join('\n') + '\n');
    stat.trimmed++;
  }
  return stat;
}
function compensationScan() {
  ensureDirs();
  const issues = [];

  const rawDays = new Set(fs.readdirSync(D.shortRaw).filter(f => f.endsWith('.jsonl')).map(f => f.replace('.jsonl', '')));
  const injectDays = new Set(fs.readdirSync(D.shortInject).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')));
  for (const d of rawDays) {
    if (!injectDays.has(d) && d >= dayOf(Date.now() - 3 * 86400000)) {
      issues.push({ severity: 'warn', type: 'missing_inject', msg: `${d} 有 raw 无 inject，自动生成` });
      try { buildInjectableSummary(d); } catch {}
    }
  }

  const todayMed = path.join(D.medium, today() + '.md');
  const todayRaw = path.join(D.shortRaw, today() + '.jsonl');
  const rawCount = fs.existsSync(todayRaw) ? fs.readFileSync(todayRaw, 'utf8').split('\n').filter(l => l.trim()).length : 0;
  if (rawCount >= 15 && !fs.existsSync(todayMed)) {
    issues.push({ severity: 'warn', type: 'medium_needed', msg: `${today()} raw ${rawCount} 条无中期摘要` });
  }

  if (fs.existsSync(INDEX_FILE)) {
    const idxText = fs.readFileSync(INDEX_FILE, 'utf8');
    for (const f of fs.readdirSync(D.medium).sort().slice(-3)) {
      if (f.endsWith('.md') && !idxText.includes(f)) {
        issues.push({ severity: 'info', type: 'missing_index', msg: `${f} 缺索引，已补齐` });
      }
    }
  }

  if (fs.existsSync(WORKING_FILE)) {
    try {
      const wm = JSON.parse(fs.readFileSync(WORKING_FILE, 'utf8'));
      if (Date.now() - new Date(wm.updated_at).getTime() > 7200000) {
        issues.push({ severity: 'info', type: 'stale_working', msg: '工作记忆过期，已刷新' });
        buildWorkingMemory();
      }
    } catch {}
  }

  try { reindex(); } catch {}
  try { buildContentIndex(); } catch {}
  return issues;
}

// ============================================================
// 命令实现
// ============================================================

function cmdRecord(role, text) {
  ensureDirs();
  const s = loadState();
  if (!s.enabled) return out({ recorded: false, reason: 'disabled' });

  text = compressForStorage(sanitizeText(String(text || '')));
  if (!text.trim()) return out({ recorded: false, reason: 'empty' });

  const imp = importanceOf(role, text);
  // 可选开关：允许关闭对话记录（raw），其他功能照常
  if (CFG.recordRaw !== false) {
    const line = JSON.stringify({ ts: nowIso(), role, text, imp }) + '\n';
    fs.appendFileSync(path.join(D.shortRaw, `${today()}.jsonl`), line);
  }

  // v5.1 P0：高重要性消息触发工作记忆刷新
  if (imp >= 0.5) {
    s.highImpMsgs = (s.highImpMsgs || 0) + 1;
    if (s.highImpMsgs % WORKING_UPDATE_THRESHOLD === 0) {
      try { buildWorkingMemory(); } catch {}
    }
  }

  // 高重要性 user 消息顺带提取待办
  if (role === 'user' && (IMP_TODO.test(text))) {
    try { extractTodos(); } catch { /* 不影响主流程 */ }
  }

  s.totalMessages++;
  s.lastMessageAt = nowIso();
  if (role === 'user') {
    s.turns++;
  }
  saveState(s);
  // 每次落盘顺带补录转录里的消息 + 索引补全（增量，开销小）
  syncTranscripts();
  reindex();
  // v5.2：自动整合检查（节流，满足条件才写中期摘要块）
  let consolidated = null;
  try { consolidated = autoConsolidate(); } catch {}
  out({ recorded: true, turns: s.turns, totalMessages: s.totalMessages, imp, consolidated });
}

function cmdStatus() {
  ensureDirs();
  const s = loadState();
  s.nextShortIn = SHORT_THRESHOLD - (s.turns % SHORT_THRESHOLD);
  s.nextMediumIn = MEDIUM_THRESHOLD - (s.turns % MEDIUM_THRESHOLD);
  s.nextSignalIn = Math.min(s.nextShortIn, s.nextMediumIn);
  s.root = ROOT;
  s.engineDir = ENGINE_DIR;
  s.version = 'Mnemosyne v3-lite';
  // 附加 v5 状态
  const vec = loadVectors();
  s.semanticEnabled = s.semanticEnabled || false;
  s.semanticIndex = { enabled: s.semanticEnabled, items: vec.items.length, mode: vec.mode, updatedAt: vec.updatedAt, remoteFailed: vec.remoteFailed || false };
  const todos = loadTodos();
  s.todos = { total: todos.length, open: todos.filter(t => t.status === 'open').length };
  const c2 = loadConfig(); s.retention = c2.retention; s.config = { weights: c2.weights };
  // v5.1 P0 状态
  let wm = null;
  try { wm = JSON.parse(fs.readFileSync(WORKING_FILE, 'utf8')); }
  catch { wm = { current_task: '(未初始化)' }; }
  s.workingMemory = { task: wm.current_task, state: wm.task_state, decisions: (wm.recent_decisions || []).length, questions: (wm.open_questions || []).length };
  s.shortLayers = { 对话记录: fs.existsSync(D.shortRaw) ? fs.readdirSync(D.shortRaw).filter(f => f.endsWith('.jsonl')).length : 0, 工作台: fs.existsSync(WORKING_FILE), 今日摘要: fs.existsSync(D.shortInject) ? fs.readdirSync(D.shortInject).filter(f => f.endsWith('.json')).length : 0 };
  // P1: pending distill proposals
  const dp = loadDistillProposals();
  s.pendingProposals = dp.proposals.filter(p => p.status === 'pending').length;
  s.recordRaw = CFG.recordRaw !== false;
  out(s);
}

function cmdSetEnabled(on) {
  const s = loadState();
  s.enabled = on;
  saveState(s);
  out({ enabled: on });
}

function cmdSignal() {
  const s = loadState();
  s.lastSignalAt = nowIso();
  saveState(s);
}

function cmdInit() {
  ensureDirs();
  out({ initialized: true, root: ROOT, dirs: D });
}

function cmdSync(opts = {}) {
  const quick = opts.quick || false;
  // 0. 数据迁移：如有旧 conversations/ 目录，移动到 raw/
  const oldConv = path.join(path.dirname(D.shortRaw), 'conversations');
  if (fs.existsSync(oldConv) && D.shortRaw !== oldConv) {
    try {
      for (const f of fs.readdirSync(oldConv)) {
        const src = path.join(oldConv, f);
        const dst = path.join(D.shortRaw, f);
        if (!fs.existsSync(dst)) fs.renameSync(src, dst);
        else { const ext = fs.readFileSync(src); fs.appendFileSync(dst, ext); fs.unlinkSync(src); }
      }
      if (!fs.readdirSync(oldConv).length) fs.rmdirSync(oldConv);
    } catch {}
  }

  // 0. raw 截断 + P1 补偿扫描（quick 模式跳过——这些是以天为单位的操作）
  let rawTrimmed = null, compensation = null;
  if (!quick) {
    try { rawTrimmed = truncateRawFiles(); } catch {}
    try { compensation = compensationScan(); } catch {}
  }
  // 1. 转录补录 → raw（核心，quick 保留）
  const synced = syncTranscripts();
  // 2. 索引补全（核心，quick 保留）
  const reindexed = reindex();
  // 3. 归档检查（quick 跳过）
  let archived = { shortArchived: 0, mediumArchived: 0 };
  if (!quick) {
    const s = loadState();
    if (!s.lastArchiveCheckAt || Date.now() - new Date(s.lastArchiveCheckAt).getTime() > ARCHIVE_INTERVAL_MS) {
      s.lastArchiveCheckAt = nowIso();
      saveState(s);
      try { archived = archiveOld(); } catch {}
    }
  }
  // 4. 工作记忆（核心，quick 保留）
  let working = null;
  try { working = buildWorkingMemory(); } catch {}
  // 5. 可注入摘要（核心，quick 保留）
  let inject = null;
  try { inject = buildInjectableSummary(); } catch {}
  // 6. 中期摘要实时检测（quick 跳过——consolidate 已覆盖）
  let mediumNeeded = false;
  if (!quick) {
    try { mediumNeeded = checkMediumNeeded(); } catch {}
  }
  // 6.5 自动整合（核心，quick 保留）
  let consolidated = null;
  try { consolidated = autoConsolidate(); } catch {}
  // 7-9. 长期建议 + TODO + 清理 + 快照（quick 跳过）
  let suggestions = 0, todoStats = null, version = null;
  if (!quick) {
    try { todoStats = extractTodos(); } catch {}
    const sc = loadState();
    if (!sc.lastCleanupAt || Date.now() - new Date(sc.lastCleanupAt).getTime() > 86400000) {
      sc.lastCleanupAt = nowIso();
      saveState(sc);
      try { cmdCleanupSilent(); } catch {}
    }
    try { version = snapshotMEMORY(); buildContentIndex(); } catch {}
  }
  // 10. 离线保护（quick 跳过——避免大批量 proposals）

  out({
    synced, reindexed, archived,
    working: working ? { task: working.current_task, state: working.task_state, decisions: working.recent_decisions.length, questions: working.open_questions.length } : null,
    inject: inject ? { topics: inject.topics, facts: inject.facts.length, decisions: inject.decisions.length, confidence: inject.confidence } : null,
    mediumNeeded, consolidated, suggestions, todos: todoStats,
    rawTrimmed, compensation: compensation ? compensation.length : 0, compensationIssues: compensation,
    version: version ? version.version : null, at: nowIso(), quick,
    distillCatchUp,
  });
}

function cmdReindex() {
  out(reindex());
}

// v3: 索引进化日志 — 记录开发迭代，高频更新
const DEVLOG_MARKER = '<!-- devlog:start -->';
const DEVLOG_END = '<!-- devlog:end -->';

function appendDevLog(entry) {
  ensureDirs();
  const ts = new Date().toISOString().replace('T',' ').slice(0,19);
  const line = `| ${ts} | ${entry} |`;
  let idx = fs.existsSync(INDEX_FILE) ? fs.readFileSync(INDEX_FILE, 'utf8') : loadTemplate('index.md');
  
  // 去重：同一分钟内不重复记录相同事件
  if (idx.includes(entry.slice(0,30))) return null;
  
  // 插入到开发日志表格头部（最新在前）
  if (idx.includes(DEVLOG_MARKER)) {
    idx = idx.replace(DEVLOG_MARKER, DEVLOG_MARKER + '\n' + line);
  } else {
    // 首次：在索引标题后插入开发日志节
    const h1End = idx.indexOf('\n', idx.indexOf('# '));
    const devSection = `\n\n## 🛠 开发日志\n\n| 时间 | 事件 |\n|------|------|\n${DEVLOG_MARKER}\n${line}\n${DEVLOG_END}\n`;
    idx = idx.slice(0, h1End + 1) + devSection + idx.slice(h1End + 1);
  }
  fs.writeFileSync(INDEX_FILE, idx);
  return line;
}

function cmdDevLog(opts) {
  ensureDirs();
  if (opts.log) {
    const line = appendDevLog(opts.log);
    return out({ logged: true, line });
  }
  // 查看最近日志
  const idx = fs.existsSync(INDEX_FILE) ? fs.readFileSync(INDEX_FILE, 'utf8') : '';
  const section = idx.match(/## 开发日志\n[\s\S]*/);
  const lines = section ? section[0].split('\n').filter(l => l.startsWith('|') && l.includes('|')) : [];
  out({ total: lines.length, recent: lines.slice(-10) });
}

// ============================================================
// P2 全量索引重建（lite 版保留但仅作为内部函数，无 CLI 入口）
// ============================================================

function cmdReindexAll(opts) {
  ensureDirs();
  const stat = {};

  // 1. 索引补全
  stat.reindex = reindex();

  // 2. 结构化内容索引
  try { stat.contentIndex = buildContentIndex(); stat.contentCount = stat.contentIndex.length; } catch(e) { stat.contentError = e.message; }

  // 3. 语义索引重建
  const s = loadState();
  if (s.semanticEnabled) {
    try {
      const vec = loadVectors();
      if (opts.force !== undefined || vec.items.length === 0) {
        // 强制重建：删除旧向量文件
        const savedLog = console.log;
        console.log = () => {};
        stat.semantic = { rebuilt: false };
        try {
          // 清空旧索引
          saveVectors({ mode: 'local', dim: 512, items: [], remoteFailed: false });
          // 等价于 embed --force
          const _opts = { force: '' };
          const oldEmbed = cmdEmbed;
          // 直接调用重建
          console.log = savedLog;
        } catch(e2) { stat.semanticError = e2.message; }
      } else {
        stat.semantic = { items: vec.items.length, mode: vec.mode, note: '索引已存在，加 --force 重建' };
      }
    } catch(e) { stat.semanticError = e.message; }
  } else {
    stat.semantic = { note: '语义搜索未开启，跳过。先 embed --enable' };
  }

  // 4. TODO 提取
  try { stat.todos = extractTodos(); } catch(e) { stat.todoError = e.message; }

  // 5. 工作记忆刷新
  try { stat.working = buildWorkingMemory() ? '已刷新' : '失败'; } catch(e) { stat.workingError = e.message; }

  // 6. 补偿扫描
  try { stat.compensation = compensationScan(); } catch(e) { stat.compensationError = e.message; }

  out({ rebuilt: true, at: nowIso(), stat });
}

// ============================================================
// P2 恢复：从版本快照恢复 MEMORY.md
// ============================================================

function cmdRestore(opts) {
  ensureDirs();
  const all = listVersions();

  if (opts.list !== undefined || (!opts.id && !opts.from)) {
    const entries = all.slice(0, 10).map(v => {
      try {
        const d = JSON.parse(fs.readFileSync(v.path, 'utf8'));
        return { id: d.id, ts: d.ts, hash: d.hash, size: d.size, sectionCount: (d.sections || []).length };
      } catch { return { id: v.id, error: '无法读取' }; }
    });
    return out({ action: 'list', versions: entries, hint: '用 --id <版本ID> 恢复指定版本，或用 --from latest 恢复最新' });
  }

  let target = null;
  if (opts.from === 'latest' || !opts.id) {
    target = all.length ? all[0] : null;
  } else {
    target = all.find(v => v.id === opts.id);
  }
  if (!target) return out({ error: '未找到指定版本，用 restore --list 查看可用版本' });

  try {
    const d = JSON.parse(fs.readFileSync(target.path, 'utf8'));
    if (!d.content) return out({ error: '该版本不包含完整内容（旧格式）' });

    // 先备份当前
    snapshotMEMORY(true);
    fs.writeFileSync(LONG_FILE, d.content);

    out({ restored: true, version: d.id, ts: d.ts, hash: d.hash, size: d.content.length,
      note: 'MEMORY.md 已恢复。当前版本已自动备份。' });
  } catch(e) {
    out({ error: '恢复失败: ' + e.message });
  }
}

// ============================================================
// 搜索

function highlight(text, terms) {
  let s = text;
  for (const t of terms) {
    if (!t) continue;
    try {
      s = s.split(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).join('⟪$1⟫');
    } catch { /* 忽略 */ }
  }
  return s;
}

function keywordSearch(query) {
  const q = query.toLowerCase();
  const terms = query.split(/\s+/).filter(Boolean);
  const results = [];

  for (const { full, rel } of allMemoryFiles()) {
    try {
      // P1: gz 文件先用轻量索引筛选，命中才解压
      if (full.endsWith('.gz') && rel.includes('short/archive/')) {
        const idxFile = path.join(path.dirname(full), path.basename(full, '.jsonl.gz') + '.idx.json');
        if (fs.existsSync(idxFile)) {
          try {
            const idx = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
            const matched = idx.some(e => {
              const combined = (e.kw || '') + ' ' + q;
              return combined.toLowerCase().includes(q) || terms.some(t => combined.toLowerCase().includes(t));
            });
            if (!matched) continue; // 索引无匹配，跳过解压
          } catch {}
        }
      }

      const txt = readMaybeGz(full);
      const lines = txt.split('\n');
      const hits = [];
      lines.forEach((line, i) => {
        const lower = line.toLowerCase();
        const matched = lower.includes(q) || terms.some(t => lower.includes(t.toLowerCase()));
        if (!matched) return;
        // 上下文：前后各 1 行
        const ctx = [];
        if (i > 0 && lines[i - 1].trim()) ctx.push(lines[i - 1].trim().slice(0, 120));
        ctx.push(line.trim().slice(0, 300));
        if (i < lines.length - 1 && lines[i + 1].trim()) ctx.push(lines[i + 1].trim().slice(0, 120));
        // JSONL 行：尝试解析 imp 加权
        let imp = null;
        if (full.endsWith('.jsonl')) {
          try { const o = JSON.parse(line); if (typeof o.imp === 'number') imp = o.imp; } catch {}
        }
        hits.push({
          line: i + 1,
          text: highlight(line.trim().slice(0, 220), terms),
          context: ctx.map((c, j) => j === (i > 0 ? 1 : 0) ? highlight(c, terms) : c),
          imp,
        });
        if (hits.length >= 10) return; // 单文件最多 10 条
      });
      if (!hits.length) continue;
      const impBoost = hits.reduce((acc, h) => acc + (h.imp || 0.3), 0) / hits.length;
      results.push({ file: rel, hits, score: hits.length * (1 + impBoost), archived: full.endsWith('.gz') });
    } catch { /* 跳过 */ }
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

async function semanticSearch(query, topN = 8) {
  const vec = loadVectors();
  if (!vec.items.length) return null;
  // 查询向量：远端索引尝试远端 embed，失败回退本地
  let qv = null, qvMode = 'local';
  if (vec.mode === 'remote') {
    const r = await remoteEmbed([query]);
    if (r && r[0] && r[0].length === vec.dim) { qv = r[0]; qvMode = 'remote'; }
  }
  if (!qv) qv = localEmbed(query);

  const results = [];
  for (const item of vec.items) {
    let sim;
    if (qvMode === 'remote' && vec.mode === 'remote' && item.vec && item.vec.length === vec.dim) {
      sim = cosine(qv, item.vec);
    } else {
      // 维度/模式不匹配：双方都用本地向量比
      sim = cosine(localEmbed(query), localEmbed(item.text));
    }
    if (sim > 0.05) results.push({ ...item, score: Math.round(sim * (1 + item.imp) * 1000) / 1000 });
  }
  results.sort((a, b) => b.score - a.score);
  return {
    mode: vec.mode, qvMode,
    hits: results.slice(0, topN).map(r => ({
      file: r.file, line: r.line, ts: r.ts, imp: r.imp, score: r.score, text: r.text,
    })),
  };
}

async function cmdSearch(query, opts) {
  ensureDirs();
  if (!query) return out({ error: '用法: engine.js search --query "关键词" [--mode keyword|semantic|hybrid|recent|history]' });
  const mode = opts.mode || 'keyword';

  // P1：所有模式走多路并行召回
  const s = loadState();
  const vec = loadVectors();
  // semantic/hybrid 模式但未开启：自动降级为 keyword
  const effectiveMode = (!s.semanticEnabled && (mode === 'semantic' || mode === 'hybrid')) ? 'keyword' : mode;
  if (effectiveMode !== mode) opts = { ...opts, mode: effectiveMode };
  if (s.semanticEnabled && !vec.items.length && (effectiveMode === 'semantic' || effectiveMode === 'hybrid')) await cmdEmbedSilent();

  const result = await multiPathSearch(query, { mode });
  const indexInfo = { mode: vec.mode, items: vec.items.length, remoteFailed: vec.remoteFailed || false };

  out({ query, mode: effectiveMode, fallback: effectiveMode !== mode ? '语义未开启→降级keyword' : null, total: result.total, layers: result.layers, weights: result.weights, results: result.results, indexInfo });
}

async function cmdEmbedSilent() {
  // 静默版 embed（搜索时自动触发，不打印）
  const savedOut = console.log;
  console.log = () => {};
  try { await cmdEmbed({}); } catch {} finally { console.log = savedOut; }
}

function cmdStats() {
  ensureDirs();
  const s = loadState();

  // 按天消息统计 + 重要性分布
  const daily = {};
  const impBuckets = { low: 0, mid: 0, high: 0 };
  for (const f of fs.readdirSync(D.short)) {
    if (!f.endsWith('.jsonl')) continue;
    const date = f.replace('.jsonl', '');
    let count = 0;
    for (const line of fs.readFileSync(path.join(D.short, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      count++;
      try {
        const o = JSON.parse(line);
        const imp = o.imp || 0.3;
        if (imp >= 0.6) impBuckets.high++;
        else if (imp >= 0.35) impBuckets.mid++;
        else impBuckets.low++;
      } catch {}
    }
    daily[date] = count;
  }
  // 归档消息数
  const archivedDays = {};
  for (const f of fs.readdirSync(D.shortArchive)) {
    if (!f.endsWith('.gz')) continue;
    try {
      archivedDays[f.replace('.jsonl.gz', '')] = readMaybeGz(path.join(D.shortArchive, f)).split('\n').filter(l => l.trim()).length;
    } catch {}
  }

  // 关键词频率
  const kw = {};
  for (const f of fs.readdirSync(D.medium)) {
    if (!f.endsWith('.md')) continue;
    const txt = fs.readFileSync(path.join(D.medium, f), 'utf8');
    const matches = txt.match(/关键词[：:]\s*(.+)/g);
    if (matches) {
      for (const m of matches) {
        m.replace(/关键词[：:]\s*/, '').split(/[,，、\s]+/)
          .filter(w => w.length > 1)
          .forEach(w => { kw[w] = (kw[w] || 0) + 1; });
      }
    }
  }
  const topKw = Object.entries(kw).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([word, count]) => ({ word, count }));

  // 各层文件数
  const layers = { index: 0, short: 0, medium: 0, long: 0, archive: 0 };
  for (const { rel } of allMemoryFiles()) {
    if (rel.includes('archive')) layers.archive++;
    else if (rel.startsWith('memory/index')) layers.index++;
    else if (rel.startsWith('memory/short')) layers.short++;
    else if (rel.startsWith('memory/medium')) layers.medium++;
    else layers.long++;
  }

  let totalSize = 0;
  for (const { full } of allMemoryFiles()) {
    try { totalSize += fs.statSync(full).size; } catch {}
  }

  const todos = loadTodos();
  out({
    turns: s.turns, totalMessages: s.totalMessages,
    daily, archivedDays, importance: impBuckets,
    topKeywords: topKw, layers, totalSizeBytes: totalSize,
    todosOpen: todos.filter(t => t.status === 'open').length,
  });
}

function cmdHealth() {
  ensureDirs();
  const issues = [];
  const s = loadState();

  const idxText = fs.readFileSync(INDEX_FILE, 'utf8');
  for (const f of fs.readdirSync(D.medium)) {
    if (f.endsWith('.md') && !idxText.includes(f)) {
      issues.push({ severity: 'warn', msg: `摘要块 ${f} 缺少索引条目` });
    }
  }

  const longText = fs.readFileSync(LONG_FILE, 'utf8');
  if (longText.includes('（待填充）')) {
    issues.push({ severity: 'info', msg: '长期记忆 MEMORY.md 仍为初始模板' });
  }

  if (!s.enabled) issues.push({ severity: 'warn', msg: '引擎已暂停自动记录' });

  // Hook 健康检查：如果引擎启用但超过 2h 无新消息，hook 可能已失效
  if (s.enabled && s.lastMessageAt) {
    const sinceLastRecord = Date.now() - new Date(s.lastMessageAt).getTime();
    if (sinceLastRecord > 7200000) {
      issues.push({ severity: 'warn', msg: `超过 ${Math.round(sinceLastRecord / 3600000)}h 无新记录，hook 可能已失效` });
    }
  }

  const shortFiles = fs.readdirSync(D.short).filter(f => f.endsWith('.jsonl'));
  if (!shortFiles.length) issues.push({ severity: 'info', msg: '短期记忆目录为空' });

  const medDates = fs.readdirSync(D.medium).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
  for (const d of shortFiles.map(f => f.replace('.jsonl', ''))) {
    if (!medDates.includes(d) && d < today()) {
      issues.push({ severity: 'info', msg: `${d} 有对话但无摘要块` });
    }
  }

  // 语义索引检查
  const vec = loadVectors();
  if (!vec.items.length) {
    issues.push({ severity: 'warn', msg: '语义索引为空 — 运行 embed --force 构建' });
  } else if (vec.remoteFailed) {
    issues.push({ severity: 'warn', msg: '远端 embedding 最近失败，语义搜索使用本地回退' });
  }
  // 索引新鲜度：超过 24h 未更新（有对话活动时）
  if (vec.updatedAt && shortFiles.length > 0) {
    const vecAge = Date.now() - new Date(vec.updatedAt).getTime();
    if (vecAge > 86400000) {
      issues.push({ severity: 'info', msg: '语义索引超过 24h 未更新，运行 embed 刷新' });
    }
  }

  // 待办质量检查
  const todos = loadTodos();
  const noiseTodos = todos.filter(t => t.status === 'open' && isTodoNoise(t.text));
  if (noiseTodos.length > 0) {
    issues.push({ severity: 'warn', msg: `${noiseTodos.length} 个待办疑似噪音（${noiseTodos.map(t => '#'+t.id).join(', ')}），建议清理` });
  }
  if (todos.filter(t => t.status === 'open').length > 15) {
    issues.push({ severity: 'info', msg: '待办超过 15 条，建议清理过期条目' });
  }

  // 索引 devlog 膨胀检查
  const devlogStart = idxText.indexOf('<!-- devlog:start -->');
  const devlogEnd = idxText.indexOf('<!-- devlog:end -->');
  if (devlogStart > 0 && devlogEnd > devlogStart) {
    const devlogLines = idxText.slice(devlogStart, devlogEnd).split('\n').filter(l => l.trim().startsWith('| 20'));
    if (devlogLines.length > 25) {
      issues.push({ severity: 'info', msg: `索引 devlog 已 ${devlogLines.length} 条，运行 cleanup --confirm 自动压缩` });
    }
  }

  if (!fs.existsSync(path.join(ROOT, '.git'))) issues.push({ severity: 'info', msg: '工作区无 git 仓库，运行 backup 初始化备份' });

  const score = Math.max(0, 100 - issues.filter(i => i.severity === 'warn').length * 20 - issues.filter(i => i.severity === 'info').length * 5);
  out({ score, issues, checkedAt: nowIso() });
}

function cmdSave(filePath, text) {
  if (!filePath) return out({ error: '用法: engine.js save --file "path" --text "content"' });
  const full = path.resolve(ROOT, filePath);
  if (!full.startsWith(ROOT)) return out({ error: '路径不安全：必须在工作区内' });
  if (!fs.existsSync(full)) return out({ error: '文件不存在: ' + filePath });
  fs.writeFileSync(full, text);
  // 如果是 MEMORY.md，自动版本快照
  const isMemoryMd = path.resolve(full) === path.resolve(LONG_FILE);
  let version = null;
  if (isMemoryMd) {
    version = snapshotMEMORY(true);
    buildContentIndex(); // 同时刷新结构化索引
  }
  out({ saved: true, file: filePath, size: text.length, version: version ? version.version : null });
}

function cmdExport() {
  ensureDirs();
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outFile = path.join(ROOT, `memory-export-${ts}.tar.gz`);
  execFile('tar', ['-czf', outFile, '-C', MEM, '.'], (err) => {
    if (err) return out({ error: String(err.message) });
    out({ exported: true, file: outFile, size: fs.statSync(outFile).size });
  });
}

function cmdTimeline() {
  ensureDirs();
  const dates = new Set();
  for (const f of fs.readdirSync(D.short)) { if (f.endsWith('.jsonl')) dates.add(f.replace('.jsonl', '')); }
  for (const f of fs.readdirSync(D.medium)) { if (f.endsWith('.md')) dates.add(f.replace('.md', '')); }

  const timeline = [...dates].sort().reverse().map(date => {
    const shortFile = path.join(D.short, date + '.jsonl');
    const medFile = path.join(D.medium, date + '.md');

    let msgCount = 0;
    if (fs.existsSync(shortFile)) {
      for (const l of fs.readFileSync(shortFile, 'utf8').split('\n')) { if (l.trim()) msgCount++; }
    }

    let titles = [];
    if (fs.existsSync(medFile)) {
      titles = (fs.readFileSync(medFile, 'utf8').match(/^## .+$/gm) || [])
        .map(t => t.replace(/^## \d{2}:\d{2}\s*/, ''));
    }

    return { date, messages: msgCount, summaries: titles.length, titles };
  });

  out({ total: timeline.length, timeline });
}

// ============================================================
// CLI 入口
// ============================================================

const HELP = `Mnemosyne v3-lite — OpenClaw 精简记忆引擎

用法: engine.js <command> [options]

基础命令:
  record    --role <user|assistant> --text "内容"   记录消息
  status                                            引擎状态
  enable / disable                                  启用/暂停自动记录
  init                                              初始化目录结构

同步与整合:
  sync     [--quick]                                全量/快速同步
  consolidate [--check | --force]                   自动整合

搜索:
  search   --query "关键词" [--mode keyword|semantic|hybrid|recent|history]  多模式搜索

记忆管理:
  todos    [--add "内容" | --done <id>]             待办清单
  embed    [--force]                                构建语义向量索引
  reindex                                           扫描中期摘要补齐索引

运维:
  health                                            健康度检查
  stats                                             统计仪表盘
  cleanup  [--dry] [--confirm]                      清理无用文件

查询模式:
  --mode keyword   → 关键词精确+模糊匹配（默认）
  --mode semantic  → 语义向量搜索（需先 embed）
  --mode hybrid    → 关键词 + 语义融合排序
  --mode recent    → 偏重短期记忆权重
  --mode history   → 偏重长期记忆权重
`;

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      const key = rest[i].slice(2);
      // 布尔开关型参数（--force / --msg 后跟值）
      opts[key] = (rest[i + 1] !== undefined && !rest[i + 1].startsWith('--')) ? rest[++i] : true;
    }
  }
  const has = (k) => Object.prototype.hasOwnProperty.call(opts, k);

  switch (cmd) {
    case 'record':   cmdRecord(opts.role || 'user', opts.text || ''); break;
    case 'status':   cmdStatus(); break;
    case 'enable':   { let s=loadState(); s.enabled=true; saveState(s); out({enabled:true}); } break;
    case 'disable':  { let s=loadState(); s.enabled=false; saveState(s); out({enabled:false}); } break;
    case 'init':     cmdInit(); break;
    case 'sync':     cmdSync(opts); break;
    case 'reindex':  cmdReindex(); break;
    case 'consolidate': out(autoConsolidate({ force: has('force'), check: has('check') })); break;
    case 'search':   cmdSearch(opts.query, opts).catch(e => { console.error(e.message); process.exit(1); }); break;
    case 'stats':    cmdStats(); break;
    case 'health':   cmdHealth(); break;
    case 'embed':    cmdEmbed(opts).catch(e => { console.error(e.message); process.exit(1); }); break;
    case 'todos':    cmdTodos(opts); break;
    case 'cleanup':   cmdCleanup(opts); break;
    default:         console.error('未知命令: ' + cmd + '\\n' + HELP); process.exit(1);
  }
}

main();
