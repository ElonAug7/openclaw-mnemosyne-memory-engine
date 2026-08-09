# 🦞 Mnemosyne v5 — Complete Technical Reference · 完整技术参考

> **全量存储，精准回忆。不模拟遗忘，只模拟注意。**
> Store everything. Recall precisely. No simulated forgetting, only simulated attention.

> Compound-Cue Core · 复合线索核心 · Zero-NN · 零神经网络 · Zero deps · 零依赖

---

## 0. One-Line Definition · 一句话定义

Mnemosyne v5 is a **purely local, zero-neural-network cognitive memory engine** built on **compound-cue theory**. Storage is machine-like (everything saved, nothing forgotten). Retrieval is human-like: it computes a single compound familiarity score (imp + recency decay + keyword match + hit frequency) to surface only what matters in this moment. The rest stays in the library — never deleted, just not shown right now.

Mnemosyne v5 是一个纯本地、零神经网络依赖的认知记忆引擎，基于**复合线索理论**。存储像机器（全量保存，永不丢失），检索像人（复合线索评分，情境选择性提取）。10 万条记忆都在库里，此刻只递给你需要的那一条。

---

## 1. What It Can Do · 核心能力 (25 项)

| Capability · 能力 | Implementation · 实现 | Effect · 效果 |
|------|---------|------------|
| Auto recording · 自动记录 | Gateway Hook -> record | Every message auto-saved · 每条消息自动保存 |
| IMP scoring · 重要性评分 | 9-dim regex (0.02-1.00) | Key decisions boosted, chatter demoted · 决策加权，闲聊降级 |
| 4-layer memory · 四层记忆 | raw -> working -> medium -> long | Auto-distillation · 自动提炼 |
| **Compound-cue search · 复合线索搜索** | imp + recency + keyword + hit frequency | Single-pass scoring · 单次评分 |
| **Memory cache · 内存缓存** | LRU hot cache (7d, 500 entries) | Zero repeat I/O · 消除重复I/O |
| **Time decay · 时间衰减** | time.js half-life in ranking | Stale info auto-sinks · 过期自动下沉 |
| **Hit frequency · 命中频率** | Memristor-style dynamic weighting | Frequent memories get boost · 常用记忆自动加权 |
| **User tags · 用户标签** | `record --tags "t1,t2"` | Tag match ×3 in search · 标签匹配权重×3 |
| **Semantic async · 语义异步** | keyword-first, semantic fire-and-forget | Instant keyword, semantic supplements · 关键词先出，语义后补 |
| **Profiler · 探查器** | `--profile` flag | Per-phase P50/P99 · 各阶段耗时分析 |
| Auto-summarization · 自动摘要 | consolidate (3-condition trigger) | Conversations → structured summaries · 对话→结构化摘要 |
| Topic continuation · 话题续接 | context (>12h + semantic overlap) | "Last time we discussed X" · 断点续聊 |
| Memory echo · 记忆回响 | recall (high-imp auto-search) | Auto-links to past topics · 自动关联历史 |
| Long-term distillation · 长期提炼 | 22:30 cron → proposals → agent review | MEMORY.md auto-maintained · 自动维护 |
| Multi-mode search · 多模式搜索 | keyword/semantic/hybrid/recent/history | Compound-cue powered · 复合线索驱动 |
| Bilingual tokenizer · 双语分词 | tokenize() (2-gram + word extraction) | Chinese + English search · 中英搜索 |
| Memory QA · 记忆问答 | context + profile + search + MEMORY.md | Natural language → structured sources |
| Bilingual entity map · 跨语言 | 100+ entity mapping | Auto query expansion · 自动查询扩展 |
| Multi-hop reasoning · 多跳推理 | 6 decomposition patterns | Per-hop verification · 逐跳验证 |
| Query rewrite · 查询改写 | Session-level dynamic context | Pronoun resolution · 代词消解 |
| Refusal detection · 拒答检测 | Score distribution, 3-tier confidence | Abstention front-loading · 拒答前置 |
| Todo management · 待办管理 | Auto-extract + Web UI | 待办清单 |
| User profile · 用户画像 | Auto-maintain prefs/tech/style | 偏好/技术栈/风格 |
| Sensitive redaction · 脱敏 | API key/password filter | 自动过滤 |
| Auto-archiving · 自动归档 | >30d raw → gz, >180d medium → gz | 节省空间 |

---

## 2. Architecture · 架构

### Compound-Cue Scoring Model · 复合线索评分模型 (v5)

