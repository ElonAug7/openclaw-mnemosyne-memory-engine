'use strict';

/**
 * Mnemosyne Elite — 跨平台路径适配器
 *
 * 解决 Hermes/Windows 下 MSYS/MinGW/WSL 路径映射问题。
 * 确保无论从哪个 shell 启动，路径都能正确解析为操作系统原生格式。
 *
 * 零依赖，引擎独立。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ============================================================
// OS 检测
// ============================================================

const IS_WINDOWS = process.platform === 'win32';
const IS_MACOS = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';

// MSYS/MinGW 检测（Windows 上的类 Unix shell）
const IS_MSYS = IS_WINDOWS && (
  (process.env.MSYSTEM && process.env.MSYSTEM !== '') ||
  (process.env.SHELL && process.env.SHELL.includes('bash') && process.env.MINGW_PREFIX) ||
  (process.env.TERM_PROGRAM === 'mintty')
);

// WSL 检测
const IS_WSL = IS_LINUX && (
  fs.existsSync('/proc/sys/fs/binfmt_misc/WSLInterop') ||
  (process.env.WSL_DISTRO_NAME !== undefined)
);

// ============================================================
// 路径解析
// ============================================================

/**
 * MSYS/MinGW 路径 → Windows 原生路径
 *
 * MSYS 风格:  /c/Users/xxx  →  C:\Users\xxx
 *               /e/mn/hermes  →  E:\mn\hermes
 *
 * 注意: 纯 Unix 路径如 /home/user 在 MSYS 下也应被翻译
 *       MSYS 自动映射 / → $MSYS_ROOT/
 */
function msysToWindows(msysPath) {
  if (!msysPath || typeof msysPath !== 'string') return msysPath;

  // 已经是 Windows 风格
  if (/^[A-Za-z]:[\\/]/.test(msysPath)) {
    return msysPath.replace(/\//g, '\\');
  }

  // /c/... 风格 → C:\...
  const match = msysPath.match(/^\/([A-Za-z])(\/|$)/);
  if (match) {
    const drive = match[1].toUpperCase();
    const rest = msysPath.slice(match[0].length - (match[2] === '/' ? 1 : 0));
    return `${drive}:\\${rest.replace(/\//g, '\\')}`;
  }

  // 尝试用 cygpath 翻译（如果有的话）
  try {
    const { execFileSync } = require('child_process');
    const result = execFileSync('cygpath', ['-w', msysPath], {
      encoding: 'utf8', timeout: 1000, windowsHide: true,
    });
    return result.trim();
  } catch {
    // cygpath 不可用，尝试 MSYS 环境变量
    const msysRoot = process.env.MSYS_ROOT || process.env.MINGW_PREFIX || '';
    if (msysRoot && msysPath.startsWith('/')) {
      const nativeMsys = msysToWindows(msysRoot);
      if (nativeMsys.match(/^[A-Za-z]:\\/)) {
        return nativeMsys + msysPath.slice(1).replace(/\//g, '\\');
      }
    }
  }

  // 回退：保持原样，让 Windows Node 自己处理
  return msysPath.replace(/\//g, '\\');
}

/**
 * Windows 路径 → MSYS/MinGW 风格
 * C:\Users\xxx → /c/Users/xxx
 */
function windowsToMsys(winPath) {
  if (!winPath || typeof winPath !== 'string') return winPath;
  const match = winPath.match(/^([A-Za-z]):[\\/](.*)$/);
  if (match) {
    return `/${match[1].toLowerCase()}/${match[2].replace(/\\/g, '/')}`;
  }
  return winPath.replace(/\\/g, '/');
}

/**
 * 统一路径标准化：无论输入什么格式，输出操作系统原生路径
 */
function normalize(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') return inputPath;

  // 展开 ~
  if (inputPath.startsWith('~/')) {
    inputPath = path.join(os.homedir(), inputPath.slice(2));
  }

  if (IS_MSYS) {
    // 在 MSYS shell 中运行时，路径可能是 Unix 风格
    // 需要转换为 Windows 原生路径，Node.js 才能正确写文件
    return msysToWindows(inputPath);
  }

  return path.resolve(inputPath);
}

/**
 * 验证路径是否可写：尝试创建目录并写入临时文件
 */
function validatePath(dirPath, label) {
  const native = normalize(dirPath);
  const result = {
    input: dirPath,
    normalized: native,
    exists: false,
    writable: false,
    label: label || '',
    os: process.platform,
    msys: IS_MSYS,
    wsl: IS_WSL,
  };

  try {
    result.exists = fs.existsSync(native);
    if (!result.exists) {
      // 尝试创建
      fs.mkdirSync(native, { recursive: true });
      result.created = true;
    }
    const testFile = path.join(native, '.mnemosyne-test-' + Date.now());
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    result.writable = true;
  } catch (e) {
    result.error = e.message;
  }

  return result;
}

// ============================================================
// 环境变量解析
// ============================================================

/**
 * 解析记忆根目录
 *
 * 优先级:
 *   1. MNEMOSYNE_ROOT  (Elite 专用，跨平台友好)
 *   2. HERMES_WORKSPACE (Hermes 平台)
 *   3. OPENCLAW_WORKSPACE (OpenClaw 平台，向后兼容)
 *   4. ~/.mnemosyne     (默认)
 */
function resolveRoot() {
  const raw = process.env.MNEMOSYNE_ROOT
    || process.env.HERMES_WORKSPACE
    || process.env.OPENCLAW_WORKSPACE
    || path.join(os.homedir(), '.mnemosyne');

  return normalize(raw);
}

/**
 * 设置引擎所需的环境变量（向后兼容 engine.js 的 OPENCLAW_WORKSPACE）
 */
function buildEngineEnv() {
  const root = resolveRoot();
  const env = { ...process.env };

  // 始终注入 OPENCLAW_WORKSPACE（engine.js 的硬依赖）
  env.OPENCLAW_WORKSPACE = root;

  // 同时设置新变量供 Elite 使用
  env.MNEMOSYNE_ROOT = root;

  return { root, env };
}

// ============================================================
// 路径自检报告
// ============================================================

function diagnostic() {
  const root = resolveRoot();
  const validation = validatePath(root, 'MNEMOSYNE_ROOT');

  return {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    msys: IS_MSYS,
    wsl: IS_WSL,
    msysPkgPrefix: process.env.MSYSTEM || process.env.MINGW_PREFIX || null,
    shell: process.env.SHELL || (IS_WINDOWS ? process.env.COMSPEC : null),
    homedir: os.homedir(),
    root: {
      raw: process.env.MNEMOSYNE_ROOT || process.env.HERMES_WORKSPACE || process.env.OPENCLAW_WORKSPACE || '(default)',
      resolved: root,
      validation,
    },
    envVars: {
      MNEMOSYNE_ROOT: process.env.MNEMOSYNE_ROOT || '(not set)',
      HERMES_WORKSPACE: process.env.HERMES_WORKSPACE || '(not set)',
      OPENCLAW_WORKSPACE: process.env.OPENCLAW_WORKSPACE || '(not set)',
    },
  };
}

module.exports = {
  IS_WINDOWS,
  IS_MACOS,
  IS_LINUX,
  IS_MSYS,
  IS_WSL,
  msysToWindows,
  windowsToMsys,
  normalize,
  validatePath,
  resolveRoot,
  buildEngineEnv,
  diagnostic,
};
