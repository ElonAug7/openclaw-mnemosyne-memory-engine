# 🦞 Mnemosyne v2 — OpenClaw 可移植认知记忆引擎

> **Mnemosyne**（谟涅摩绪涅）— 希腊记忆女神，泰坦神族，九位缪斯之母。

> **零第三方依赖 · 纯 Node.js · 单文件夹部署 · 一键安装**

---如果需要更详细的可以阅读MNEMOSYNE-REFERENCE.md

## 📦 新用户：3 步上手

### 第 1 步：复制到工作区

```bash
# 把整个 memory-engine 文件夹放到 OpenClaw 工作区的 tools/ 下
cp -r memory-engine/ ~/.openclaw/workspace/tools/
```

### 第 2 步：安装

```bash
cd ~/.openclaw/workspace/tools/memory-engine
bash install.sh
```

安装脚本自动完成：
- ✅ 初始化四层记忆目录
- ✅ 安装 Gateway hook（消息自动记录）
- ✅ 注入 AGENTS.md 记忆系统章节（新会话自动加载）
- ✅ 注入 SOUL.md 记忆协议（agent 启动时自动执行）
- ✅ 启动 Web UI 服务（systemd/launchd 开机自启）
- ✅ 可移植性自验证（无硬编码路径）

### 第 3 步：重启网关

```bash
openclaw gateway restart
```

### 验证

```bash
# 打开 Web 控制台
open http://127.0.0.1:8765

# 或命令行查看状态
node tools/memory-engine/engine.js status
```

**之后每条消息自动记录，agent 每个新会话自动加载记忆，无需任何手动操作。**

---

## 🏗️ 四层记忆架构

```
                    ┌──────────────────────────┐
                    │      用户消息流入          │
                    └──────────┬───────────────┘
                               │
                    ┌──────────▼───────────┐
                    │   Gateway Hook 拦截    │
                    │   自动记录 + imp 评分  │
                    └──────────┬───────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  📝 short/    │    │  🔍 index/    │    │  📚 medium/   │
│  对话记录 raw  │    │  关键词索引    │    │  话题摘要块    │
│  工作台 work   │    │  (每话题1行)   │    │  (按日归档)   │
│  今日摘要 inj  │    └───────────────┘    └───────┬───────┘
└───────┬───────┘                                  │
        │                                          │
        │     consolidate 自动整合                  │
        │     (imp累积触发 + 30min节流)              │
        │                                          │
        └──────────────────┬───────────────────────┘
                           │
                ┌──────────▼───────────┐
                │   nightly distill    │
                │   每晚 22:30 运行     │
                │   生成候选 proposals  │
                └──────────┬───────────┘
                           │
                ┌──────────▼───────────┐
                │   Agent 人工审阅      │
                │  distill-proposals   │
                │  --apply / --reject  │
                └──────────┬───────────┘
                           │
                ┌──────────▼───────────┐
                │  🏛️ MEMORY.md       │
                │  长期全局知识         │
                │  版本快照 (50个)      │
                └──────────────────────┘
```

### 各层详解

| 层 | 路径 | 注入模型？ | 说明 |
|---|------|-----------|------|
| 🔍 索引 | `memory/index/index.md` | 是 | 中期摘要块关键词索引，每行一个话题，agent 最先查 |
| 📝 短期·对话记录 | `memory/short/raw/YYYY-MM-DD.jsonl` | 否 | 原始消息流，每条带 `imp` 重要性评分，800 字符截断+语义压缩 |
| 📝 短期·工作台 | `memory/short/working/current.json` | 是 | 当前任务、最近决策、待确认问题，高 imp 消息触发刷新 |
| 📝 短期·今日摘要 | `memory/short/inject/YYYY-MM-DD.json` | 是 | 话题、决策、事实的结构化 JSON，搜索排序加权 |
| 📚 中期 | `memory/medium/YYYY-MM-DD.md` | 是 | 按日期的摘要块，含结论/事实/待办/关键词 |
| 🏛️ 长期 | `MEMORY.md` | 是 | 全局知识（用户偏好、关键事实、项目、事件），cron 夜间提炼 |

