#!/usr/bin/env node
/**
 * memory-ui — 记忆系统本地管理界面 v3
 *
 * 纯 Node.js（无第三方依赖），监听 127.0.0.1:8765（仅本机访问）。
 * 功能：
 *   - 浏览所有记忆文件（Markdown 渲染 / JSONL 对话气泡视图 / 原文切换）
 *   - 文件搜索、返回键、下载原文
 *   - 引擎状态、一键开关自动记录、手动触发摘要信号
 *
 * v3 安全加固：
 *   - 写操作（delete/restore/purge/backup/enable 等）强制 POST
 *   - CSRF 保护：POST 请求校验 Origin/Referer
 *   - /api/delete 复用 safePath() 白名单
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile, execFileSync } = require('child_process');

const ROOT = process.env.OPENCLAW_WORKSPACE || path.join(require('os').homedir(), '.openclaw', 'workspace');
const ENGINE = path.join(ROOT, 'tools', 'memory-engine', 'engine.js');
const PORT = parseInt(process.env.MEMORY_UI_PORT || '8765', 10);
const HOST = '127.0.0.1';   // 只监听本机，安全
const TRASH_DIR = path.join(ROOT, 'memory', '.trash');

// 简易 token 鉴权：启动时生成随机 8 位 token，无 token 拒绝访问
// 仅当外部访问（非 127.0.0.1 / ::1 / localhost）时生效
const crypto = require('crypto');
const UI_TOKEN = process.env.MEMORY_UI_TOKEN || crypto.randomBytes(4).toString('hex');

function checkAuth(req) {
  // 本机访问免检
  const remote = req.socket.remoteAddress || '';
  if (remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1') return true;
  // 外部访问：URL 参数或 Cookie 中必须有正确 token
  const url = new URL(req.url, 'http://localhost');
  const tokenParam = url.searchParams.get('token');
  const cookieHeader = req.headers.cookie || '';
  const tokenCookie = cookieHeader.split(';').find(c => c.trim().startsWith('mnemosyne_token='));
  const tokenVal = tokenCookie ? tokenCookie.split('=')[1]?.trim() : null;
  return tokenParam === UI_TOKEN || tokenVal === UI_TOKEN;
}

// 允许浏览的路径（白名单，防目录穿越）
const ALLOWED = [
  path.join(ROOT, 'memory'),
  path.join(ROOT, 'MEMORY.md'),
  path.join(ROOT, 'MEMORY-PROTOCOL.md'),
];

// 文件分类标签（四层记忆 + 系统内部）
// 引擎/版本/日志 → 归入「系统」，默认隐藏；回收站也默认隐藏
// 用户可点开关查看
function layerOf(p) {
  if (p.startsWith('memory/short/working/')) return 'Workbench';
  if (p.startsWith('memory/short/inject/')) return 'Daily';
  if (p.startsWith('memory/short/raw/')) return 'Chat Logs';
  if (p.startsWith('memory/index/')) return 'Index';
  if (p.startsWith('memory/medium/')) return 'Medium';
  if (p.startsWith('memory/long/') || p === 'MEMORY.md') return 'Long-term';
  if (p === 'memory/todos.md') return 'Todos';
  if (/^memory\/\d{4}-\d{2}-\d{2}\.md$/.test(p)) return 'Daily';
  if (p.startsWith('memory/engine/')) return '__system';
  if (p.includes('.trash')) return '__trash';
  if (p.startsWith('memory/') && /^memory\/[^/]+\.(md|json)$/.test(p)) return 'Other';
  return '__system';
}

function safePath(p) {
  if (!p) return false;
  const full = path.resolve(ROOT, p);
  return ALLOWED.some((a) => {
    const norm = path.normalize(a);
    if (full === norm) return true;
    try {
      return fs.statSync(norm).isDirectory() && full.startsWith(norm + path.sep);
    } catch { return false; }
  });
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(md|jsonl|json)$/.test(e.name)) out.push(full);
  }
  return out;
}

function listFiles() {
  const files = [];
  for (const a of ALLOWED) {
    try {
      const st = fs.statSync(a);
      if (st.isDirectory()) walk(a, files);
      else files.push(a);
    } catch { /* 不存在则跳过 */ }
  }
  return [...new Set(files)]
    .map((f) => {
      const st = fs.statSync(f);
      const rel = path.relative(ROOT, f);
      return { path: rel, layer: layerOf(rel), size: st.size, mtime: st.mtimeMs };
    })
    .sort((x, y) => y.mtime - x.mtime);
}

