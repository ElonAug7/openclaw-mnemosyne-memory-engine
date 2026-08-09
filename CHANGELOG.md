# Changelog

All notable changes to Mnemosyne.

## [v5.0.0] — Compound-Cue Core (2026-08-09)

### v5 核心升级：复合线索评分模型

基于「复合线索理论」(Compound-Cue Theory) 对检索架构的全面重构。
不做加法做减法：把 imp + time decay + keyword + hit frequency 融为单次评分，替代旧版多路并行 merge。

### Added
- **复合线索评分模型** (`compoundScore()`): 统一公式 `α·imp + β·recency + γ·keyword + δ·hit_frequency`
- **time.js 正式接入搜索排序**: 半衰期衰减 (`2^(-age/halfLife)`) 生效于每条搜索结果
- **命中频率追踪** (hit-frequency.json): 忆阻器式动态权重，被多次命中的记忆自动加权
- **用户自定义标签**: `record --tags "tag1,tag2"` 支持，标签匹配权重 ×3
- **性能探查器**: `--profile` 开关，输出各阶段耗时分析 (P50/P99)
- **内存热区缓存**: LRU 缓存最近 7 天数据，消除重复文件 I/O
- **语义异步化**: keyword-first 策略 — 关键词结果先出 (15ms)，语义 200ms 内后补重排

### Changed
- `searchLayer()`: 全面改用缓存读文件 (`cachedReadFile`/`cachedReadDir`)
- `multiPathSearch()`: 从「并行搜索 + merge」重构为「keyword-first + compound scoring + semantic async fire-and-forget」
- `cmdStatus()`: 新增 cache 统计、hitFreq 统计、_v5 特性标记
- 版本号统一为 `VERSION = 'v5.0.0'`

### Fixed
- searchLayer 文件 I/O 瓶颈：13+ 次 sync readFileSync → ~3 次（首次缓存 miss 后全部命中）

### Design
- 零依赖、零新增行数（重构简化代码）
- 向后兼容：所有旧 API 不变，tags 字段可选

---

## [v4.5-Pro] — Modular Architecture (2026-08-08)

### Added
- **5 independent modules** (time.js, refusal.js, rewrite.js, multihop.js, crosslang.js)
- Time-aware: dynamic half-life by information type (7-90 days), relative time anchors, conflict resolution
- Refusal front-loading: score distribution detection, 3-tier confidence, keyword coincidence detection
- Query rewrite: session-level dynamic context (stateless), post-retrieval expansion, rewrite safety valve
- Multi-hop reasoning: atomic sub-question decomposition, per-hop verification, evidence chain completeness
- Cross-language: 100+ bilingual entity mapping, automatic query expansion, output language constraints

### Design
- Modular: each feature is an independent `modules/*.js` file, hot-swappable
- Zero new dependencies
- Engine +41 lines (3,291 total), 18.6KB of module code

---


## [v4.5-bilingual] — English Edition (2026-08-08)

### Changed
- **UI fully translated to English** — all labels, buttons, stats, layer names
- **Bilingual tokenizer** — `tokenize()` handles Chinese 2-gram + English word extraction + bilingual stopwords
- **Layer names** — API and UI both use English (Workbench, Daily, Chat Logs, Index, Medium, Long-term, Todos, Other)
- Engine core unchanged (same imp scoring, same 5-mode search, same consolidate pipeline)

### Benchmarks vs v4.5 (Chinese)
- Search quality: English queries return comparable results to Chinese queries on same concepts
- Latency: No measurable difference (tokenizer change is O(n) with same complexity)
- Engine size: 3,255 lines (same as v4.5)

---


---

## [v4.5] — The Lean Engine (2026-08-08)

> Cut 56% of commands. Same performance. Not just trimming — rethinking what matters.

### Added
- **P0: 9-dimensional imp scoring** — up from 7 dimensions
  - Fix 4: Dual-keyword combo detection (+0.20). 5 cross-domain pairs (e.g., "deploy" + "model").
  - Fix 5: Negation/correction detection (+0.25). "No, that's wrong" / "try another approach".
  - Fix 6: Comparative decision detection (+0.18). "A is better than B" patterns.
  - Fix 7: Commitment/promise detection (+0.35, strong promises → 0.90). "I guarantee", "I swear", "never again forget".
- **P0: Memory QA command** — `qa --query "..."` with 4-way recall (context + profile + search + MEMORY.md)
- **P1: Search result dedup** — `dedupeResults()` removes near-duplicate results from same file
- **P2: Topic continuation v2** — semantic overlap detection between current and previous topics, plus 4-mode dialogue classification (instruction/question/confirmation/discussion)
- **P2: Chinese tokenizer** — `tokenizeChinese()` 2-gram segmentation + stopword filtering, zero extra deps
- **P1: Write batching** — record batches 10 messages or 30s before triggering sync/reindex/consolidate
- **Memory-Native Evaluation Protocol v1.0** — 80 queries across 4 types (cross-session / temporal / conflict / profile) with 5-dim scoring (EM/F1/TA/RB/PC)