---

## ⚙️ 自动化管线（全无人值守）

```
每次消息落盘 (record) ─┬─→ 轮次计数 → 5/20轮信号（兼容保留）
                      ├─→ imp累积检查 → 自动写中期摘要块+索引 (consolidate)
                      ├─→ 高重要性提取 → todos.md
                      └─→ 转录补录 → sync 命令

每晚 22:30 (cron) ────→ 审阅当天摘要 → distill-proposals.json
                                                  │
                     agent 会话启动时 ──→ 逐条审阅 → apply/reject

每天 03:00 (cron) ────→ Git 自动备份 memory/
每天 03:30 (cron) ────→ Memory Dreaming Promotion（高频召回提升）
每周日 10:00 (cron) ──→ 索引清理 + 归档 + MEMORY.md 融合降级
```

---

## 🔍 搜索引擎（7 路并行召回）

搜索命令格式：
```bash
node tools/memory-engine/engine.js search --query "关键词" [--mode mode]
```

### 搜索模式

| 模式 | 原理 | 适用场景 |
|------|------|---------|
| `keyword` (默认) | 全文关键词精确+模糊匹配，4 层加权 | 精确查找 |
| `semantic` | 128 条本地语义向量，余弦相似度排序 | 模糊语义 |
| `hybrid` | 关键词 + 语义融合排序 | 通用最优 |
| `recent` | 偏重短期权重（working 25%, raw 25%） | 近期焦点 |
| `history` | 偏重长期权重（long 45%, idx 20%） | 历史追溯 |

### 权重分配表

| 通道 | keyword | semantic | hybrid | recent | history |
|------|---------|----------|--------|--------|---------|
| 工作台 working | 0.08 | 0.08 | 0.10 | 0.25 | 0.02 |
| 今日摘要 inject | 0.10 | 0.10 | 0.12 | 0.20 | 0.03 |
| 对话记录 raw | 0.12 | 0.10 | 0.15 | 0.25 | 0.05 |
| 中期摘要 medium | 0.22 | 0.25 | 0.22 | 0.15 | 0.20 |
| 长期知识 long | 0.25 | 0.22 | 0.18 | 0.10 | 0.45 |
| 索引 idx | 0.18 | 0.05 | 0.08 | 0.03 | 0.20 |
| 语义向量 | 0.05 | 0.20 | 0.15 | 0.02 | 0.05 |

### 性能优化（P1）

- **gzip 索引先行**：归档时自动生成 `.idx.json` 轻量索引，搜索先查索引命中才解压
- **imp 累积触发**：consolidate 不再仅靠消息条数，imp 总和 ≥ 3.0 即触发摘要
- **语义去重**：规范化文本（去时间戳+空白归一化）后比较，抵抗格式差异

---

## 🛡️ 安全机制

### P0 加固

| 机制 | 实现 |
|------|------|
| **人工确认** | nightly distill 写入 `distill-proposals.json`，agent 审阅后 `--apply` 才写入 MEMORY.md |
| **进程锁** | `engine/lockfile`：`wx` 原子创建，超时 2 分钟自动释放 |
| **cron 错开** | Git 备份 03:00 / Dreaming Promotion 03:30 / Nightly Distill 22:30 |
| **写入去重** | apply 前检查 MEMORY.md 已有内容，跳过重复条目 |

### 数据保护

| 机制 | 说明 |
|------|------|
| 敏感信息脱敏 | API key / JWT / 密码 / 私钥 / 卡号，写入 raw 前正则过滤 |
| 回收站 | 删除保留 15 天，支持还原 + 彻底删除 |
| 版本快照 | MEMORY.md 每次写入自动快照，保留最近 50 个 |
| 冲突检测 | `version-diff` 对比版本差异，`conflict` 扫描矛盾条目 |
| 权限控制 | agent/session 级读写控制（read/write/admin） |

