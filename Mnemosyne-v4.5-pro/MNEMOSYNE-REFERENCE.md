# 🦞 Mnemosyne v4.5-Pro — Complete Technical Reference

> 3,291 lines · 20 commands · Zero-NN · Zero deps · Zero models · 5 pluggable modules · bash install.sh

---

## 0. One-Line Definition

Mnemosyne v4.5-Pro is a **purely local, zero-neural-network cognitive memory engine** with 5 pluggable modules (time-aware decay, refusal front-loading, query rewrite, multi-hop reasoning, cross-language alignment). No LLM API, no embedding model, no vector database.

---

## 1. What It Can Do

### Core Capabilities

| Capability | Implementation | Effect |
|------|---------|------------|
| Auto message recording | Gateway Hook -> record | Every user/assistant message auto-saved |
| Auto importance scoring | 9-dim regex (0.02-1.00) | Key decisions boosted, chatter demoted |
| 4-layer memory | raw -> working -> medium -> long | Auto-distillation from chat to long-term knowledge |
| Auto-summarization | consolidate (3-condition trigger) | Every 30min, conversations -> structured summaries |
| Topic continuation | context (>12h + semantic overlap + dialogue mode) | "Last time we discussed X, welcome back" |
| Memory echo | recall (high-imp auto-search) | Auto-links to past topics |
| Long-term distillation | 22:30 cron -> proposals -> agent review | MEMORY.md auto-maintained |
| Multi-mode search | keyword/semantic/hybrid/recent/history | Exact, fuzzy, recent-biased, history-biased |
| Semantic dedup | dedupeResults() | No duplicate search results |
| Memory QA | qa command (context + profile + search + MEMORY.md) | Natural language -> structured sources |
| Bilingual tokenizer | tokenize() (2-gram + word extraction) | Chinese + English search |
| Write batching | batch 10 msgs or 30s -> sync/reindex | JSONL real-time, heavy ops batched |
| Time-aware decay | time.js module | Per-type half-life (7-90 days), relative anchors, conflict resolution |
| Refusal detection | refusal.js module | Score distribution check, 3-tier confidence, keyword coincidence filter |
| Query rewrite | rewrite.js module | Session context + post-retrieval expansion + safety valve |
| Multi-hop reasoning | multihop.js module | Decomposition + per-hop verification + evidence chains |
| Cross-language | crosslang.js module | 100+ bilingual entity map + auto-expansion |

### Auxiliary

| Capability | Description |
|------|------|
| Todo management | Extract from conversations, Web UI |
| User profile | Auto-maintain tech stack/preferences/style |
| Daily/weekly reports | Statistical summaries |
| Recycle bin | 15-day retention, restore/purge |
| Web Console | http://127.0.0.1:8765 file browser/search/management |
| Auto-archiving | >30d raw -> gzip, >180d medium -> gzip |
| Sensitive info redaction | API key/password/private key auto-filter |
| Git-friendly | All memories in plain Markdown/JSONL, diff/version-control |

---

## 2. Architecture

```
User Message
  |
Gateway Hook (memory-recorder)
  |
record -> sanitize -> compress -> tokenize() -> batch counter
  |                          |
imp scoring (9-dim regex)   JSONL real-time write
  |                          |
batch flush (10msgs/30s)    -> syncTranscripts
  |                          -> reindex
recall auto-trigger          -> autoConsolidate (30min throttle)
  |
working memory refresh
  |
consolidate -> topic tags + quality self-assessment -> medium summary blocks
  |
nightly distill (22:30) -> proposals -> agent review -> MEMORY.md
```

### v4.5-Pro Module Pipeline

```
cmdQA(query)
  |
  +-> crosslang.js: bilingual entity expansion
  +-> multihop.js: sub-question decomposition
  +-> rewrite.js: session-context rewrite
  |
  +-> search (keyword + MEMORY.md full-text)
  |
  +-> refusal.js: score distribution check -> refuse if unreliable
  +-> time.js: per-result staleness marking
  |
  -> structured answer with sources + confidence + refusal info
```