function readLimited(full, limit = 512 * 1024) {
  const st = fs.statSync(full);
  const text = st.size > limit
    ? fs.readFileSync(full, 'utf8').slice(0, limit) + '\n…[文件较大，已截断]'
    : fs.readFileSync(full, 'utf8');
  return { text: sanitizeHTML(text), size: st.size, mtime: st.mtimeMs };
}

function fmtAge(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 60) return min + '分钟';
  const h = Math.floor(min / 60);
  if (h < 24) return h + '小时';
  return Math.floor(h / 24) + '天';
}

function runEngine(args) {
  return new Promise((resolve) => {
    execFile('node', [path.join(__dirname, 'engine.js'), ...args], { timeout: 10000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: stdout.trim(), err: (stderr || '').trim() });
    });
  });
}

// POST body 解析（JSON + URL-encoded）
function parseBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try { return resolve(JSON.parse(raw)); } catch {}
      const params = new URLSearchParams(raw);
      const obj = {};
      for (const [k, v] of params) obj[k] = v;
      resolve(obj);
    });
    req.on('error', () => resolve({}));
  });
}

// CSRF 保护：校验 Origin/Referer 仅允许本地来源
function checkCSRF(req) {
  const origin = req.headers.origin || req.headers.referer || '';
  if (!origin) return true; // 无 Origin 的请求放行（curl/脚本调用）
  // 只允许本地来源
  try {
    const u = new URL(origin);
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]';
  } catch { return false; }
}

// 便捷：POST 端点包装器
// fn(body, req) 返回响应对象或 null（null=不响应，由外层处理）
async function handlePost(req, res, fn) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: 'Method not allowed — 请使用 POST' }));
  }
  if (!checkCSRF(req)) {
    res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: 'CSRF check failed — 来源不被允许' }));
  }
  try {
    const body = await parseBody(req);
    await fn(body, req);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
}

// P2: Markdown 安全渲染 — 过滤 HTML/XSS
function sanitizeHTML(text) {
  return String(text || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' [脚本已过滤] ')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' [框架已过滤] ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' [样式已过滤] ')
    .replace(/<link[^>]*>/gi, ' [链接已过滤] ')
    .replace(/javascript\s*:/gi, 'javascript: [已禁用] ')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]*/gi, '')
    .replace(/<img[^>]+onerror[^>]*>/gi, ' [图片已过滤] ')
    .replace(/file:\/\//gi, ' [文件链接已过滤] ')
    .replace(/data:text\/html/gi, ' [HTML数据已过滤] ');
}