```
familiarity = 0.35·imp + 0.25·recency + 0.25·keyword + 0.10·hitFreq + 0.05·layerW
```

| Factor · 因子 | Weight · 权重 | Source · 来源 |
|------|:--:|------|
| imp (重要性) | 0.35 | 9-dim regex, pre-computed at write time · 写时预计算 |
| recency (时效性) | 0.25 | time.js half-life: `2^(-age/halfLife)` · 半衰期衰减 |
| keyword (关键词) | 0.25 | 2-gram tokenizer + tag boost (×3) · 分词+标签加成 |
| hitFreq (命中频率) | 0.10 | hit-frequency.json, cap 0.3 · 忆阻器权重 |
| layerW (层级) | 0.05 | Configurable per-layer · 可配置层权重 |

### Data Flow · 数据流

```
User Message · 用户消息
  ↓
Gateway Hook (memory-recorder)
  ↓
record → sanitize → compress → tokenize → batch counter
  |                          |
imp scoring (9-dim regex)   JSONL real-time write + tags
  |                          |
batch flush (10msgs/30s)    → syncTranscripts
  |                          → reindex
recall auto-trigger          → autoConsolidate (30min throttle)
  |
working memory refresh
  |
consolidate → topic tags + quality self-assessment → medium summary blocks
  |
nightly distill (22:30) → proposals → agent review → MEMORY.md
```

### v5 Module Pipeline · 模块管线

```
cmdQA(query)
  |
  +-> crosslang.js: bilingual entity expansion · 跨语言扩展
  +-> multihop.js: sub-question decomposition · 子问题分解
  +-> rewrite.js: session-context rewrite · 会话改写
  |
  +-> compoundScore(): imp + recency + keyword + hit_freq (single-pass)
  |
  +-> refusal.js: score distribution check → refuse if unreliable · 拒答判断
  +-> time.js: per-result staleness marking · 陈旧标记
  |
  -> structured answer with sources + confidence + refusal info
```

### Four-Layer Memory · 四层记忆

| Layer · 层 | Path · 路径 | Format · 格式 | Retention · 保留 | Purpose · 用途 |
|---|------|---------|:---:|------|
| Short: Chat Logs · 对话 | `memory/short/raw/YYYY-MM-DD.jsonl` | JSONL (ts, role, text, imp, tags) | 30d → gz | Raw message stream · 原始消息流 |
| Short: Workbench · 工作台 | `memory/short/working/current.json` | JSON (task, decisions, questions, facts) | real-time | Current context · 当前上下文 |
| Short: Injectable · 摘要注入 | `memory/short/inject/YYYY-MM-DD.json` | JSON (summary, topics, facts, decisions) | 7d | Agent startup injection · 启动注入 |
| Medium: Summary · 中期归档 | `memory/medium/YYYY-MM-DD.md` | Markdown (timestamp + topic tags + quality) | 180d → gz | Daily archive · 按日归档 |
| Long: Global Knowledge · 长期知识 | `MEMORY.md` | Markdown (prefs/facts/projects/events) | permanent | Agent long context · 全局上下文 |
| Index · 索引 | `memory/index/index.md` | Markdown (one topic per line) | permanent | Search acceleration · 搜索加速 |
| User Profile · 用户画像 | `memory/profile.md` | Markdown (prefs/tech stack/style) | permanent | Personalization · 个性化 |

---

## 3. IMP Scoring: 9-Dimensional Regex · 9维正则评分

**Zero neural networks — pure regex importance assessment. · 零神经网络 — 纯正则重要性评估。**

```
base: user=0.40, assistant=0.30
---
IMP_INSTRUCT  +0.25  帮/给/请/做/改/写/实现/修复/部署/继续/然后
IMP_PREF      +0.35  喜欢/不喜欢/必须/不能/原则/底线/风格/习惯
IMP_DECISION  +0.30  决定/确认/结论/选定/采纳/最终方案/agreed
IMP_TODO      +0.25  待办/todo/下一步/计划/提醒/截止/明天
IMP_TECH      +0.12  优化/重构/架构/代码/bug/性能/安全/配置
IMP_FACT      +0.10  数字+单位 (元/块/天/小时/月/年/%)
---
Fix1: System/chitchat downgrade · 系统/闲聊降级
  SYSTEM → 0.02  heartbeat/system notification/continuation
  CHITCHAT → 0.10  ok/thanks/roger/哈哈/嗯/收到/明白
Fix2: Core principle weighting +0.15 · 核心原则加权
Fix3: Long-form directional → 0.75 · 长文本方向性
Fix4: Dual-keyword combo +0.20 · 双关键词组合
Fix5: Negation/correction +0.25 · 否定/纠正
Fix6: Comparative decision +0.18 · 对比决策
Fix7: Commitment/promise +0.35 · 承诺保证 (强承诺→0.90)
Cap: 1.00
```