### Four-Layer Memory

| Layer | Path | Format | Retention | Purpose |
|---|------|---------|:---:|------|
| Short: Chat Logs | `memory/short/raw/YYYY-MM-DD.jsonl` | JSONL (ts, role, text, imp) | 30d -> gzip | Raw message stream |
| Short: Workbench | `memory/short/working/current.json` | JSON (task, decisions, questions, facts) | real-time | Current context |
| Short: Injectable | `memory/short/inject/YYYY-MM-DD.json` | JSON (summary, topics, facts, decisions) | 7d | Agent startup injection |
| Medium: Summary | `memory/medium/YYYY-MM-DD.md` | Markdown (timestamp + topic tags + quality) | 180d -> gzip | Daily archive |
| Long: Global Knowledge | `MEMORY.md` | Markdown (prefs/facts/projects/events) | permanent | Agent long context |
| Index | `memory/index/index.md` | Markdown (one topic per line) | permanent | Search acceleration |
| User Profile | `memory/profile.md` | Markdown (prefs/tech stack/style) | permanent | Personalization |
| Growth Log | `memory/growth.md` | Markdown (incremental long-term memory log) | permanent | Memory evolution tracking |

---

## 3. imp Scoring: 9-Dimensional Regex

**Core differentiator: Zero neural networks — pure regex importance assessment.**

```
base: user=0.40, assistant=0.30
---
IMP_INSTRUCT  +0.25  help/give/please/do/change/write/implement/fix/deploy/continue/then
IMP_PREF      +0.35  like/dislike/must/cannot/principle/bottom-line/style/habit
IMP_DECISION  +0.30  decide/confirm/conclusion/select/adopt/final-plan/agreed
IMP_TODO      +0.25  todo/next-step/plan/remind/deadline/tomorrow
IMP_TECH      +0.12  optimize/refactor/architecture/code/bug/performance/security
IMP_FACT      +0.10  number+unit (CNY/day/hour/month/year/%)
---
Fix1: System/chitchat downgrade
  SYSTEM -> 0.02  heartbeat/system notification/continuation
  CHITCHAT -> 0.10  ok/thanks/roger
---
Fix2: Core principle weighting +0.15
  constraint words + domain words simultaneously
---
Fix3: Long-form directional -> 0.75
  text >100 chars + (priority/direction/architecture/positioning/evaluate/competitor)
---
Fix4: Dual-keyword combo +0.20
  5 cross-domain pairs (deploy+model, modify+architecture, performance+must, cut+feature, compare+solution)
---
Fix5: Negation/correction +0.25
  (not/wrong/incorrect/try-another-approach/start-over/overturn/cancel)
---
Fix6: Comparative decision +0.18
  comparison words + object words simultaneously
---
Fix7: Commitment/promise +0.35
  (I-guarantee/I-promise/I-swear/from-now-on/remembered/next-time-for-sure)
  Strong commitments (swear/guarantee/never-forget) -> directly to 0.90
---
Cap: 1.00
```

### Measured Results

| Input | Old imp | v4.5-Pro imp | Triggered Rules |
|------|:---:|:---:|------|
| "Don't use the previous approach, performance is bad, try another way" | ~0.65 | **1.00** | PREF+negation+TECH |
| "Must guarantee search latency under 50ms, hard requirement" | ~0.70 | **0.95** | PREF+TECH+combo |
| "Compared 3 solutions, Mnemosyne is simpler and faster than Mem0" | ~0.70 | **0.90** | TECH+combo+compare |
| "I promise to sync to memory-engine every time from now on" | ~0.60 | **0.90** | Fix7 strong commitment |
| "Nice weather today" | 0.40 | 0.40 | base only (no impact) |

---

## 4. Search: 5 Parallel Modes

