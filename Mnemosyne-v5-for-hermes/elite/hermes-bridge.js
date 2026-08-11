#!/usr/bin/env node
'use strict';

/**
 * Mnemosyne Elite — Hermes Bridge
 *
 * Hermes Agent 专用的精简调用接口。
 * Hermes 没有 Gateway hook，Agent 通过 exec 工具主动调用此桥接层。
 *
 * 设计哲学:
 *   - 每条命令一个 JSON 输出，Agent 可直接解析
 *   - 不依赖 OpenClaw 基础设施
 *   - 自动处理 Windows 路径
 *
 * 用法（Hermes Agent exec 调用）:
 *
 *   # 记录消息
 *   node hermes-bridge.js record --role user --text "用户说了什么"
 *   node hermes-bridge.js record --role assistant --text "我回复了什么"
 *
 *   # 回复前：搜索记忆
 *   node hermes-bridge.js recall --query "关键词"
 *   node hermes-bridge.js context
 *   node hermes-bridge.js pre-reply --query "用户最新消息"
 *
 *   # 回复后：记录
 *   node hermes-bridge.js post-reply --user "用户消息" --assistant "我的回复"
 *
 *   # 维护
 *   node hermes-bridge.js sync
 *   node hermes-bridge.js consolidate
 *   node hermes-bridge.js status
 *   node hermes-bridge.js search --query "关键词"
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ENGINE_PATH = path.resolve(__dirname, '..', 'engine.js');
const platform = require('./platform');
const VERSION = 'v5.1.0-elite';

// ============================================================
// 引擎调用
// ============================================================

function eng(args, opts = {}) {
  const { env } = platform.buildEngineEnv();
  const result = spawnSync(process.execPath, [ENGINE_PATH, ...args], {
    env: { ...env, ...(opts.env || {}) },
    encoding: 'utf8',
    timeout: opts.timeout || 30000,
    windowsHide: true,
  });

  let json = null;
  if (result.stdout) {
    try { json = JSON.parse(result.stdout.trim()); } catch {}
  }

  return {
    ok: result.status === 0,
    code: result.status,
    json,
    text: (result.stdout || '').trim(),
    err: (result.stderr || '').trim(),
    signal: result.signal,
  };
}

function out(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

// ============================================================
// 核心命令
// ============================================================

function bridgeRecord(opts) {
  const role = opts.role || 'user';
  const text = opts.text || '';
  if (!text) { out({ ok: false, error: '缺少 --text' }); process.exit(1); }

  const args = ['record', '--role', role, '--text', text];
  if (opts.tags) args.push('--tags', opts.tags);

  // 始终加 --tags hermes 标记平台
  if (!opts.tags || !opts.tags.includes('hermes')) {
    args.push('--tags', opts.tags ? `hermes,${opts.tags}` : 'hermes');
  }

  const r = eng(args);
  out({ ok: r.ok, action: 'record', role, textLen: text.length, engine: r.json || r.text, error: r.err || null });
}

function bridgeRecall(opts) {
  const query = opts.query || '';
  if (!query) { out({ ok: false, error: '缺少 --query' }); process.exit(1); }

  const args = ['recall', '--query', query];
  if (opts.days) args.push('--days', opts.days);
  if (opts.mode) args.push('--mode', opts.mode);

  const r = eng(args, { timeout: 30000 });
  out({
    ok: r.ok,
    action: 'recall',
    query,
    flashbacks: (r.json && r.json.flashbacks) ? r.json.flashbacks : [],
    results: (r.json && r.json.results) ? r.json.results.slice(0, 5) : [],
    engine: r.json,
    error: r.err || null,
  });
}

function bridgeContext() {
  const r = eng(['context'], { timeout: 15000 });
  out({
    ok: r.ok,
    action: 'context',
    todos: (r.json && r.json.todos) ? r.json.todos : [],
    questions: (r.json && r.json.questions) ? r.json.questions : [],
    decisions: (r.json && r.json.decisions) ? r.json.decisions : [],
    recentTopics: (r.json && r.json.recentTopics) ? r.json.recentTopics : [],
    engine: r.json,
    error: r.err || null,
  });
}

function bridgeSearch(opts) {
  const query = opts.query || '';
  if (!query) { out({ ok: false, error: '缺少 --query' }); process.exit(1); }

  const args = ['search', '--query', query, '--mode', opts.mode || 'keyword'];
  if (opts.limit) args.push('--limit', opts.limit);

  const r = eng(args, { timeout: 30000 });
  out({
    ok: r.ok,
    action: 'search',
    query,
    mode: opts.mode || 'keyword',
    results: (r.json && r.json.results) ? r.json.results.slice(0, 10) : [],
    total: (r.json && r.json.total) || 0,
    error: r.err || null,
  });
}

function bridgePreReply(opts) {
  // 回复前一体化：recall + context 合并
  const query = opts.query || '';
  if (!query) { out({ ok: false, error: '缺少 --query（当前用户消息）' }); process.exit(1); }

  const recallR = eng(['recall', '--query', query], { timeout: 30000 });
  const ctxR = eng(['context'], { timeout: 15000 });

  const flashbacks = (recallR.json && recallR.json.flashbacks) ? recallR.json.flashbacks : [];
  const todos = (ctxR.json && ctxR.json.todos) ? ctxR.json.todos : [];
  const questions = (ctxR.json && ctxR.json.questions) ? ctxR.json.questions : [];

  // 生成记忆注入文本（Agent 可直接插入系统提示）
  const memoryInjection = buildMemoryInjection(flashbacks, todos, questions);

  out({
    ok: recallR.ok && ctxR.ok,
    action: 'pre-reply',
    query,
    flashbacks,
    todos,
    questions,
    memoryInjection,
    _meta: {
      recallOk: recallR.ok,
      contextOk: ctxR.ok,
    },
  });
}

function bridgePostReply(opts) {
  // 回复后一体化：同时记录用户消息和 assistant 回复
  const userText = opts.user || '';
  const assistantText = opts.assistant || '';
  const results = [];

  if (userText) {
    const r = eng(['record', '--role', 'user', '--text', userText, '--tags', 'hermes']);
    results.push({ role: 'user', ok: r.ok, engine: r.json || r.text });
  }
  if (assistantText) {
    const r = eng(['record', '--role', 'assistant', '--text', assistantText, '--tags', 'hermes']);
    results.push({ role: 'assistant', ok: r.ok, engine: r.json || r.text });
  }

  out({
    ok: results.every(r => r.ok),
    action: 'post-reply',
    recorded: results.length,
    results,
  });
}

function bridgeSync() {
  const r = eng(['sync', '--quick'], { timeout: 60000 });
  out({ ok: r.ok, action: 'sync', engine: r.json || r.text, error: r.err || null });
}

function bridgeConsolidate(opts) {
  const args = ['consolidate'];
  if (opts.check) args.push('--check');
  if (opts.force) args.push('--force');
  const r = eng(args);
  out({ ok: r.ok, action: 'consolidate', engine: r.json || r.text, error: r.err || null });
}

function bridgeStatus() {
  const r = eng(['status']);
  out({ ok: r.ok, action: 'status', engine: r.json, error: r.err || null });
}

function bridgeTodos(opts) {
  const args = ['todos'];
  if (opts.add) args.push('--add', opts.add);
  if (opts.done) args.push('--done', opts.done);
  const r = eng(args);
  out({ ok: r.ok, action: 'todos', engine: r.json, error: r.err || null });
}

function bridgeHealth() {
  const r = eng(['health']);
  out({ ok: r.ok, action: 'health', engine: r.json, error: r.err || null });
}

function bridgeQuickCheck(opts) {
  // 极速预检：只搜 keyword，只检查是否有命中，不返回全文
  const query = opts.query || '';
  if (!query) { out({ ok: false, error: '缺少 --query' }); process.exit(1); }

  // 用 search 的 keyword 模式做轻量快速检查
  const r = eng(['search', '--query', query, '--mode', 'keyword'], { timeout: 10000 });
  const total = (r.json && r.json.total) || 0;
  const hasHistory = total > 0;
  out({
    ok: r.ok,
    action: 'quick-check',
    query,
    hasHistory,
    total,
    topScore: (r.json && r.json.results && r.json.results[0]) ? (r.json.results[0]._score || r.json.results[0].score || null) : null,
    tip: hasHistory ? `🟡 有 ${total} 条相关历史，建议立即执行 recall` : '🟢 无历史，可跳过 recall',
  });
}

// ============================================================
// v5.1-elite: 透明注入模式 — Agent 直接捕获 stdout 贴到 system prompt
// ============================================================

function bridgeInject(opts) {
  // 一体化透明注入：Agent 直接 capture stdout 贴到 system prompt 前
  // 不需要解析 JSON，不需要手动拼接
  const query = opts.query || '';
  if (!query) { console.error('缺少 --query（当前用户消息）'); process.exit(1); }

  const recallR = eng(['recall', '--query', query], { timeout: 30000 });
  const ctxR = eng(['context'], { timeout: 15000 });

  const flashbacks = (recallR.json && recallR.json.flashbacks) ? recallR.json.flashbacks : [];
  const todos = (ctxR.json && ctxR.json.todos) ? ctxR.json.todos : [];
  const questions = (ctxR.json && ctxR.json.questions) ? ctxR.json.questions : [];
  const decisions = (ctxR.json && ctxR.json.decisions) ? ctxR.json.decisions : [];
  const recentTopics = (ctxR.json && ctxR.json.recentTopics) ? ctxR.json.recentTopics : [];

  const lines = [];

  // 头部 — 告诉 Agent 这是什么
  lines.push('[Mnemosyne Memory Context — 以下是本次对话相关的历史记忆]');
  lines.push('');

  if (flashbacks.length > 0) {
    lines.push('## 📌 相关历史（引用时请注明来源）');
    flashbacks.forEach((f, i) => {
      const src = f.source ? ` [${f.source}]` : '';
      const relevance = f.relevance ? ` (相关度: ${Math.round(f.relevance * 100)}%)` : '';
      lines.push(`${i + 1}. ${f.text || ''}${src}${relevance}`);
    });
    lines.push('');
  }

  if (recentTopics.length > 0) {
    lines.push('## 🔄 最近话题');
    recentTopics.forEach(t => lines.push(`- ${t}`));
    lines.push('');
  }

  if (decisions.length > 0) {
    lines.push('## ✅ 近期决策');
    decisions.forEach(d => lines.push(`- ${d}`));
    lines.push('');
  }

  if (todos.length > 0) {
    lines.push('## 📋 待办事项');
    todos.forEach(t => {
      lines.push(`- [${t.done ? 'x' : ' '}] ${t.text || t}${t.urgent ? ' ⚠️ 紧急' : ''}`);
    });
    lines.push('');
  }

  if (questions.length > 0) {
    lines.push('## ❓ 待确认问题');
    questions.forEach(q => lines.push(`- ${q}`));
    lines.push('');
  }

  if (flashbacks.length === 0 && todos.length === 0) {
    lines.push('（本次查询无相关历史记忆）');
    lines.push('');
  }

  // 尾部 — 使用指引
  lines.push('---');
  lines.push('[使用规则]');
  lines.push('1. 以上记忆已按相关性排序，优先参考排名靠前的');
  lines.push('2. 引用来历史决策/偏好时，请注明来源（如"根据之前的记录…"）');
  lines.push('3. 如果记忆中的信息与用户当前说法冲突，以用户当前说法为准');
  lines.push('4. 如果记忆中有待办事项，请在回复中主动提及');

  // 纯文本输出，Agent 直接 capture stdout
  console.log(lines.join('\n'));
}

function buildMemoryInjection(flashbacks, todos, questions) {
  const parts = [];

  if (flashbacks.length) {
    parts.push('## 📌 相关历史记忆');
    flashbacks.forEach((f, i) => {
      const src = f.source || '';
      parts.push(`${i + 1}. ${f.text || ''}${src ? ` (来源: ${src})` : ''}`);
    });
  }

  if (todos.length) {
    parts.push('\n## 📋 待办事项');
    todos.forEach(t => {
      parts.push(`- [${t.done ? 'x' : ' '}] ${t.text || t}`);
    });
  }

  if (questions.length) {
    parts.push('\n## ❓ 待确认问题');
    questions.forEach(q => parts.push(`- ${q}`));
  }

  if (parts.length === 0) {
    parts.push('（无相关记忆）');
  }

  return parts.join('\n');
}

// ============================================================
// CLI
// ============================================================

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      const key = rest[i].slice(2);
      opts[key] = (rest[i + 1] !== undefined && !rest[i + 1].startsWith('--')) ? rest[++i] : true;
    }
  }

  switch (cmd) {
    case 'record':       return bridgeRecord(opts);
    case 'recall':       return bridgeRecall(opts);
    case 'context':      return bridgeContext();
    case 'search':       return bridgeSearch(opts);
    case 'pre-reply':
      // 支持 --format inject → 输出纯文本而非 JSON
      if (opts.format === 'inject' || opts.format === 'text') {
        return bridgeInject(opts);
      }
      return bridgePreReply(opts);
    case 'inject':       return bridgeInject(opts);  // 纯文本注入模式（推荐）
    case 'post-reply':   return bridgePostReply(opts);
    case 'sync':         return bridgeSync();
    case 'consolidate':  return bridgeConsolidate(opts);
    case 'status':       return bridgeStatus();
    case 'todos':        return bridgeTodos(opts);
    case 'health':       return bridgeHealth();
    case 'quick-check':  return bridgeQuickCheck(opts);

    // 直达引擎（高级）
    case 'raw': {
      const r = eng(rest);
      out({ ok: r.ok, raw: r.json || r.text, err: r.err });
      break;
    }

    case 'help':
    case '--help':
    case '-h':
    default: {
      console.log(`🧠 Mnemosyne Elite Bridge ${VERSION} — Hermes 专用接口

命令:
  inject      --query "用户消息"    ← 🆕 透明注入模式（推荐，输出纯文本直接贴 system prompt）
  record       --role <user|assistant> --text "内容" [--tags tag1,tag2]
  recall       --query "关键词" [--days 14] [--mode keyword|semantic|hybrid]
  context      获取会话上下文（待办+问题+话题）
  search       --query "关键词" [--mode keyword] [--limit 10]
  pre-reply    --query "用户消息" [--format inject]  ← 回复前（JSON 或纯文本模式）
  post-reply   --user "消息" --assistant "回复"  ← 回复后一体化
  quick-check  --query "用户消息"    ← ⚡ 极速预检（有历史？yes/no）
  sync         补录转录 + 索引补全
  consolidate  [--check | --force]   自动整合
  status       引擎状态
  todos        [--add "内容" | --done id]
  health       健康检查
  raw          直达 engine.js（高级）

Hermes Agent 强制协议（推荐 inject 模式）:

  # 🆕 回复前 — 透明注入（Agent 直接 capture stdout 贴到 system prompt）
  node hermes-bridge.js inject --query "用户消息"

  # 上述命令输出纯文本，Agent 无需解析 JSON：
  #   [Mnemosyne Memory Context — 以下是本次对话相关的历史记忆]
  #   ## 📌 相关历史
  #   1. 用户之前决定使用 React... [MEMORY.md]
  #   ## 📋 待办事项
  #   - [ ] 完成 API 文档
  #   ---
  #   [使用规则]
  #   1. 以上记忆已按相关性排序...

  # 回复后 — 必须执行
  node hermes-bridge.js post-reply --user "用户消息" --assistant "完整回复"`);
      process.exit(cmd ? 1 : 0);
    }
  }
}

main();
