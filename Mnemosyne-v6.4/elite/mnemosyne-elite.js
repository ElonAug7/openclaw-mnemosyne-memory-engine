#!/usr/bin/env node
'use strict';

/**
 * Mnemosyne Elite — 增强型记忆引擎 CLI
 *
 * engine.js 保持零改动。Elite 通过子进程调用 engine.js，
 * 在外面做：
 *   1. 跨平台路径适配（MSYS/MinGW/WSL）
 *   2. 环境变量抽象（MNEMOSYNE_ROOT / HERMES_WORKSPACE）
 *   3. 命令增强（stats+、platform-info、bridge 模式等）
 *   4. 输出格式优化（Agent 友好 JSON）
 *
 * 用法:
 *   node mnemosyne-elite.js <command> [options]
 *   node mnemosyne-elite.js bridge [--mode hermes]  ← Hermes 桥接模式
 *
 * 兼容 engine.js 全部 22 条命令，外加 elite 扩展。
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ENGINE_DIR = path.resolve(__dirname, '..');
const ENGINE_PATH = path.join(ENGINE_DIR, 'engine.js');
const platform = require('./platform');

const VERSION = 'v6.0.0';

// ============================================================
// 引擎调用
// ============================================================

function callEngine(args, opts = {}) {
  const { root, env } = platform.buildEngineEnv();
  const mergedEnv = { ...env, ...(opts.env || {}) };

  const result = spawnSync(process.execPath, [ENGINE_PATH, ...args], {
    env: mergedEnv,
    cwd: opts.cwd || root,
    encoding: 'utf8',
    timeout: opts.timeout || 30000,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  return {
    ok: result.status === 0,
    code: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    signal: result.signal,
    root,
  };
}

function callEngineJSON(args, opts = {}) {
  const r = callEngine(args, opts);
  if (r.ok && r.stdout) {
    try { r.json = JSON.parse(r.stdout); } catch { r.json = null; }
  }
  return r;
}

// ============================================================
// Elite 扩展命令
// ============================================================

function cmdPlatformInfo() {
  const diag = platform.diagnostic();
  const engineStatus = callEngineJSON(['status']);
  console.log(JSON.stringify({
    elite: VERSION,
    platform: diag,
    engine: engineStatus.json || { error: engineStatus.stderr },
  }, null, 2));
}

function cmdDiag() {
  const diag = platform.diagnostic();
  const lines = [
    `🧠 Mnemosyne Elite ${VERSION}`,
    ``,
    `OS:       ${diag.platform} (${diag.arch})`,
    `Node:     ${diag.nodeVersion}`,
    `MSYS:     ${diag.msys ? '✅ active — 路径自动转换启用' : '—'}`,
    `WSL:      ${diag.wsl ? '✅ active' : '—'}`,
    `Home:     ${diag.homedir}`,
    ``,
    `📁 记忆根目录:`,
    `   原始值:  ${diag.root.raw}`,
    `   解析后:  ${diag.root.resolved}`,
    `   存在:    ${diag.root.validation.exists ? '✅' : '❌'}`,
    `   可写:    ${diag.root.validation.writable ? '✅' : '❌'}`,
  ];
  if (diag.root.validation.error) {
    lines.push(`   错误:    ${diag.root.validation.error}`);
  }
  lines.push(``);
  lines.push(`🔧 环境变量:`);
  lines.push(`   MNEMOSYNE_ROOT:     ${diag.envVars.MNEMOSYNE_ROOT}`);
  lines.push(`   HERMES_WORKSPACE:    ${diag.envVars.HERMES_WORKSPACE}`);
  lines.push(`   OPENCLAW_WORKSPACE:  ${diag.envVars.OPENCLAW_WORKSPACE}`);
  console.log(lines.join('\n'));
}

function cmdStatsPlus() {
  const stats = callEngineJSON(['stats']);
  const status = callEngineJSON(['status']);
  const health = callEngineJSON(['health']);

  const result = {
    elite: VERSION,
    platform: platform.diagnostic().platform,
    stats: stats.json || null,
    status: status.json || null,
    health: health.json || null,
    _engineErrors: [
      stats.stderr || null,
      status.stderr || null,
      health.stderr || null,
    ].filter(Boolean),
  };

  console.log(JSON.stringify(result, null, 2));
}

function cmdInitPlus() {
  const { root } = platform.buildEngineEnv();
  const validation = platform.validatePath(root, 'MNEMOSYNE_ROOT');

  if (!validation.writable) {
    console.log(JSON.stringify({
      ok: false,
      error: `无法写入 ${validation.normalized}: ${validation.error || '未知错误'}`,
      platform: process.platform,
      msys: platform.IS_MSYS,
      suggestion: platform.IS_MSYS
        ? 'MSYS 路径映射可能失败。尝试: set MNEMOSYNE_ROOT=C:\\Users\\你的用户名\\.mnemosyne'
        : '检查目录权限',
    }));
    process.exit(1);
  }

  const r = callEngineJSON(['init']);
  console.log(JSON.stringify({
    ok: r.ok,
    root: validation.normalized,
    msys: platform.IS_MSYS,
    engine: r.json || r.stdout || r.stderr,
  }));
}

function cmdSelfCheck() {
  const diag = platform.diagnostic();
  const checks = [];

  // 路径可写性
  checks.push({
    name: '路径可写',
    pass: diag.root.validation.writable,
    detail: diag.root.validation.writable ? diag.root.resolved : (diag.root.validation.error || '不可写'),
  });

  // engine.js 存在
  const engineExists = fs.existsSync(ENGINE_PATH);
  checks.push({ name: 'engine.js', pass: engineExists, detail: engineExists ? ENGINE_PATH : '文件不存在' });

  // 引擎可运行
  const status = callEngineJSON(['status']);
  checks.push({ name: '引擎状态', pass: status.ok, detail: status.ok ? status.json : status.stderr });

  // 目录结构
  const { root } = platform.buildEngineEnv();
  const memDir = path.join(root, 'memory');
  checks.push({ name: 'memory/ 目录', pass: fs.existsSync(memDir), detail: memDir });

  const allPass = checks.every(c => c.pass);
  console.log(JSON.stringify({
    elite: VERSION,
    platform: process.platform,
    msys: platform.IS_MSYS,
    root: diag.root.resolved,
    checks,
    allPass,
    ready: allPass ? '✅ Mnemosyne Elite 就绪' : '❌ 存在问题，运行 diag 查看详情',
  }, null, 2));

  process.exit(allPass ? 0 : 1);
}

// ============================================================
// 帮助
// ============================================================

const HELP = `🧠 Mnemosyne Elite ${VERSION} — 跨平台记忆引擎增强版

适配平台: Windows (MSYS/MinGW/WSL) · macOS · Linux
兼容平台: OpenClaw · Hermes · 任意 Node.js 环境

环境变量:
  MNEMOSYNE_ROOT      Elite 推荐（自动兼容 OPENCLAW_WORKSPACE）
  HERMES_WORKSPACE     Hermes 平台专用
  OPENCLAW_WORKSPACE   OpenClaw 平台（向后兼容）

用法: mnemosyne-elite.js <command> [options]

═══ Elite 专用命令 ═══
  platform-info       平台完整诊断 + 引擎状态（JSON 输出）
  diag                人可读的诊断报告
  stats+              聚合统计（status + stats + health 三合一）
  init+               安全初始化（含路径验证，Windows 友好）
  self-check          自检：路径 + 引擎 + 目录 + 权限
  bridge <options>    Hermes 桥接模式（见 hermes-bridge.js）

═══ engine.js 透传命令（全部 22 条） ═══
  record    --role <user|assistant> --text "内容" [--tags tag1,tag2]
  status                                            引擎状态
  enable / disable                                  启用/暂停
  init                                              初始化目录
  sync                                              转录补录 + 索引补全
  reindex                                           重建索引
  consolidate [--check | --force]                   自动整合
  search    --query "关键词" [--mode keyword|semantic|hybrid] [--profile]
  stats / health / context / recall / report / profile
  embed / todos / cleanup / qa / distill-proposals
  tags / rate / recalibrate / profile-debug

  完整帮助: mnemosyne-elite.js help

═══ 快速开始 ═══
  export MNEMOSYNE_ROOT=~/hermes-memory    # 设置记忆目录
  node mnemosyne-elite.js init+             # 安全初始化
  node mnemosyne-elite.js self-check        # 验证就绪
  node mnemosyne-elite.js bridge --mode hermes --record --text "你好" --role user
`;

// ============================================================
// 主入口
// ============================================================

function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  // Elite 扩展命令
  switch (cmd) {
    case 'platform-info':
    case 'platform':      return cmdPlatformInfo();
    case 'diag':          return cmdDiag();
    case 'stats+':        return cmdStatsPlus();
    case 'init+':         return cmdInitPlus();
    case 'self-check':    return cmdSelfCheck();
    case 'help':
    case '--help':
    case '-h':            console.log(HELP); return;

    // Hermes 桥接模式
    case 'bridge': {
      const bridgePath = path.join(__dirname, 'hermes-bridge.js');
      if (!fs.existsSync(bridgePath)) {
        console.error('hermes-bridge.js 未找到');
        process.exit(1);
      }
      // 透传所有参数给 bridge
      const bridgeArgs = rest;
      const { env } = platform.buildEngineEnv();
      const result = spawnSync(process.execPath, [bridgePath, ...bridgeArgs], {
        env,
        encoding: 'utf8',
        stdio: 'inherit',
        timeout: 60000,
        windowsHide: true,
      });
      process.exit(result.status || 0);
      return;
    }

    // 透传给 engine.js（全部原有命令）
    default: {
      if (!cmd) {
        // 无参数 → 显示状态
        return cmdPlatformInfo();
      }

      const { env } = platform.buildEngineEnv();
      const result = spawnSync(process.execPath, [ENGINE_PATH, cmd, ...rest], {
        env,
        encoding: 'utf8',
        stdio: 'inherit',
        timeout: 60000,
        windowsHide: true,
      });

      if (result.error) {
        console.error(`[elite] 引擎调用失败: ${result.error.message}`);
        process.exit(1);
      }
      process.exit(result.status || 0);
    }
  }
}

main();