| Mode | Algorithm | Weight Strategy | Latency | Use Case |
|------|------|---------|:---:|------|
| keyword | Full-text + bilingual 2-gram tokenizer | 4-layer weighted | ~42ms | Exact search |
| semantic | Local bigram+trigram vectors (512-dim) | Cosine similarity | ~120ms | Fuzzy matching |
| hybrid | keyword + semantic fusion | dedupeResults | ~130ms | Recommended default |
| recent | Same as above | Bias to short-term (working 25%, raw 25%) | ~120ms | Recent focus |
| history | Same as above | Bias to long-term (long 45%, idx 20%) | ~120ms | Historical lookup |

---

## 5. Modules (v4.5-Pro)

### time.js — Dynamic Half-Life Decay

| Category | Half-Life | Examples |
|------|:---:|------|
| job, location, project, status | 7-14 days | "work at X", "live in Y", "working on Z" |
| preference, habit, style | 60-90 days | "prefer A over B", "coding style: functional" |
| birthday, history, identity | infinite | "born on X", "name is Y" |

Functions: `getHalfLife()`, `relativeTime()`, `markStale()`, `resolveConflicts()`

### refusal.js — Abstention Front-Loading

Three-tier system:
1. **No results** -> high-confidence refusal
2. **Top score below P10 threshold + low gap** -> likely noise, refuse
3. **Keyword hit but semantic mismatch** -> low-confidence warning with partial results

Functions: `shouldRefuse()`, `scoreDistributionCheck()`

### rewrite.js — Session Query Rewrite

- Pronoun resolution from session context (stateless, no persona stored)
- Abbreviation expansion
- Post-retrieval keyword expansion
- Safety valve: all rewrites validated against original query

Functions: `feedSessionMessage()`, `extractSessionContext()`, `rewriteQuery()`, `validateRewrite()`

### multihop.js — Multi-Hop Reasoning

- 6 decomposition patterns for complex questions
- Per-hop verification (entity overlap check)
- Evidence chain completeness tracking
- Automatic stop on drift or max hops

Functions: `decompose()`, `verifyHop()`, `buildEvidenceChain()`, `shouldStop()`

### crosslang.js — Cross-Language Alignment

- 100+ bilingual entity mapping (English <-> Chinese)
- Automatic bidirectional query expansion
- Output language constraints
- Equivalence checking for evaluation

Functions: `expandCrossLang()`, `getOutputConstraint()`, `isEquivalent()`

---

## 6. Limitations (Honest)

| Limitation | Reason | Alternative |
|------|------|------|
| No natural language answer generation | No LLM | External LLM for synthesis |
| No cross-language semantic search | No embedding model | Dictionary-based expansion only |
| No multi-hop deep reasoning | No neural network | Decomposition only; external LLM needed |
| Write throughput 2 docs/s | Full pipeline per record | Async queue (planned) |
| LoCoMo R@K 0% | Returns memory content, not document IDs | Memory-Native Protocol recommended |

---

## 7. 20 Commands

| Command | Usage |
|------|------|
| `record` | `--role user|assistant --text "..."` |
| `sync` | `[--quick]` |
| `status` | — |
| `enable/disable` | — |
| `init` | — |
| `search` | `--query "..." --mode keyword|hybrid|semantic|recent|history` |
| `qa` | `--query "..."` (Pro: with rewrite + refusal + multihop + time + crosslang) |
| `context` | — |
| `recall` | `--query "..."` |
| `report` | `[--weekly]` |
| `profile` | `[--update]` |
| `distill-proposals` | `--list|--apply <id>` |
| `consolidate` | `[--force|--check|--retag]` |
| `todos` | `[--add|--done <id>]` |
| `embed` | `[--force]` |
| `reindex` | — |
| `cleanup` | `[--confirm]` |
| `health` | — |
| `stats` | — |

---

## 8. Benchmark Quick Reference

### Search Latency (x86_64 VM / Ubuntu 24.04 / Node v22)

| Mode | avg | P50 | Hits/q |
|------|-----|-----|:---:|
| keyword | 42ms | 43ms | 16.7 |
| hybrid | 130ms | 131ms | 19.3 |

### vs AgentMemory 0.4.8

