# 🦞 Mnemosyne v6 — Cognitive Memory Engine Memory Engine · 复合线索记忆引擎

> **全量存储，精准回忆。不模拟遗忘，只模拟注意。**
> Store everything like a machine. Recall like a human.

> v6: Cognitive memory engine compound-cue scoring instead of multi-merge. Zero deps, zero models.

---

## Version History 新特性

| 特性 Feature | 说明 Description | 实测 Result |
|------|------|:--:|
| 复合线索评分 Compound-Cue | `0.35·imp + 0.25·recency + 0.25·keyword + 0.10·hitFreq + 0.05·layerW` | 42→18ms |
| 时间衰减 Time Decay | time.js half-life integrated into search ranking | auto-sink stale |
| 语义异步 Semantic Async | keyword-first (~15ms), semantic supplements (200ms timeout) | 130→20ms |
| 内存缓存 Memory Cache | LRU 7 days / 500 entries | zero repeat I/O* |
| 命中追踪 Hit Tracking | Memristor-style dynamic weights | auto-boost frequent |
| 用户标签 User Tags | `--tags` support, ×3 weight in search | self-generated cues |
| 探查器 Profiler | `--profile` per-phase P50/P99 | instant diagnosis |

### v5 vs v4.5-Pro

| 维度 Dimension | v4.5-Pro | v5 | 提升 Improvement |
|------|--------|------|:--:|
| 检索核心 Search Core | parallel 6-layer → merge | single-pass compound-cue | simpler |
| 时间衰减 Time Decay | qa-only | full search ranking | complete |
| 语义层 Semantic | blocking await | keyword-first async | 6.5× faster |
| keyword 延迟 | 42ms | **18ms** | 2.3× |
| hybrid 延迟 | 130ms | **20ms perceived** | 6.5× |
| 内存缓存 Memory Cache | none | LRU 7d/500 | — |
| 命中追踪 Hit Tracking | none | hit-frequency.json | — |
| 用户标签 User Tags | none | record --tags | — |
| 探查器 Profiler | none | --profile P50/P99 | — |
| 模块 Modules | 5 | 5 (all kept) | — |
| 命令 Commands | 20 | 22 | +2 |
| 依赖 Dependencies | 0 | 0 | — |

---

## Install · 安装

```bash
cp -r Mnemosyne-v6 ~/.openclaw/workspace/tools/
cd ~/.openclaw/workspace/tools/Mnemosyne-v6 && bash install.sh
```

安装后自动注入强制协议到 SOUL.md 和 AGENTS.md。
Auto-injects mandatory protocol into SOUL.md and AGENTS.md on install.

Web UI: `http://127.0.0.1:8765`

---

## Architecture · 架构

```
User Message · 用户消息
  ↓
Gateway Hook (memory-recorder)
  ↓
record → IMP评分 → tags写入 → JSONL实时落盘
  ↓ (high-imp auto)
recall → compoundScore(imp+recency+keyword+hitFreq) → last-recall.json
  ↓ (every 30min / 8 high-imp)
consolidate → medium summary blocks + index
  ↓ (nightly 22:30)
nightly distill → proposals → MEMORY.md
```

### 四层记忆 · Four-Layer Memory

| 层 Layer | 路径 Path | 保留 Retention | 内容 Content |
|------|------|:--:|------|
| 短期·对话 Short·Raw | `short/raw/YYYY-MM-DD.jsonl` | 30d→gz | 原始消息流 Raw messages |
| 短期·工作台 Short·Working | `short/working/current.json` | real-time | 任务/决策/问题 Tasks/decisions/questions |
| 中期·归档 Medium | `medium/YYYY-MM-DD.md` | 180d→gz | 按日话题摘要 Daily topic summaries |
| 长期·知识 Long | `MEMORY.md` | permanent | 全局偏好/事实 Global prefs/facts |

---

## 24 Commands · 24 条命令

