# 🧠 Mnemosyne Elite v6

> 跨平台分层记忆引擎增强版 — 适配 Windows · macOS · Linux · OpenClaw · Hermes

---

## 一句话

**不改 engine.js 一行代码**，在外面解决了 MSYS 路径映射、环境变量抽象、Hermes 桥接三大问题。

---

## 架构

```
tools/memory-engine/
├── engine.js              ← 一行不改，v6.0.0 核心引擎
├── elite/                 ← Elite 增强层
│   ├── platform.js        ← 跨平台路径适配器
│   ├── mnemosyne-elite.js ← Elite CLI（engine.js 包装器）
│   ├── hermes-bridge.js   ← Hermes 专用简化接口
│   ├── hermes-skill.md    ← Hermes Agent Skill 定义
│   ├── install-elite.sh   ← 一键安装（Win/Mac/Linux）
│   └── README.md          ← 本文档
```

---

## Elite 相对 engine.js 增加了什么

| 特性 | engine.js | Elite |
|------|-----------|-------|
| 环境变量 | `OPENCLAW_WORKSPACE` only | `MNEMOSYNE_ROOT` / `HERMES_WORKSPACE` / 兼容旧名 |
| MSYS/MinGW 路径 | ❌ 静默失败 | ✅ 自动映射 `/c/` → `C:\` |
| WSL 检测 | — | ✅ 自动识别 |
| Hermes 桥接 | — | ✅ `pre-reply` / `post-reply` 一键式 |
| 路径自检 | — | ✅ `self-check` 诊断 |
| 聚合统计 | 分开调用 | ✅ `stats+` 三合一 |
| 初始化安全性 | 基本 | ✅ 路径验证 + MSYS 兜底建议 |
| Agent 友好输出 | 人可读 | ✅ JSON 优先 + `bridge` 模式 |

---

## 安装（三选一）

### 选项 A: 一键安装（推荐）

```bash
cd tools/memory-engine/elite
bash install-elite.sh

# Hermes 用户（自动装 Skill）:
bash install-elite.sh --hermes

# Hermes 用户 + 指定 skill 目录:
bash install-elite.sh --hermes --skill-dir /path/to/hermes/skills

# 自定义记忆目录:
bash install-elite.sh --root /d/my-agent-memory

# 不要 Web UI:
bash install-elite.sh --no-ui

# 只要引擎，不要 Skill:
bash install-elite.sh --no-skill
```

### 选项 B: 手动设置

```bash
# 设置环境变量
export MNEMOSYNE_ROOT=~/.mnemosyne

# 初始化
node tools/memory-engine/elite/mnemosyne-elite.js init+

# 验证
node tools/memory-engine/elite/mnemosyne-elite.js self-check
```

### 选项 C: 仅用 engine.js（向后兼容）

```bash
export OPENCLAW_WORKSPACE=~/.openclaw/workspace
node tools/memory-engine/engine.js status
# ↑ 完全不受 Elite 影响
```

---

## 使用

### Elite CLI（增强版 engine.js）

```bash
# 完整诊断
node tools/memory-engine/elite/mnemosyne-elite.js diag

# 自检
node tools/memory-engine/elite/mnemosyne-elite.js self-check

# 聚合统计
node tools/memory-engine/elite/mnemosyne-elite.js stats+

# engine.js 全部命令也可用
node tools/memory-engine/elite/mnemosyne-elite.js search --query "关键词"
node tools/memory-engine/elite/mnemosyne-elite.js status
node tools/memory-engine/elite/mnemosyne-elite.js recall --query "关键词"
```

### Hermes Bridge（Agent 专用）

```bash
# 回复前
node tools/memory-engine/elite/hermes-bridge.js pre-reply --query "用户消息"

# 回复后
node tools/memory-engine/elite/hermes-bridge.js post-reply --user "用户消息" --assistant "我的回复"

# 定时维护
node tools/memory-engine/elite/hermes-bridge.js sync
```

### 快捷命令（安装后）

```bash
mnemosyne diag       # Elite CLI
mneme pre-reply      # Hermes Bridge
```

---

## 平台注意事项

### Windows + Git Bash (MSYS)

- ✅ 自动路径转换：`/e/memory` → `E:\memory`
- ✅ 环境变量用 Unix 风格设置即可
- ⚠️ 确保 Node.js 在 PATH 中

### Windows + PowerShell

```powershell
$env:MNEMOSYNE_ROOT = "C:\Users\用户名\.mnemosyne"
node tools\memory-engine\elite\mnemosyne-elite.js self-check
```

### macOS / Linux

直接跑 install-elite.sh，自动处理 systemd/launchd。

---

## engine.js 改动清单

**零行。** 所有适配通过子进程环境变量 + spawnSync 实现。

engine.js 第 168 行读取 `OPENCLAW_WORKSPACE` → Elite 在 spawn 时自动注入。

---

## 测试

```bash
# 完整自检
node tools/memory-engine/elite/mnemosyne-elite.js self-check

# 路径诊断
node tools/memory-engine/elite/mnemosyne-elite.js diag
```

---

## 版本

- `v6.0.0` — 初始发布
- 兼容 engine.js v6.0.0