| Metric | AgentMemory | v4.5-Pro | Advantage |
|------|:---:|:---:|:---:|
| Search hybrid | 164ms | **130ms** | 1.26x |
| RAM overhead | +114MB | **0MB** | -- |
| Model download | 79MB | **0MB** | -- |
| Install | pip+download | **bash install.sh** | -- |
| Write | 4 d/s | **2 d/s** | 0.5x |

### vs SQLite FTS5 (keyword baseline)

| Metric | SQLite FTS5 | v4.5-Pro |
|------|:---:|:---:|
| Search | <1ms | 42ms |
| Memory features | 0 | 17 capabilities + 5 modules |
| Zero deps | Yes | Yes |

---

## 9. Version History

| Version | Date | Lines | Cmds | Key Difference |
|------|------|------|:---:|------|
| v1 | 08-05 | 2,447 | 28 | 4-layer arch · semantic index · Web UI |
| v2 | 08-06 | 2,981 | 36 | config.json · recycle bin · consolidate · nightly distill |
| v3 | 08-06 | 3,093 | 36 | CSRF · truncation protection · IMP_TECH · hook detection |
| v3-lite | 08-06 | 2,975 | 14 | Stripped version |
| v4 | 08-07 | 3,751 | 44 | Memory echo · topic continuation · heatmap · time machine |
| v4-pro | 08-07 | 3,768 | 44 | 251 calibrations · 5-fold CV · evaluation panel |
| v4.5 | 08-08 | 3,250 | 20 | -56% cmds · 9-dim imp · QA · tokenizer · batching |
| v4.5-bilingual | 08-08 | 3,255 | 20 | English UI · bilingual tokenizer |
| **v4.5-Pro** | **08-08** | **3,291** | **20** | **5 pluggable modules** · time-aware · refusal · rewrite · multihop · crosslang |

---

*Mnemosyne v4.5-Pro · 2026-08-08 · 3,291 lines · 20 commands · 5 modules (18.6KB) · Zero-NN · Zero deps · Zero models · Zero API keys*

---

## 中文完整说明

### 一句话定义

Mnemosyne v4.5-Pro 是一个纯本地、零神经网络依赖的认知记忆引擎，配备 5 个可插拔模块（时间感知衰减、拒答前置、查询改写、多跳推理、跨语言对齐）。无需 LLM API、无需 embedding 模型、无需向量数据库。

### 核心能力（19 项）

消息自动记录 · 9维 imp 智能评分 · 四层分层记忆 · 自动摘要整合 · 话题续接 · 记忆回响 · 长期记忆提炼 · 5 模式搜索 · 语义去重 · Memory QA · 双语分词 · 写入批量化 · 时间感知衰减 · 拒答检测 · 查询改写 · 多跳推理 · 跨语言对齐 · 待办管理 · 用户画像

### 时间感知（time.js）

按信息类型自适应衰减：工作/地点 7 天半衰期，偏好/习惯 60-90 天，生日/历史不衰减。冲突记录自动标记 [当前有效]/[已被取代]。

### 拒答前置（refusal.js）

检索层直接判断可靠性：分数低于历史 P10 且 Top-1/Top-2 差距小 → 高置信拒答。关键词命中但无语义匹配 → 低置信警告。

### 查询改写（rewrite.js）

会话级动态上下文提取（不持久化画像），代词消解，缩写展开，检索后关键词扩展，所有改写经安全阀校验。

### 多跳推理（multihop.js）

6 种分解模式，逐跳实体重叠验证，漂移自动终止，证据链完整性检查。

### 跨语言（crosslang.js）

100+ 中英实体映射，自动双向查询扩展，输出语言约束，等价判断。

### 20 命令

record · sync · status · enable/disable · init · search(5模式) · qa · context · recall · report · profile · distill-proposals · consolidate · todos · embed · reindex · cleanup · health · stats

### 性能

keyword 42ms / hybrid 130ms · vs AgentMemory 1.3× 快 · RAM 0MB vs +114MB · 写入 2 docs/s（管道批量化进行中）

*Mnemosyne v4.5-Pro · 2026-08-08 · 3,291行 · 20命令 · 5模块(18.6KB) · Zero-NN · 零依赖*