---

## 4. Search: Compound-Cue Powered · 复合线索搜索 (v5)

### Modes · 模式

| Mode · 模式 | Algorithm · 算法 | Latency · 延迟 | Use Case · 场景 |
|------|---------|:---:|------|
| keyword | Compound-cue single-pass · 复合线索单次评分 | ~18ms | Exact + fuzzy · 精确+模糊 |
| semantic | Local bigram+trigram vectors (512-dim) | ~120ms (async) | Fuzzy matching · 语义匹配 |
| hybrid | keyword-first + semantic async (200ms) · 关键词优先+语义异步 | ~20ms perceived | **Default · 推荐默认** |
| recent | Same, short-term bias · 偏重短期 | ~18ms | Recent focus · 查最近 |
| history | Same, long-term bias · 偏重长期 | ~18ms | Historical lookup · 查历史 |

### v5 Latency Comparison · 延迟对比

| Mode · 模式 | v4.5-Pro | v5 | Improvement · 提升 |
|------|:---:|:---:|:---:|
| keyword | 42ms | ~18ms | **2.3×** |
| hybrid | 130ms | ~20ms (perceived) | **6.5×** |

---

## 5. Modules · 模块 (v5)

### time.js — Dynamic Half-Life Decay · 动态半衰期衰减

| Category · 分类 | Half-Life · 半衰期 | Examples · 示例 |
|------|:---:|------|
| job, location, project, status | 7-14 days | "work at X", "live in Y", "working on Z" |
| preference, habit, style | 60-90 days | "prefer A over B", "coding style: functional" |
| birthday, history, identity | infinite | "born on X", "name is Y" |

Functions: `getHalfLife()`, `relativeTime()`, `markStale()`, `resolveConflicts()`

### refusal.js — Abstention Front-Loading · 拒答前置

Three-tier system · 三档系统:
1. No results → high-confidence refusal · 无结果→高置信拒答
2. Top score below P10 + low gap → likely noise, refuse · 低于P10+低差距→拒答
3. Keyword hit but semantic mismatch → low-confidence warning · 关键词命中但无语义→低置信警告

### rewrite.js — Session Query Rewrite · 会话查询改写

- Pronoun resolution from session context · 代词消解
- Abbreviation expansion · 缩写展开
- Post-retrieval keyword expansion · 检索后扩展
- Safety valve: all rewrites validated · 安全阀校验

### multihop.js — Multi-Hop Reasoning · 多跳推理

- 6 decomposition patterns · 6种分解模式
- Per-hop verification (entity overlap check) · 逐跳验证
- Evidence chain completeness · 证据链完整性
- Auto stop on drift or max hops · 漂移自动终止

### crosslang.js — Cross-Language Alignment · 跨语言对齐

- 100+ bilingual entity mapping (English ↔ Chinese) · 中英实体映射
- Automatic bidirectional query expansion · 双向查询扩展
- Output language constraints · 输出语言约束

---

## 6. Mandatory Protocol · 强制协议 🔴

**Installed automatically · 安装后自动注入**

### Session Startup · 会话启动

1. Read `MEMORY.md` · 读长期记忆
2. Run `engine.js context` · 获取上下文
3. Read `memory/todos.md` · 读待办
4. Run `engine.js sync --quick` · 补录同步
5. Review distill proposals · 审阅提炼建议

### Before EVERY Reply · 每条回复前 (不可跳过)

1. **Read `memory/short/working/last-recall.json`** · 读 last-recall
2. **Run `recall --query`** for history/decisions/preferences · 历史相关跑 recall
3. **Cite memory sources** in reply · 回复中引用记忆来源

**Consequence of skipping: reply quality degrades · 跳过后果: 回复质量不可靠**

---

## 7. 24 Commands · 24 条命令