const PAGE = fs.readFileSync(path.join(__dirname, 'ui-page.html'), 'utf8');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  const json = (o) => { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(o)); };

  // 鉴权: 外部访问需 token
  if (!checkAuth(req)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Access denied. Use ?token=<token> or set MEMORY_UI_TOKEN env var.');
  }

  try {
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(PAGE);
    }

    // ═══════ GET（只读）═══════
    if (url.pathname === '/api/status') {
      const r = await runEngine(['status']);
      return json(r.ok ? JSON.parse(r.out) : { error: r.err });
    }
    if (url.pathname === '/api/files') return json(listFiles());
    if (url.pathname === '/api/file') {
      const p = url.searchParams.get('p') || '';
      if (!safePath(p)) { res.writeHead(403); return res.end('forbidden'); }
      return json(readLimited(path.resolve(ROOT, p)));
    }
    if (url.pathname === '/api/download') {
      const p = url.searchParams.get('p') || '';
      if (!safePath(p)) { res.writeHead(403); return res.end('forbidden'); }
      const full = path.resolve(ROOT, p);
      const data = fs.readFileSync(full);
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename="${encodeURIComponent(path.basename(full))}"`,
        'content-length': data.length,
      });
      return res.end(data);
    }
    if (url.pathname === '/api/search') {
      const q = url.searchParams.get('q') || '';
      const mode = url.searchParams.get('mode') || 'keyword';
      const r = await runEngine(['search', '--query', q, '--mode', mode]);
      return json(r.ok ? JSON.parse(r.out) : { error: r.err });
    }
    if (url.pathname === '/api/todos') {
      const r = await runEngine(['todos']);
      return json(r.ok ? JSON.parse(r.out) : { error: r.err });
    }
    if (url.pathname === '/api/backup-log') {
      const r = await runEngine(['backup-log']);
      return json(r.ok ? JSON.parse(r.out) : { error: r.err });
    }
    if (url.pathname === '/api/version-history') {
      const r = await runEngine(['version-history']);
      return json(r.ok ? JSON.parse(r.out) : { error: r.err });
    }
    if (url.pathname === '/api/version-diff') {
      const v1 = url.searchParams.get('v1') || '';
      const v2 = url.searchParams.get('v2') || '';
      const args = ['version-diff'];
      if (v1) args.push('--v1', v1);
      if (v2) args.push('--v2', v2);
      const r = await runEngine(args);
      return json(r.ok ? JSON.parse(r.out) : { error: r.err });
    }
    if (url.pathname === '/api/conflict') {
      const r = await runEngine(['conflict']);
      return json(r.ok ? JSON.parse(r.out) : { error: r.err });
    }
    if (url.pathname === '/api/sessions') {
      const r = await runEngine(['sessions']);
      return json(r.ok ? JSON.parse(r.out) : { error: r.err });
    }
    if (url.pathname === '/api/permission') {
      const r = await runEngine(['permission']);
      return json(r.ok ? JSON.parse(r.out) : { error: r.err });
    }
    if (url.pathname === '/api/cleanup-suggestions') {
      const suggestions = [];
      const now = Date.now();
      const DAY = 86400000;

      // 调试日志 > 1 天 或 > 10KB（但排除 1 小时内修改的活跃日志）
      const engineDir = path.join(ROOT, 'memory', 'engine');
      if (fs.existsSync(engineDir)) {
        for (const f of fs.readdirSync(engineDir)) {
          if (!f.endsWith('.log')) continue;
          const fp = path.join(engineDir, f);
          try {
            const st = fs.statSync(fp);
            const age = now - st.mtimeMs;
            if (age < 3600000) continue; // 活跃日志不清理
            if (age > DAY || st.size > 10240) suggestions.push({
              file: 'memory/engine/' + f, size: st.size, age: fmtAge(age),
              reason: `调试日志 (${(st.size/1024).toFixed(1)}KB)`, safe: true
            });
          } catch {}
        }
      }

      // inject 文件 > 3 天
      const injectDir = path.join(ROOT, 'memory', 'short', 'inject');
      if (fs.existsSync(injectDir)) {
        for (const f of fs.readdirSync(injectDir)) {
          if (!f.endsWith('.json')) continue;
          const m = f.match(/^(\d{4}-\d{2}-\d{2})/);
          if (!m) continue;
          const d = new Date(m[1] + 'T00:00:00').getTime();
          if (now - d > 3 * DAY) {
            const fp = path.join(injectDir, f);
            const st = fs.statSync(fp);
            suggestions.push({
              file: 'memory/short/inject/' + f, size: st.size, age: fmtAge(now - st.mtimeMs),
              reason: '过期摘要 (>3天)', safe: true
            });
          }
        }
      }

      // embeddings.json > 1 天可重建
      const embFile = path.join(engineDir, 'embeddings.json');
      try {
        if (fs.existsSync(embFile)) {
          const st = fs.statSync(embFile);
          if (now - st.mtimeMs > DAY) suggestions.push({
            file: 'memory/engine/embeddings.json', size: st.size, age: fmtAge(now - st.mtimeMs),
            reason: `语义索引可重建 (${(st.size/1024).toFixed(1)}KB)`, safe: true
          });
        }
      } catch {}

      // 被拒绝的 distill proposals > 3 天
      const dpFile = path.join(engineDir, 'distill-proposals.json');
      try {
        if (fs.existsSync(dpFile)) {
          const dp = JSON.parse(fs.readFileSync(dpFile, 'utf8'));
          const old = dp.proposals.filter(p => p.status === 'rejected' && now - new Date(p.created_at).getTime() > 3 * DAY);
          if (old.length) suggestions.push({
            file: 'memory/engine/distill-proposals.json', size: old.length, age: '-',
            reason: `${old.length} 条旧提案可清理`, safe: false
          });
        }
      } catch {}

      // 空的 archive 目录
      for (const sub of ['short', 'medium']) {
        const archiveDir = path.join(ROOT, 'memory', sub, 'archive');
        try {
          if (fs.existsSync(archiveDir) && !fs.readdirSync(archiveDir).length) {
            suggestions.push({
              file: 'memory/' + sub + '/archive', size: 0, age: '-',
              reason: '空归档目录', safe: true
            });
          }
        } catch {}
      }

      // 回收站中的文件（提示可彻底删除）
      const trashDir = path.join(ROOT, 'memory', '.trash');
      if (fs.existsSync(trashDir)) {
        for (const f of fs.readdirSync(trashDir)) {
          if (f.endsWith('.meta')) continue;
          const fp = path.join(trashDir, f);
          try {
            const st = fs.statSync(fp);
            const metaFile = fp + '.meta';
            let deletedAt = null;
            try { deletedAt = JSON.parse(fs.readFileSync(metaFile, 'utf8')).deletedAt; } catch {}
            const age = deletedAt ? Math.floor((now - new Date(deletedAt).getTime()) / DAY) : 0;
            if (age >= 10) {
              suggestions.push({
                file: '.trash/' + f, size: st.size, age: age + '天',
                reason: '回收站即将到期', safe: false, trashId: f
              });
            }
          } catch {}
        }
      }

      suggestions.sort((a, b) => (b.size || 0) - (a.size || 0));
      return json({ suggestions, total: suggestions.length, freedEstimate: suggestions.reduce((s, i) => s + (i.size || 0), 0) });
    }

    // ═══════ P2+P3 GET APIs ═══════
    if (url.pathname === '/api/stats') {
      try {
        const stdout = execFileSync(process.execPath, [ENGINE, 'stats'], { encoding: 'utf8', timeout: 5000, cwd: ROOT });
        return json(JSON.parse(stdout));
      } catch (e) { return json({ error: e.message, daily: {} }); }
    }
    if (url.pathname === '/api/versions') {
      const verDir = path.join(ROOT, 'memory', 'versions');
      const vers = [];
      if (fs.existsSync(verDir)) {
        for (const f of fs.readdirSync(verDir).sort().reverse().slice(0, 20)) {
          if (!f.endsWith('.json')) continue;
          try {
            const d = JSON.parse(fs.readFileSync(path.join(verDir, f), 'utf8'));
            vers.push({ id: d.id, ts: d.ts, size: d.size, sections: (d.sections || []).length });
          } catch {}
        }
      }
      return json({ versions: vers });
    }
    if (url.pathname === '/api/version') {
      const id = url.searchParams.get('id') || '';
      if (!id) return json({ error: '需要 id 参数' });
      const verFile = path.join(ROOT, 'memory', 'versions', id + '.json');
      if (!fs.existsSync(verFile)) return json({ error: '版本不存在' });
      try {
        const d = JSON.parse(fs.readFileSync(verFile, 'utf8'));
        return json({ id: d.id, ts: d.ts, content: d.content || '' });
      } catch (e) { return json({ error: e.message }); }
    }

    // ═══════ POST（写操作 — CSRF 保护）═══════
    if (url.pathname === '/api/enable') {
      return handlePost(req, res, async () => {
        await runEngine(['enable']);
        json({ enabled: true });
      });
    }
    if (url.pathname === '/api/disable') {
      return handlePost(req, res, async () => {
        await runEngine(['disable']);
        json({ enabled: false });
      });
    }
    if (url.pathname === '/api/record-raw-on' || url.pathname === '/api/enable-raw') {
      return handlePost(req, res, async () => {
        await runEngine(['record-raw', '--enable']);
        json({ recordRaw: true });
      });
    }
    if (url.pathname === '/api/record-raw-off' || url.pathname === '/api/disable-raw') {
      return handlePost(req, res, async () => {
        await runEngine(['record-raw', '--disable']);
        json({ recordRaw: false });
      });
    }
    if (url.pathname === '/api/signal') {
      return handlePost(req, res, async () => {
        const r = await runEngine(['signal']);
        json(r);
      });
    }
    if (url.pathname === '/api/todos/add') {
      return handlePost(req, res, async (body) => {
        const text = body.text || '';
        const r = await runEngine(['todos', '--add', text]);
        json(r.ok ? JSON.parse(r.out) : { error: r.err });
      });
    }
    if (url.pathname === '/api/todos/done') {
      return handlePost(req, res, async (body) => {
        const id = body.id || '';
        const r = await runEngine(['todos', '--done', id]);
        json(r.ok ? JSON.parse(r.out) : { error: r.err });
      });
    }
    if (url.pathname === '/api/backup') {
      return handlePost(req, res, async (body) => {
        const msg = body.msg || '';
        const args = ['backup'];
        if (msg) args.push('--msg', msg);
        const r = await runEngine(args);
        json(r.ok ? JSON.parse(r.out) : { error: r.err });
      });
    }
    if (url.pathname === '/api/version') {
      return handlePost(req, res, async () => {
        const r = await runEngine(['version', '--force']);
        json(r.ok ? JSON.parse(r.out) : { error: r.err });
      });
    }
    if (url.pathname === '/api/embed') {
      return handlePost(req, res, async (body) => {
        const force = body.force ? '--force' : null;
        const args = ['embed'];
        if (force) args.push(force);
        const r = await runEngine(args);
        json(r.ok ? JSON.parse(r.out) : { error: r.err });
      });
    }
    if (url.pathname === '/api/content-index') {
      return handlePost(req, res, async () => {
        const r = await runEngine(['content-index']);
        json(r.ok ? JSON.parse(r.out) : { error: r.err });
      });
    }

    // ═══════ 回收站（写操作 — POST）═══════
    if (url.pathname === '/api/delete') {
      return handlePost(req, res, async (body) => {
        const p = body.p || '';
        const full = path.resolve(ROOT, p);
        if (!safePath(p) || !fs.existsSync(full)) return json({ deleted: false, error: '路径不安全或不存在' });
        const banned = ['MEMORY.md', 'MEMORY-PROTOCOL.md', 'state.json', 'index.md'];
        if (banned.includes(path.basename(full))) return json({ deleted: false, error: '核心文件不允许删除' });
        // 目录：仅允许删除空目录
        if (fs.statSync(full).isDirectory()) {
          try {
            if (fs.readdirSync(full).length > 0) return json({ deleted: false, error: '目录非空，不允许删除' });
            fs.rmdirSync(full);
            return json({ trashed: true, file: p, trashId: 'dir_' + Date.now().toString(36), note: '空目录已删除' });
          } catch (e) {
            return json({ trashed: false, error: e.message });
          }
        }
        try {
          fs.mkdirSync(TRASH_DIR, { recursive: true });
          const id = Date.now().toString(36) + '_' + path.basename(full);
          const meta = { original: p, deletedAt: new Date().toISOString(), size: fs.statSync(full).size };
          const trashFile = path.join(TRASH_DIR, id);
          fs.renameSync(full, trashFile);
          fs.writeFileSync(trashFile + '.meta', JSON.stringify(meta));
          return json({ trashed: true, file: p, trashId: id, note: '已移入回收站，15天后自动清除' });
        } catch (e) {
          return json({ trashed: false, error: e.message });
        }
      });
    }
    if (url.pathname === '/api/trash') {
      fs.mkdirSync(TRASH_DIR, { recursive: true });
      const items = [];
      for (const f of fs.readdirSync(TRASH_DIR)) {
        if (f.endsWith('.meta')) continue;
        const metaFile = path.join(TRASH_DIR, f + '.meta');
        let meta = {};
        try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch {}
        items.push({ trashId: f, original: meta.original || '?', deletedAt: meta.deletedAt, size: meta.size });
      }
      items.sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
      return json({ items });
    }
    if (url.pathname === '/api/trash/restore') {
      return handlePost(req, res, async (body) => {
        const id = body.id || '';
        const trashFile = path.join(TRASH_DIR, id);
        const metaFile = trashFile + '.meta';
        if (!fs.existsSync(trashFile)) return json({ restored: false, error: '文件不存在' });
        try {
          const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
          const original = path.resolve(ROOT, meta.original);
          // 安全检查：待恢复路径必须在白名单内
          if (!safePath(meta.original)) return json({ restored: false, error: '恢复路径不安全' });
          fs.mkdirSync(path.dirname(original), { recursive: true });
          fs.renameSync(trashFile, original);
          fs.unlinkSync(metaFile);
          return json({ restored: true, to: meta.original });
        } catch (e) {
          return json({ restored: false, error: e.message });
        }
      });
    }
    if (url.pathname === '/api/trash/purge') {
      return handlePost(req, res, async (body) => {
        const id = body.id || '';
        if (!id) return json({ purged: false, error: '需要 id 参数' });
        const trashFile = path.join(TRASH_DIR, id);
        const metaFile = trashFile + '.meta';
        if (!fs.existsSync(trashFile)) return json({ purged: false, error: '文件不存在' });
        try {
          fs.unlinkSync(trashFile);
          if (fs.existsSync(metaFile)) fs.unlinkSync(metaFile);
          return json({ purged: true, id });
        } catch (e) {
          return json({ purged: false, error: e.message });
        }
      });
    }

    // ═══════ 静态资源 ═══════
    if (url.pathname === '/api/logo') {
      const logoPaths = [
        path.join(__dirname, 'logo.png'),
        path.join(__dirname, 'logo.jpg'),
        path.join(__dirname, 'logo.jpeg'),
        path.join(__dirname, 'logo.webp'),
        path.join(__dirname, 'logo.gif'),
        path.join(__dirname, 'logo.svg'),
      ];
      for (const lp of logoPaths) {
        if (fs.existsSync(lp)) {
          const ext = path.extname(lp).slice(1);
          const mime = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', gif:'image/gif', svg:'image/svg+xml' }[ext] || 'image/png';
          const data = fs.readFileSync(lp);
          res.writeHead(200, { 'content-type': mime, 'content-length': data.length, 'cache-control': 'public, max-age=86400' });
          return res.end(data);
        }
      }
      res.writeHead(404); return res.end('no logo');
    }
    // --- end v5 APIs ---
    res.writeHead(404); res.end('not found');
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Mnemosyne v6 UI http://${HOST}:${PORT} (workspace: ${ROOT})`);
  if (UI_TOKEN) console.log(`  Token: ${UI_TOKEN}  (export MEMORY_UI_TOKEN=${UI_TOKEN} to fix)`);
});