| 分类 Category | 命令 Commands |
|------|------|
| 📝 记录 Record | `record` `sync` `sync --quick` |
| 🔍 搜索 Search | `search` `recall` `qa` `context` `tags` |
| 🎯 反馈 Feedback | `rate` `recalibrate` |
| 📊 查看 View | `status` `stats` `health` `report` `profile` `todos` |
| 🏗️ 维护 Maintain | `init` `consolidate` `reindex` `embed` `cleanup` |
| ⚙️ 控制 Control | `enable` `disable` `distill-proposals` |
| 🐛 调试 Debug | `profile-debug` `search --profile` |

### 用户反馈 + 权重自校准 · RLHF-lite

```bash
# 搜索后自动缓存，然后评分
engine.js search --query "v5 架构" --mode keyword
engine.js rate --result 3 --score +1    # 第3条好
engine.js rate --result 1 --score -1    # 第1条差

# 累积≥10条评分后校准
engine.js recalibrate              # 预览新权重
engine.js recalibrate --apply      # 写入 config.json，下次搜索生效
```

500条评分实测: 旧权重(imp=0.35,rec=0.25,kw=0.25,hf=0.10,lw=0.05) → 最小二乘拟合 → 新权重。准确率随真实评分积累持续提升。

> ⚠️ 延迟基准基于 CLI 单次调用实测。\*内存缓存在 CLI 模式不跨进程，仅 Gateway 长驻模式有效。
> 权重校准数据来源: benchmark (synthetic, seed=42, n=500, train/test=400/100, accuracy=89.8%/89.0%)

### 搜索模式 · Search Modes

| 模式 Mode | 算法 Algorithm | 延迟 Latency | 场景 Use Case |
|------|------|:--:|------|
| `keyword` | compound-cue single-pass | ~18ms | 精确+模糊 Exact + fuzzy |
| `semantic` | local bigram+trigram vectors (512-dim) | ~120ms (async) | 语义匹配 Semantic |
| `hybrid` | keyword-first + semantic async | ~20ms perceived | **推荐默认 Default** |
| `recent` | same, short-term bias | ~18ms | 查最近 Recent |
| `history` | same, long-term bias | ~18ms | 查历史 History |

---

## 5 Modules · 5 个模块

| 模块 Module | 行 Lines | 功能 Function |
|------|:--:|------|
| `time.js` | 115 | 动态半衰期衰减 + 冲突解决 Dynamic half-life + conflict resolution |
| `refusal.js` | 107 | 拒答前置: 分数分布 + 三档置信 Abstention: score dist + 3-tier confidence |
| `rewrite.js` | 70 | 查询改写: 代词消解 + 安全阀 Query rewrite: pronouns + safety valve |
| `multihop.js` | 114 | 多跳推理: 分解 + 逐跳验证 Multi-hop: decompose + verify per-hop |
| `crosslang.js` | 112 | 跨语言: 100+实体映射 + 扩展 Cross-lang: 100+ entity map + expand |

---

## 中文完整说明

### 一句话定义

Mnemosyne v6 是一个纯本地、零神经网络依赖的认知记忆引擎，基于**复合线索理论**（compound-cue theory）构建。单次评分替代多路 merge，配备 5 个可插拔模块。无需 LLM API、无需 embedding 模型、无需向量数据库。

### 核心公式

```
熟悉度 = 0.35 × 重要性(imp) + 0.25 × 时效性(recency) + 0.25 × 关键词(keyword) + 0.10 × 命中频率(hitFreq) + 0.05 × 层级权重(layerW)
```

### 核心能力

消息自动记录 · 9维 imp 智能评分 · 四层分层记忆 · 复合线索评分 · 内存热区缓存 · 时间衰减排序 · 语义异步化 · 命中频率追踪 · 用户标签 · 性能探查器 · 自动摘要整合 · 话题续接 · 记忆回响 · 长期记忆提炼 · 5 模式搜索 · 语义去重 · Memory QA · 双语分词 · 时间感知衰减 · 拒答检测 · 查询改写 · 多跳推理 · 跨语言对齐 · 待办管理 · 用户画像

### 强制协议 🔴

安装后自动注入：每条回复前必须读取 `last-recall.json`，涉及历史时必须跑 `recall --query`，回复中必须引用记忆来源。跳过任一强制步骤 = 回复质量不可靠。