### Web UI 安全

| 机制 | 说明 |
|------|------|
| 本地隔离 | `127.0.0.1:8765` 仅本机访问 |
| XSS 防护 | script / iframe / onerror / javascript: 全过滤 |
| 路径白名单 | `safePath()` 防目录穿越 |
| 核心保护 | MEMORY.md / state.json / index.md 禁止删除 |

---

## 📊 imp 重要性评分系统

```
基准分: user=0.35, assistant=0.30
加成:
  +0.30  含决策词（决定/确认/最终方案/agreed 等）
  +0.25  含待办提醒（todo/下一步/记得/别忘了 等）
  +0.10  含数字+单位（元/天/小时/月/年/%）
  +0.05  以问号结尾（提问）
  +0.05  长度 >500 字符（长消息信息量大）
封顶: 1.0
闲聊降级: 仅含哈哈/嗯/好的/ok/谢谢 等 → 0.1
手动校准: engine.js imp-calibrate --date "..." --line <N> --imp 0.8
```

imp 是整个系统的中枢信号，驱动：
- consolidate 触发（imp 累积 ≥ 3.0）
- 搜索排序（`score × (1 + imp)`）
- todo 提取（高 imp 消息自动检测待办）
- Dreaming Promotion（高频高 imp 消息提升到长期层）

---

## 📋 完整命令参考

### 基础命令

| 命令 | 说明 |
|------|------|
| `status` | 引擎状态（轮次/消息/索引/todo/归档） |
| `sync` | 转录补录 + 索引补全 + 归档检查 + 待办提取 + 自动整合 |
| `enable` / `disable` | 启用/暂停自动记录 |
| `signal` | 手动触发摘要信号 |
| `init` | 初始化目录结构 |

### 记忆管理

| 命令 | 说明 |
|------|------|
| `consolidate [--check --force]` | 自动整合检查/强制执行 |
| `search --query "..." [--mode]` | 多模式搜索 |
| `todos [--add "..."] [--done <id>]` | 待办清单 |
| `distill-proposals [--list --apply <id>]` | 审阅长期记忆候选 |
| `distill-reject --id <id> --reason "..."` | 拒绝候选 |
| `imp-calibrate --date "..." --line <N> --imp 0.8` | 手动校准重要性 |

### 版本管理

| 命令 | 说明 |
|------|------|
| `version [--force]` | MEMORY.md 版本快照 |
| `version-history` | 查看最近 50 个版本 |
| `version-diff [--v1 <id> --v2 <id>]` | 对比版本差异 |
| `conflict` | 检测矛盾条目 |
| `restore [--list --id <vid> --from latest]` | 恢复历史版本 |

### 运维

| 命令 | 说明 |
|------|------|
| `backup [--msg "..."]` | Git 备份 |
| `backup-log` | 备份历史 |
| `cleanup [--dry --confirm]` | 清理无用文件 |
| `health` | 健康度检查 |
| `stats` | 统计仪表盘 |
| `export` | 导出 tar.gz |
| `config [--get --set --reset]` | 运行时配置 |

---

## 🌐 Web 控制台

```
地址: http://127.0.0.1:8765 (仅本机)
技术: 纯 Node.js HTTP server + 单页 HTML（零前端框架）
```

**功能：**
- 四层记忆文件浏览，默认隐藏引擎内部文件
- Markdown 渲染 / JSONL 对话气泡 / 原文切换
- 全文搜索 + 多模式检索
- 一键开关自动记录 / 手动触发摘要
- 建议清理（过期日志/空目录/回收站到期）
- 回收站（15 天保留，支持还原/彻底删除）
- 引擎状态仪表盘

---

