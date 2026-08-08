# MEMORY-PROTOCOL.md — 分层记忆协议 v1

## 架构定位

Mnemosyne 是智能中枢，位于 MEMORY.md 之上，管理所有记忆资源（对话日志、短期/中期/长期记忆），提供统一检索与调用接口。
MEMORY.md 是结构化知识库，存储经提炼的、权威的、结构化的知识。

## 层级结构

```
memory/
├── index/          ← ① 索引层
│   ├── index.md              # 中期摘要块关键词索引
│   └── content-index.json    # MEMORY.md 结构化索引（关键词/实体/时间）
├── short/          ← ② 短期层
│   ├── conversations/YYYY-MM-DD.jsonl  # 原始对话流（带重要性评分 imp）
│   └── archive/YYYY-MM.jsonl.gz        # 30天后 gzip 归档（搜索仍穿透）
├── medium/         ← ③ 中期层
│   ├── YYYY-MM-DD.md          # 摘要块
│   └── archive/YYY-MM-DD.md.gz # 180天后归档
├── long/           ← ④ 长期层
│   └── MEMORY.md → ../../MEMORY.md  # 符号链接
├── engine/         ← 引擎状态
│   ├── state.json
│   ├── transcript-offsets.json
│   ├── embeddings.json        # 语义向量索引
│   ├── todos.json / permissions.json
│   └── hook-debug.log
├── versions/       ← MEMORY.md 版本快照
│   └── YYYY-MM-DDTHH-MM-SS.json
└── todos.md        ← 待办清单（自动渲染）
```

### ① 索引层

- `index.md`：每个中期摘要块同步 1 行。引擎自动维护。
- `content-index.json`：MEMORY.md 的节级索引，包含关键词、实体（URL/日期/版本号）、条目数。`sync`/`save` 时自动更新。

### ② 短期层

- 每条消息带 `imp` 字段（0.0–1.0），搜索/统计按重要性加权
- 30 天后按月份合并 gzip 归档到 `archive/`，搜索仍可穿透压缩文件

### ③ 中期层

- 触发：每 20 轮（引擎自动发信号）或话题结束时
- 180 天后 gzip 归档

### ④ 长期层

- `MEMORY.md`：用户偏好、关键事实、当前项目、重要事件 + 变更记录
- 每次 `save`/`sync`/`backup` 自动版本快照（保留最近 50 个）
- 冲突检测：`engine.js conflict` 扫描矛盾条目

## 摘要信号

| 信号 | 周期 | 动作 |
|------|------|------|
| 短期摘要 | 每 5 轮 | 刷新 MEMORY.md，待办提取 |
| 中期摘要 | 每 20 轮 | 详细摘要块 → medium/，索引自动补全，待办提取，版本快照 |

## 检索策略

| 场景 | 命令 |
|------|------|
| 普通聊天 | 读 MEMORY.md + index.md + todos.md |
| 关键词查询 | `search --query "..."` |
| 语义查询 | `search --query "..." --mode semantic`（需先 `embed`） |
| 混合查询 | `search --query "..." --mode hybrid` |
| 近期焦点 | `search --query "..." --mode recent`（偏重短期权重） |
| 历史知识 | `search --query "..." --mode history`（偏重长期权重） |

## 版本与冲突

- `engine.js version --force`：创建 MEMORY.md 版本快照
- `engine.js version-history`：查看最近版本
- `engine.js version-diff`：对比版本差异
- `engine.js conflict`：检测可能的矛盾条目
- 冲突解决原则：以 MEMORY.md 最新版本为准，旧条目移入「变更记录」节

## 权限

- `engine.js permission`：查看权限配置
- `engine.js permission --agent <id> --level read|write|admin`：按 agent 设置
- 默认级别：`read`（只读），write 才允许写入
