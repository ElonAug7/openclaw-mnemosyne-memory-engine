#!/usr/bin/env node
/**
 * memory-ui — 记忆系统本地管理界面 v2
 *
 * 纯 Node.js（无第三方依赖），监听 127.0.0.1:8765（仅本机访问）。
 * 功能：
 *   - 浏览所有记忆文件（Markdown 渲染 / JSONL 对话气泡视图 / 原文切换）
 *   - 文件搜索、返回键、下载原文
 *   - 引擎状态、一键开关自动记录、手动触发摘要信号
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = process.env.OPENCLAW_WORKSPACE || path.join(require('os').homedir(), '.openclaw', 'workspace');
const PORT = parseInt(process.env.MEMORY_UI_PORT || '8765', 10);
const HOST = '127.0.0.1';   // 只监听本机，安全

// 允许浏览的路径（白名单，防目录穿越）
const ALLOWED = [
  path.join(ROOT, 'memory'),
  path.join(ROOT, 'MEMORY.md'),
  path.join(ROOT, 'MEMORY-PROTOCOL.md'),
];

// 文件分类标签（四层记忆）
// 短期层范围宽一些：原始对话流 + 每日流水日志都算短期记忆；
// 引擎内部文件、协议文档等非记忆数据归为「无用」。
function layerOf(p) {
  if (p.startsWith('memory/index/')) return '索引';
  if (p.startsWith('memory/short/') || /^memory\/\d{4}-\d{2}-\d{2}\.md$/.test(p)) return '短期';
  if (p.startsWith('memory/medium/')) return '中期';
  if (p.startsWith('memory/long/') || p === 'MEMORY.md') return '长期';
  return '无用';
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

function runEngine(args) {
  return new Promise((resolve) => {
    execFile('node', [path.join(__dirname, 'engine.js'), ...args], { timeout: 10000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: stdout.trim(), err: (stderr || '').trim() });
    });
  });
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

  try {
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(PAGE);
    }
    if (url.pathname === '/api/status') {
      const r = await runEngine(['status']);
      return json(r.ok ? JSON.parse(r.out) : { error: r.err });
    }
    if (url.pathname === '/api/enable') { await runEngine(['enable']); return json({ enabled: true }); }
    if (url.pathname === '/api/disable') { await runEngine(['disable']); return json({ enabled: false }); }
    if (url.pathname === '/api/signal') { const r = await runEngine(['signal']); return json(r); }
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
    // --- v5 新 API ---
    if (url.pathname === '/api/search') {
      const q = url.searchParams.get('q') || '';
      const mode = url.searchParams.get('mode') || 'keyword';
      const r = await runEngine(['search', '--query', q, '--mode', mode]);
      return json(r.ok ? JSON.parse(r.out) : { error: r.err });
    }
    if (url.pathname === '/api/embed') {
      const force = url.searchParams.get('force');
      const args = ['embed'];
      if (force !== null) args.push('--force');
      const r = await runEngine(args);
      return json(r.ok ? JSON.parse(r.out) : { error: r.err });
    }
    if (url.pathname === '/api/todos') {
      const r = await runEngine(['todos']);
      return json(r.ok ? JSON.parse(r.out) : { error: r.err });
    }
    if (url.pathname === '/api/todos/add') {
      const text = url.searchParams.get('text') || '';
      const r = await runEngine(['todos', '--add', text]);
      return json(r.ok ? JSON.parse(r.out) : { error: r.err });
    }
    if (url.pathname === '/api/todos/done') {
      const id = url.searchParams.get('id') || '';
      const r = await runEngine(['todos', '--done', id]);
      return json(r.ok ? JSON.parse(r.out) : { error: r.err });
    }
    if (url.pathname === '/api/backup') {
      const msg = url.searchParams.get('msg');
      const args = ['backup'];
      if (msg) args.push('--msg', msg);
      const r = await runEngine(args);
      return json(r.ok ? JSON.parse(r.out) : { error: r.err });
    }
    if (url.pathname === '/api/backup-log') {
      const r = await runEngine(['backup-log']);
      return json(r.ok ? JSON.parse(r.out) : { error: r.err });
    }
    if (url.pathname === '/api/version') {
      const r = await runEngine(['version', '--force']);
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
    if (url.pathname === '/api/content-index') {
      const r = await runEngine(['content-index']);
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

    // --- 回收站系统 ---
    const TRASH_DIR = path.join(ROOT, 'memory', '.trash');

    if (url.pathname === '/api/delete') {
      const p = url.searchParams.get('p') || '';
      const full = path.resolve(ROOT, p);
      const safe = ALLOWED.some(a => {
        const norm = path.normalize(a);
        if (full === norm) return true;
        try { return fs.statSync(norm).isDirectory() && full.startsWith(norm + path.sep); } catch { return false; }
      });
      if (!safe || !fs.existsSync(full)) return json({ deleted: false, error: '路径不安全或不存在' });
      const banned = ['MEMORY.md', 'MEMORY-PROTOCOL.md', 'state.json', 'index.md'];
      if (banned.includes(path.basename(full))) return json({ deleted: false, error: '核心文件不允许删除' });
      if (fs.statSync(full).isDirectory()) return json({ deleted: false, error: '不支持删除目录' });
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
      const id = url.searchParams.get('id') || '';
      const trashFile = path.join(TRASH_DIR, id);
      const metaFile = trashFile + '.meta';
      if (!fs.existsSync(trashFile)) return json({ restored: false, error: '文件不存在' });
      try {
        const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
        const original = path.resolve(ROOT, meta.original);
        fs.mkdirSync(path.dirname(original), { recursive: true });
        fs.renameSync(trashFile, original);
        fs.unlinkSync(metaFile);
        return json({ restored: true, to: meta.original });
      } catch (e) {
        return json({ restored: false, error: e.message });
      }
    }
    if (url.pathname === '/api/trash/purge') {
      const id = url.searchParams.get('id') || '';
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
    }
    // --- P2 custom logo ---
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
  console.log(`Mnemosyne UI listening on http://${HOST}:${PORT} (workspace: ${ROOT})`);
});