## 🔧 可配置项 (`memory/engine/config.json`)

```json
{
  "retention": {
    "injectDays": 7,      // 今日摘要保留天数
    "rawDays": 30,         // 对话记录保留天数（之后 gzip 归档）
    "mediumDays": 180,     // 中期摘要保留天数
    "logDays": 3,          // 调试日志保留天数
    "suggestionDays": 14,  // 建议文件保留天数
    "trashDays": 15        // 回收站保留天数
  },
  "thresholds": {
    "shortSignalTurns": 5,        // 短期摘要信号轮次
    "mediumSignalTurns": 20,      // 中期摘要信号轮次
    "workingUpdateMsgs": 3,       // 工作记忆刷新消息数
    "consolidateIntervalMs": 1800000,  // 自动整合检查间隔 (30min)
    "consolidateMinMsgs": 8,     // 触发最少消息数
    "consolidateMinHighImp": 2,  // 触发最少高重要性消息数
    "consolidateMinImpSum": 3.0, // 触发最少 imp 总和
    "rawMaxChars": 800           // 单条消息最大存储字符数
  },
  "embed": {
    "defaultEnabled": true,  // 语义搜索默认开启
    "maxRecentDays": 30      // 语义索引覆盖天数
  },
  "weights": { /* 7路搜索权重，见上表 */ }
}
```

---

## 📦 可移植性

### 核心原则

- **零硬编码路径**：全部通过 `OPENCLAW_WORKSPACE` 环境变量 + `os.homedir()` 动态解析
- **零第三方 npm 依赖**：`fs`, `path`, `http`, `zlib`, `crypto`, `child_process` — 全部 Node.js 内置
- **操作系统兼容**：`install.sh` 自动检测 Linux (systemd) / macOS (launchd) / 通用后台进程
- **可选依赖降级**：git 缺失跳过备份，openclaw 缺失跳过 hook，均不崩溃

### 单文件夹即用

```
memory-engine/
├── engine.js          ← 主引擎 (2900+ 行)
├── ui.js              ← Web 服务器
├── ui-page.html       ← Web 控制台页面
├── install.sh         ← 安装脚本
├── logo.png           ← 品牌图标
├── templates/
│   ├── AGENTS-SECTION.md   ← 注入 AGENTS.md 的章节
│   ├── SOUL-SECTION.md     ← 注入 SOUL.md 的章节
│   ├── MEMORY.md           ← MEMORY.md 模板
│   └── index.md            ← 索引模板
├── hook/
│   ├── HOOK.md             ← hook 元数据
│   └── handler.js.template ← hook 处理器（安装时路径替换）
└── lib/                    ← 模块目录（预留拆分）
```

---

## 📜 版本迭代历史

### v5.2 — 自动记忆 (2026-08-06 18:56)

**核心理念：长期记忆和索引不再需要人工提醒，引擎自动判断+写入。**

| 变更 | 说明 |
|------|------|
| `consolidate` 命令 | 消息落盘时自动检查新对话，≥8 条或 ≥2 条高 imp 或 imp 总和 ≥3.0 自动写中期摘要块 + 同步索引 |
| nightly-distill cron | 每晚 22:30 自动审阅当天摘要 → distill-proposals.json |
| SOUL.md 注入 | install.sh 新增 SOUL.md 记忆协议注入，新会话自动执行启动协议 |

**P0 安全加固（同日 19:29）：**

| 变更 | 说明 |
|------|------|
| distill-proposals 审阅制 | nightly distill → proposals → agent 人工 `--apply` / `--reject` |
| 进程锁 | `engine/lockfile` 原子创建，超时 2 分钟自动释放 |
| cron 错开 | Git 备份 03:00 / Dreaming 03:30 |

**P1 改进（同日 19:33）：**

