# 🧠 Mnemosyne v6 — Hermes/OpenClaw 版快速上手

> 一个命令，一分钟，永久记忆。

---

## 你需要什么

- Node.js v18+（[下载](https://nodejs.org)）
- 5 秒时间

## 安装

```bash
# 1. 进入引擎目录
cd Mnemosyne-v6

# 2. 一键安装
bash elite/install-elite.sh --hermes --skill-dir <你的-Hermes-skills-目录>
```

如果你的 Hermes skill 目录在默认位置，甚至可以更简单：

```bash
bash elite/install-elite.sh --hermes
```

安装脚本会自动检测 Hermes skill 目录。

## 安装了什么

| 内容 | 说明 |
|------|------|
| 🧠 记忆引擎 | 四层分层记忆（短期→中期→长期），自动评分+合并+提炼 |
| 🌐 Web UI | `http://127.0.0.1:8765` 可视化浏览/编辑记忆 |
| 📋 Hermes Skill | 自动安装到 Hermes skills 目录，重启 Agent 生效 |
| ⚡ 快捷命令 | `mnemosyne diag` / `mneme inject` |

## 已知限制

| 限制 | 说明 | 影响 |
|------|------|------|
| 单条消息上限 | **800 字符**。超过部分截断，以 `…` 标记 | 日常聊天够用；贴文章/长文档只会保留前 800 字 |
| 代码块不存原文 | 压缩为 `[代码块: lang]` 标注 | 记得"讨论过代码"，但想不起具体内容 |
| 表格不存原文 | 压缩为 `[表格: N行]` 标注 | 同上 |
| 大 JSON 不存原文 | 压缩为 `[JSON: keys]` 标注 | 同上 |
| 不是文档库 | 定位是"记住事件和决策"，不是全文检索 | 长文档应存文件系统 |

> 💡 这是有意设计：引擎保持轻量（<500KB）、搜索快（~20ms），不做全文存档。长内容请用文件系统或专用文档工具。

## 验证

```bash
# 自检（4 项全绿 = 成功）
node elite/mnemosyne-elite.js self-check

# 查看诊断
node elite/mnemosyne-elite.js diag
```

## Hermes Agent 怎么用

Skill 安装后，Agent 会在每次对话前后调用 Mnemosyne：

```
收到消息 → inject（查历史，~90ms）→ 贴到 context → 生成回复 → post-reply（记录）
```

`inject` 命令输出纯文本，Agent 直接 capture stdout 贴到 system prompt，不需要解析 JSON。

如果你用别的平台（OpenClaw / 独立 Node.js）：

```bash
# 记录消息
node elite/mnemosyne-elite.js record --role user --text "内容"

# 搜索记忆
node elite/mnemosyne-elite.js search --query "关键词"

# 回复前查历史
node elite/mnemosyne-elite.js recall --query "关键词"
```

## 平台支持

| 平台 | 状态 | 注意 |
|------|:--:|------|
| Windows (Git Bash/MSYS) | ✅ | 自动路径映射 `/c/`→`C:\` |
| Windows (PowerShell/CMD) | ✅ | 设 `$env:MNEMOSYNE_ROOT` |
| macOS | ✅ | launchd 开机自启 |
| Linux | ✅ | systemd 开机自启 |
| WSL | ✅ | 自动检测 |
| Hermes | ✅ | Skill 自动安装 |
| OpenClaw | ✅ | 用原版 `install.sh` |
| 独立 Node.js | ✅ | 设 `MNEMOSYNE_ROOT` 即可 |

## 故障排查

```bash
# 引擎不工作？
node elite/mnemosyne-elite.js diag     # 完整诊断

# Web UI 打不开？
# 检查端口: lsof -i :8765
# 手动启动: MEMORY_UI_PORT=8765 node ui.js &

# 文件不知道写哪了？（Windows MSYS）
echo $MNEMOSYNE_ROOT                    # 确认路径
node elite/mnemosyne-elite.js diag     # 看解析后的实际路径
```

## 目录结构

```
Mnemosyne-v6/
├── elite/                  ← Hermes 增强层（入口）
│   ├── install-elite.sh    ← 一键安装
│   ├── mnemosyne-elite.js  ← Elite CLI
│   ├── hermes-bridge.js    ← Hermes 桥接
│   ├── hermes-skill.md     ← Hermes Skill
│   └── platform.js         ← 跨平台适配器
├── engine.js               ← 核心引擎（3891行，零改动）
├── modules/                ← 5 个可插拔模块
│   ├── time.js             ← 时间衰减
│   ├── refusal.js          ← 拒答检测
│   ├── rewrite.js          ← 查询改写
│   ├── multihop.js         ← 多跳推理
│   └── crosslang.js        ← 跨语言对齐
├── ui.js / ui-page.html    ← Web UI
├── hook/                   ← OpenClaw 网关钩子
├── README.md               ← 完整文档
├── MNEMOSYNE-REFERENCE.md  ← 技术参考
└── CHANGELOG.md            ← 版本历史
```

---

**版本**: v6 · **引擎**: v6.0.0 · **许可**: MIT