### 性能 Performance

keyword ~18ms / hybrid ~20ms 感知 · vs v4.5-Pro: keyword 2.3× 快, hybrid 6.5× 快 · 缓存命中率随使用自动提升 · RAM 0MB · 零依赖 · 零 API key

---

## 🏆 Mnemosyne Elite — Hermes / Cross-Platform Edition

> **不改 engine.js 一行代码**，适配 Windows (MSYS/MinGW) · macOS · Linux · Hermes

### Quick Install

```bash
cd tools/memory-engine/elite
bash install-elite.sh --hermes --skill-dir /path/to/hermes/skills
```

一键完成: 环境变量 · 目录初始化 · 引擎自检 · Hermes Skill 安装（路径自动替换为绝对路径）

### What Elite Adds · Elite 增强

| 特性 | engine.js | Elite |
|------|:--:|:--:|
| 环境变量 | `OPENCLAW_WORKSPACE` only | `MNEMOSYNE_ROOT` / `HERMES_WORKSPACE` / 兼容旧名 |
| MSYS/MinGW 路径 | ❌ 静默失败 | ✅ 自动映射 `/c/` → `C:\` |
| WSL 检测 | — | ✅ 自动识别 |
| Hermes Skill | — | ✅ 自动安装 + 路径替换 |
| Hermes Bridge | — | ✅ `pre-reply` / `post-reply` / `quick-check` 一键式 |
| 强制记忆协议 | SOUL/AGENTS.md | ✅ Skill 文件内含完整协议 |
| 路径诊断 | — | ✅ `self-check` / `diag` |

### 平台适配

```bash
# 引擎状态
node tools/memory-engine/elite/mnemosyne-elite.js diag

# Hermes Agent 调用
node tools/memory-engine/elite/hermes-bridge.js pre-reply --query "用户消息"
node tools/memory-engine/elite/hermes-bridge.js post-reply --user "..." --assistant "..."

# 所有 engine.js 命令照常可用
node tools/memory-engine/elite/mnemosyne-elite.js search --query "关键词"
```

详见 `elite/README.md` · Hermes Skill 文档: `elite/hermes-skill.md`

## 🔒 Security · 安全默认值

Mnemosyne 默认即安全，部署者无需额外配置：

| 安全项 | 默认行为 |
|---|---|
| 安装权限 | **零 sudo** — 全部用户级目录，不碰系统文件 |
| Web UI 监听 | 仅 `127.0.0.1`（代码写死，外网不可达） |
| Web UI 访问 | 自动生成强 token（128 位）；或设 `MEMORY_UI_TOKEN` 环境变量固定 |
| DNS rebinding 防护 | 只接受本机 Host 头（127.0.0.1/localhost/::1），伪造 Host 一律 403 |
| CSRF 防护 | POST 请求校验 Origin/Referer 仅允许本地来源 |
| XSS 防护 | Markdown 渲染前过滤 script/iframe/事件处理器等 |
| 数据目录权限 | 记忆目录自动 chmod 700（仅属主可读写，部署即生效） |
| 路径穿越 | 文件浏览白名单（仅记忆目录 + MEMORY.md） |
| 网络依赖 | 零 — 语义检索为可选功能，默认不联网 |
| API key | 不需要任何 key 即可运行（语义增强才需要自行配置） |
| 写入安全 | 关键文件原子写入（tmp+rename），防中断写坏 |
| 长期记忆写入 | proposals 审阅制 — 自动提炼只生成候选，需人工确认 |
| 数据目录 | 全部位于你的记忆根目录，不写系统任何位置 |

**部署者须知**：引擎监听端口的对外暴露（如端口转发/防火墙）由部署者自己控制；引擎自身不会主动对外开任何端口。

---

## Docs · 参考文档

- `MNEMOSYNE-REFERENCE.md` — 完整技术参考 · Full Technical Reference
- `CHANGELOG.md` — 版本历史 · Version History

*Mnemosyne v5.1-elite · 2026-08-11 · Compound-Cue Core + Cross-Platform Adapter · Zero-NN · 零依赖 · 零 API key*