| Command · 命令 | Usage · 用法 |
|------|------|
| `record` | `--role user\|assistant --text "..." [--tags tag1,tag2]` |
| `sync` | `[--quick]` |
| `status` | Engine status + cache + v5 features · 引擎状态+缓存+v5特性 |
| `enable/disable` | Toggle recording · 开关记录 |
| `init` | Initialize directory structure · 初始化 |
| `search` | `--query "..." --mode keyword\|semantic\|hybrid\|recent\|history [--profile]` |
| **`rate`** | `--result <n> --score +1\|-1` — rate last search result · 评分搜索结果 **v5.2** |
| **`recalibrate`** | `[--apply]` — fit weights from ratings · 从评分拟合权重 **v5.2** |
| `qa` | `--query "..."` (with rewrite + refusal + multihop + time + crosslang) |
| `context` | Session context (task + todos + questions + topics) · 会话上下文 |
| `recall` | `--query "..."` — auto-writes to last-recall.json |
| `report` | `[--weekly]` — daily/weekly summary · 每日/周报 |
| `profile` | `[--update]` — user profile · 用户画像 |
| `distill-proposals` | `--list \| --apply <id>` — nightly distill review · 提炼审阅 |
| `consolidate` | `[--force\|--check\|--retag]` — auto-integrate conversations · 自动整合 |
| `todos` | `[--add \| --done <id>]` — todo management · 待办管理 |
| `embed` | `[--force]` — build semantic index · 构建语义索引 |
| `reindex` | Rebuild keyword index · 重建关键词索引 |
| `cleanup` | `[--confirm]` — clean old files · 清理旧文件 |
| `health` | System health check · 健康检查 |
| `stats` | Usage statistics · 统计仪表盘 |
| `profile-debug` | Cache stats + profiler report · 缓存+探查器报告 |
| `tags` | `--query "..."` — search by tags · 按标签搜索 |

### 用户反馈权重自校准 · RLHF-lite (v5.2)

```bash
search --query "关键词"  →  自动缓存结果到 last-search.json
rate --result 3 --score +1  →  第3条评分+1（好）
rate --result 1 --score -1  →  第1条评分-1（差）
recalibrate               →  最小二乘拟合新权重（需≥10条）
recalibrate --apply        →  写入 config.json，即时生效
```

评分数据流: ratings.json → 高斯消元解 5×5 线性方程组 → 新权重 → config.json
负评分联动: 评分 -1 → 自动调用 decayHit() 衰减该记忆的命中频率

500条实测: 训练准确率 68.4%，旧权重(0.35/0.25/0.25/0.10/0.05) → 拟合 → 新权重

---

## 8. Limitations (Honest) · 已知限制

| Limitation · 限制 | Reason · 原因 | Alternative · 替代 |
|------|------|------|
| No NL answer generation · 无自然语言回答 | No LLM · 无LLM | External LLM for synthesis · 外部LLM合成 |
| No cross-language semantic search · 无跨语言语义搜索 | No embedding model · 无embedding模型 | Dictionary-based expansion · 字典扩展 |
| No deep multi-hop reasoning · 无深度多跳推理 | No neural network · 无神经网络 | Decomposition only · 仅分解模式 |
| Write throughput 2 docs/s · 写入2条/秒 | Full pipeline per record · 全管线处理 | Async queue (planned) · 异步队列(计划中) |

---

## 9. Version History · 版本历史

| Version · 版本 | Date · 日期 | Key Difference · 关键差异 |
|------|------|------|
| **v5.0** | 08-09 | **Compound-cue core**: single-pass scoring, LRU cache, semantic async, user tags, profiler, hit tracking, time decay in search |
| v4.5-Pro | 08-08 | 5 pluggable modules · time-aware · refusal · rewrite · multihop · crosslang |
| v4.5 | 08-08 | 9-dim imp · QA · tokenizer · batching |
| v4-pro | 08-07 | 251 calibrations · 5-fold CV · evaluation panel |
| v4 | 08-07 | Memory echo · topic continuation · heatmap · time machine |
| v3 | 08-06 | CSRF · truncation protection · IMP_TECH · hook detection |
| v2 | 08-06 | config.json · recycle bin · consolidate · nightly distill |
| v1 | 08-05 | 4-layer arch · semantic index · Web UI |

---

## 10. Performance · 性能

| Metric · 指标 | v4.5-Pro | v5 | 提升 |
|------|:---:|:---:|:---:|
| keyword search | 42ms | **18ms** | 2.3× |
| hybrid search | 130ms | **20ms perceived** | 6.5× |
| RAM overhead | 0MB | 0MB | — |
| Dependencies · 依赖 | 0 | 0 | — |
| Model download · 模型下载 | 0MB | 0MB | — |
| Install · 安装 | bash install.sh | bash install.sh | — |

---

*Mnemosyne v5.0 · 2026-08-09 · Compound-Cue Core · 复合线索核心 · Zero-NN · 零依赖 · Zero API keys · 零API key*