| 变更 | 说明 |
|------|------|
| imp 文档化+可校准 | `importanceOf()` 完整注释，`imp-calibrate` 命令 |
| gzip 索引先行 | 归档时生成 `.idx.json`，搜索先查索引后解压 |
| imp 累积触发 | consolidate 改为 imp 总和 ≥3.0（替代纯消息计数） |
| 语义去重 | 规范化文本（去时间戳+空白归一化），128 字符匹配 |

**压缩优化（同日 19:49）：**

| 变更 | 说明 |
|------|------|
| 800 字符截断 | `rawMaxChars: 800`（原 1500），可配置 |
| JSON/代码/表格压缩 | `[JSON: keys]` / `[代码块: lang]` / `[表格: N行]` 语义标注 |

**UI 品牌更新（同日 19:14-19:20）：**
- 移除所有 emoji 图标，唯一图标为 `logo.png`
- 版本号 v1 → v2（引擎 status + HELP + Web UI 标题）
- 四层目录整理：`agents/` 空目录移除，引擎内部文件 Web UI 默认隐藏

### v5.1 — 语义智能 (2026-08-06 16:15-17:01)

| 变更 | 说明 |
|------|------|
| P0: 短期记忆三层拆分 | raw(对话记录) / working(工作台) / inject(今日摘要) |
| P0: 状态字段 | active / candidate / disputed / superseded / archived |
| P1: 多路并行召回 | keyword + semantic + hybrid + recent + history，5 种模式 7 路加权 |
| P1: hook 补偿扫描 | 检测未提炼 raw / 缺失摘要 / 索引断裂 / 工作记忆过期 |
| P2: embedding 可选 | 本地 bigram+trigram，远端 API 回退 |
| 内置清理 | `cleanup` 命令 + sync 自动触发 |

### v2 — 用户体验层 (2026-08-06 18:11-18:30)

| 变更 | 说明 |
|------|------|
| 可配置文件 | `config.json` 集中管理所有阈值/保留期/权重 |
| 友好命名 | 工作台/今日摘要/对话记录/中期归档/长期知识 |
| 建议清理 | 自动检测过期日志/摘要/空目录 |
| 开发日志 | index.md 置顶迭代记录，每次 sync 自动追加 |
| 回收站 | 删除保留 15 天，支持还原/彻底删除 |

### v1 — 正式发布 (2026-08-06 17:06)

- 正式命名 Mnemosyne
- 文本压缩存储（表格→标注、代码块→标签、1500 字符截断）
- Web UI 完整功能（Logo + 回收站 + 删除按钮 + Markdown 渲染）
- 可移植安装脚本（Linux systemd + macOS launchd）
- AGENTS.md 注入机制（标记块幂等）

---

## 🚀 定时任务配置

安装后需手动添加 cron 任务（通过 OpenClaw Gateway）：

```bash
# 夜间提炼（每晚 22:30）
# 已通过 openclaw cron 配置，见 install.sh 完成提示

# 如需手动：
openclaw cron create --cron "30 22 * * *" --tz Asia/Shanghai \
  --name mnemosyne-nightly-distill --session isolated \
  --agent-turn "你是小爪的记忆提炼进程..." --wake now
```

现有任务：
| 任务 | 时间 | 功能 |
|------|------|------|
| mnemosyne-nightly-distill | 22:30 | 审阅当天内容生成 distill proposals |
| 记忆系统每日 Git 备份 | 03:00 | memory/ 自动 commit |
| Memory Dreaming Promotion | 03:30 | 高频记忆提升到长期层 |
| memory-weekly-maintenance | 周日 10:00 | 索引清理 + 归档 + MEMORY.md 融合 |

---

## 🔒 安全承诺

- **不联网**：所有数据本地存储，Web UI 仅 `127.0.0.1`
- **不依赖外部服务**：语义索引本地计算，远端 API 可选
- **敏感信息过滤**：API key / 密码 / 私钥 / 卡号 自动脱敏
- **无数据外泄**：零遥测，零分析，零第三方依赖