### Changed
- **44 → 20 commands** (-55%). Engine 3,768 → 3,250 lines (-14%).
- **Web UI streamlined**: removed workbench widget, floating buttons, heatmap, time machine, growth log, tool group, eval panel (:8766)
- **install.sh fixed** (all versions): auto-rename now targets `WORKSPACE/tools/memory-engine` instead of script parent dir
- **Reference manual rewritten**: 455-line MNEMOSYNE-REFERENCE.md covering capabilities, architecture, limitations, and honest comparison vs 6 systems

### Removed
`time-travel` `stale` `conflict` `ask` `timeline` `sessions` `content-index` `permission` `config` `devlog` `signal` `save` `export` `backup` `backup-log` `version` `version-history` `version-diff` `record-raw` `reindex-all` `imp-calibrate` `distill-reject` `save-distill`

### Benchmarks
- **6-system comparison**: SQLite FTS5 <1ms · v4.5 42ms · ChromaDB 158ms · AgentMemory 160ms · Mem0 ❌
- **vs AgentMemory 0.4.8**: keyword 42ms (3.9× faster), RAM 0MB vs +105MB, zero model download vs 79MB
- **LoCoMo T0** (30 docs, 20 QA): 8 systems tested, honest R@K results documented with methodological caveats

### Roadmap
- **Line 1**: Zero-NN + Spreading Activation (pure math, zero deps)
- **Line 2**: imp → TF-IDF → activation → local embedding → local LLM (mainstream pipeline with imp noise filter)

---

## [v4-pro] — Evaluation-Ready (2026-08-07)

### Added
- 251 manual imp calibration samples with TF-IDF KNN + 5-fold CV (MAE 0.168)
- Standalone evaluation panel at :8766 (bench.js + imp-evaluate.js + locomo-adapter.js)
- System message auto-detection (heartbeat/error/continuation → imp 0.02)
- LoCoMo Composite score: 67/100

---

## [v4] — Memory Echo (2026-08-07)

### Added
- **Context**: topic continuation — detects >12h gaps, greets with "Last time we discussed X, welcome back"
- **Recall**: auto-trigger on high-imp user messages (imp≥0.4, len>20) → writes `last-recall.json`
- **Topic tags**: #decision #planning #tech auto-labeled on summary blocks
- **Quality self-assessment**: each block gets `<!-- quality: ✅ -->` or missing-category notes
- **Dialogue mode detection**: instruction/question/confirmation/discussion
- **Knowledge gap tracking**: "I don't know / let me check" patterns
- **Heartbeat heatmap**: 30-day activity visualization
- **Time Machine**: MEMORY.md version browsing and restore

---

## [v3] — Security Hardening (2026-08-06)

### Added
- POST+CSRF protection on all write endpoints
- Truncation protection: imp≥0.7 messages backed up to medium before truncation
- IMP_TECH scoring dimension (optimize/refactor/architecture/bug/performance/security)
- Hook failure detection with compensation scanning

### Changed
- Todo extraction limited to medium summaries and manual adds (reduced noise)

---

## [v3-lite] — Stripped (2026-08-06)

### Removed
- Version management, Git backup, permission control, distill review, manual calibration, record-raw toggle, content index, dev log, signal. 14 commands, core pipeline intact.

---

## [v2] — User Experience (2026-08-06)

### Added
- Runtime config via `config.json` (retention/thresholds/weights)
- Recycle bin (15-day retention, restore/purge)
- Suggested cleanup for expired files
- **Consolidate**: auto-writes medium-term summary blocks (triggered by message count, imp threshold, or imp sum)
- **Nightly distill**: 22:30 cron auto-extracts long-term memory proposals

---

## [v1] — Initial Release (2026-08-05→06)

### Added
- **4-layer memory architecture**: index → short(raw/working/inject) → medium → long
- **Semantic index**: local bigram+trigram vectors (512-dim), no external embedding API
- **7-way parallel search**: 5 modes × 7 channel weights (keyword/semantic/hybrid/recent/history)
- **Web Console** at :8765: file browser, Markdown render, JSONL chat bubbles, search
- **Gateway Hook**: auto-records all messages with imp scoring
- **Portable install**: Linux systemd + macOS launchd, zero hardcoded paths
- Named **Mnemosyne** — after the Greek goddess of memory, mother of the Muses
