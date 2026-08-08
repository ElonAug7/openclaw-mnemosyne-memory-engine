# Mnemosyne — Zero-Dependency Local Memory Engine for OpenClaw

> 271KB runtime · No LLM API · No Vector DB · Pure Markdown · Git-Friendly

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 🎯 What It Does

Mnemosyne solves the **memory loss and context degradation** problem in OpenClaw conversations — without adding any external dependencies.

- **Zero token cost** — No LLM API calls for memory retrieval; everything runs locally with TF-IDF + KNN
- **Full data ownership** — All memories stored as plain Markdown files on your machine; nothing leaves your device
- **Tiny footprint** — 271KB runtime, no vector database, no embedding model, no Docker required
- **Git-native** — Memory files are version-controllable, diffable, and human-readable
- **Rich feature set** — Heartbeat heatmap, time-machine recall, user profiling, 7-way parallel search, and more

## 🖥️ Demo / Screenshots

<img width="3200" height="1782" alt="联想截图_20260807175504" src="https://github.com/user-attachments/assets/f229feef-0227-4f75-a182-f476cb0835cc" />
<img width="3200" height="1782" alt="联想截图_20260807180850" src="https://github.com/user-attachments/assets/a6a471d5-d633-4601-9cda-bad5f2c2bab2" />


## ⚡ Quick Start

```bash
git clone https://github.com/ElonAug7/Project-Mnemosyne-for-openclaw-.git
cp -r → bash install.sh
open http://localhost:8765

## 📊 How It Compares

| | **Mnemosyne v4 Pro** | Mem0 | Zep | LangChain Memory |
|---|---|---|---|---|
| **LLM API Required** | ❌ None | ✅ Yes | ✅ Yes | ✅ Yes |
| **Vector Database** | ❌ None | ✅ Required | ✅ Required | ✅ Required |
| **Storage Format** | Plain Markdown | Proprietary DB | PostgreSQL + Vector | Configurable |
| **Git-Friendly** | ✅ Native | ❌ | ❌ | ❌ |
| **Data Ownership** | ✅ 100% Local Files | ☁️ Cloud / Self-host | ☁️ Cloud / Self-host | Depends |
| **Runtime Size** | **271KB** | ~50MB+ | ~200MB+ | Varies |
| **Search Latency** | ~55ms | 100-500ms | 100-300ms | Varies |
| **Token Cost per Query** | **$0.00** | $0.001-0.01 | $0.001-0.01 | $0.001-0.01 |
| **Offline Capable** | ✅ Full | ❌ Partial | ❌ Partial | ❌ Partial |
| **Setup Complexity** | `node engine.js init` | Docker + API Keys | Docker + DB + API | Code Integration |

> 💡 **When to choose Mnemosyne:** You want a memory system that costs nothing to run, keeps all data as human-readable files you can `git diff`, and works entirely offline without any external service dependencies.
>
> ⚠️ **When NOT to choose Mnemosyne:** You need cross-user shared memory at scale, or require deep semantic understanding beyond TF-IDF keyword matching.

If you want you get more information please step to MNEMOSYNE-REFERENCE.md

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
