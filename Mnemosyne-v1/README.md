# 🧠 Mnemosyne v1 — OpenClaw 可移植认知记忆引擎

> **Mnemosyne**（谟涅摩绪涅）— 希腊记忆女神，泰坦神族，九位缪斯之母。
> 她记得世间万物，是灵感与智慧的源泉。

> 零第三方依赖 · 单文件夹部署 · Node.js v18+

---

## 一句话

**Mnemosyne 不是聊天记录存储，是一个会选择、压缩、消解冲突、按任务召回的记忆治理系统。**

---

## 架构

```
对话 → raw 日志 → working 工作记忆 → inject 可注入摘要
                       ↓                    ↓
                  medium 中期摘要 ←── 实时检测
                       ↓
                  suggestions 候选事实
                       ↓ (人工确认)
                  MEMORY.md 长期知识库
```

### 目录

```
tools/memory-engine/          ← 引擎本体（单文件夹可移植）
memory/
├── short/raw/                ← 原始对话（压缩存储，不注入模型）
├── short/working/current.json ← 工作记忆（注入模型）
├── short/inject/             ← 结构化摘要（注入模型）
├── medium/                   ← 中期摘要块
├── index/index.md            ← 检索索引
├── engine/                   ← 向量/待办/权限/建议
├── versions/                 ← MEMORY.md 版本快照
└── .trash/                   ← 回收站（15天保留）
```

### 模型注入预算（~1000 tokens）

| 优先级 | 来源 | 大小 | 内容 |
|--------|------|------|------|
| 1 | working/current.json | ~300 tokens | 当前任务/决策/待确认 |
| 2 | inject/today.json | ~300 tokens | 今日话题/事实/决策 |
| 3 | MEMORY.md | ~200 tokens | 长期事实 |
| 4 | index.md | 浏览 | 关键词索引 |
| 5 | memory/todos.md | 浏览 | 待办清单 |

---

## 命令表

| 类别 | 命令 | 说明 |
|------|------|------|
| 基础 | `status` | 引擎状态 |
| | `sync` | 全量同步（转录+索引+归档+工作记忆+补偿扫描+清理） |
| | `enable`/`disable` | 引擎开关 |
| 搜索 | `search --query "..."` | 关键词（默认） |
| | `search --query "..." --mode semantic` | 语义（需先 embed --enable） |
| | `search --query "..." --mode hybrid` | 混合 |
| | `search --query "..." --mode recent` | 近期偏重 |
| | `search --query "..." --mode history` | 历史偏重 |
| 索引 | `embed --enable`/`--disable` | 语义开关 |
| | `embed` | 构建向量索引 |
| | `content-index` | MEMORY.md 结构化索引 |
| | `reindex-all` | 全量索引重建 |
| 版本 | `version --force` | MEMORY.md 快照 |
| | `version-diff` | 版本对比 |
| | `conflict` | 冲突检测 |
| | `restore --from latest` | 恢复版本 |
| 待办 | `todos` | 查看/提取 |
| | `todos --add "..."` / `--done <id>` | 添加/完成 |
| 备份 | `backup --msg "..."` | Git 备份 |
| | `backup-log` | 备份历史 |
| | `export` | tar.gz 导出 |
| 治理 | `health` | 健康检查 |
| | `stats` | 统计仪表盘 |
| | `timeline` | 时间轴 |
| | `sessions` | 多会话聚合 |
| | `cleanup --dry` / `--confirm` | 清理无用文件 |
| | `permission` | 权限管理 |

---

## 安全

| 机制 | 说明 |
|------|------|
| 敏感信息脱敏 | API key / JWT / 密码 / 私钥 / 卡号写入前自动过滤 |
| UI XSS 防护 | script / iframe / onerror / javascript: / file: 全部过滤 |
| 核心文件保护 | MEMORY.md / state.json / index.md 禁止删除 |
| 回收站 | 删除文件保留 15 天，支持还原 |
| 权限控制 | agent / session 级读写控制 |
| 本地绑定 | UI 仅监听 127.0.0.1 |

---

## 可移植性

- 所有路径动态解析，零硬编码
- `install.sh` 自动检测 Linux (systemd) / macOS (launchd)
- Web UI: `http://127.0.0.1:8765`
