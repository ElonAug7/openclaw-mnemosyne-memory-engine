# 🦞 Mnemosyne v4.5 (bilingual) Technical Reference

> 3,250 lines · 20 commands · Zero-NN · Zero deps · Zero models · bash install.sh

---

## 0. One-Line Definition

Mnemosyne is a **purely local, zero-neural-network cognitive memory engine**.Without any LLM API, embedding model, or vector database，it uses TF-IDF keyword matching + 9-dim regex importance scoring + 4-layer memory architecture to deliver automatic message recording, intelligent scoring, auto-summarization, topic continuation, and long-term memory distillation.

---

## 1. What It Can Do

### ✅ Core Capabilities

| Capability | Implementation | User-Visible Effect | — |------|---------|------------| — | auto message recording | Gateway Hook → record | every user/assistant message auto-saved | — | auto importance scoring | 9-dim regex scoring (0.02–1.00) | key decisions auto-boosted, chatter auto-demoted | — | 4-layer memory | raw → working → medium → long | auto-distillation from raw chat to long-term knowledge | — | auto-summary consolidation | consolidate
 ↓
record → sanitize → compress → [P2: tokenizeChinese] → [P1: batch counter]
 ↓ ↓
imp JSONL real-time write
 ↓ ↓
batch flush → syncTranscripts
 ↓ → reindex
recall auto-trigger → autoConsolidate 
 ↓
working 
 ↓
consolidate → + → medium 
 ↓
nightly distill (22:30) → proposals → agent → MEMORY.md
```

### 2.2 Four-Layer Memory

| Layer | Path | Format | Retention | Purpose | — |---|------|---------|:---:|------| — | Short-term · Chat Logs | `memory/short/raw/YYYY-MM-DD.jsonl` | JSONL (ts, role, text, imp) | 30→gzip | raw message stream | — | Short-term · Workbench | `memory/short/working/current.json` | JSON (task, decisions, questions, facts) | real-time | current context | — | Short-term · Injectable | `memory/short/inject/YYYY-MM-DD.json` | JSON (summary, topics, facts, decisions) | 7 | injected at agent startup | — | Medium-term · Summary | `memory/medium/YYYY-MM-DD.md` | Markdown (### timestamp + topic tags + quality self-assessment) | 180→gzip | daily archive | — | Long-term · Global Knowledge | `MEMORY.md` | Markdown | — | agent long context | — | Index | `memory/index/index.md` | Markdown (one topic per line + keywords) | — | search acceleration | — | User Profile | `memory/profile.md` | Markdown | — | personalization | — | Growth Log | `memory/growth.md` | Markdown (long-term memory incremental log) | — | memory evolution tracking |

### 2.3 imp Scoring: 9-Dimensional Regex

**This is Mnemosyne's core differentiator.** No neural networks pure regex importance scoring.

```
base: user=0.40, assistant=0.30
──────────────────────────────────────
IMP_INSTRUCT +0.25 help/give/please/do/change/implement/fix/take/continue/then
IMP_PREF +0.35 like/like/must/cannot/forbidden/principle/bottom line/style
IMP_DECISION +0.30 decide/confirm/conclusion/select/agreed
IMP_TODO +0.25 todo/todo/next step/deadline
IMP_TECH +0.12 optimize/architecture/code/bug/performance/security
IMP_FACT +0.10 +
──────────────────────────────────────
Fix 1: system/
 SYSTEM → 0.02 /system/
 CHITCHAT → 0.10 haha/ok/thanks/roger
──────────────────────────────────────
Fix 2: +0.15
 
 + 
──────────────────────────────────────
Fix 3: → 0.75
 >100 + 
──────────────────────────────────────
Fix 4 (v4.5): +0.20
 deploy| + | — |system
 change|refactor + architecture| — |
 performance| + must| — |
 cut|streamline + feature| — |module
 compare|evaluate + solution|system|
──────────────────────────────────────
Fix 5 (v4.5): / +0.25
 (not|don't|wrong|incorrect|try another approach|start over|overturn)
──────────────────────────────────────
Fix 6 (v4.5): compare +0.18
 
 + 
──────────────────────────────────────
Fix 7 (v4.5): / +0.35
 (next time for sure|I guarantee|I promise|I swear|from now on|remembered)
 → 0.90
──────────────────────────────────────
: 1.00
```

**Measured Results:**

| Input | Old imp | v4.5 imp | Triggered Rules | — |------|:---:|:---:|------| — | "don'tsolution，performanceno good，try another approach" | ~0.65 | **1.00** | PREF+negation+TECH | — | "must 50ms，" | ~0.70 | **0.95** | PREF+TECH+combo | — | "comparesolution，Mnemosyne  Mem0 simplerfaster" | ~0.70 | **0.90** | TECH+combo+compare | — | "I guaranteeevery time from nowupdate memory-engine" | ~0.60 | **0.90** | Fix7 | — | "" | 0.40 | 0.40 | base only | cosine similarity | ~120ms | fuzzy matching | — | `hybrid` | keyword + semantic | [P1: dedupeResults ] | ~130ms | **recommended default** | — | `recent` | — | (working 25%, raw 25%) | ~120ms | recent focus | — | `history` | — | (long 45%, idx 20%) | ~120ms | historical lookup |

**7-Channel Weight Distribution (hybrid mode):**

| Recall Channel | Weight | Description | — |---------|:---:|------| — | Workbench | 0.10 | current task, recent decisions | — | Injectable | 0.12 | today's topics, facts | — | Chat Logs | 0.15 | raw message stream

**Four-Way Recall Synthesis:**

```
qa --query ""
 ├─ 1. context: (current task + decisions + facts)
 ├─ 2. profile: User Profile 
 ├─ 3. search: keyword search 
 └─ 4. MEMORY.md: keyword matching 
 → → top-10 + 
```

### 2.6 Automation Pipelines

| Pipeline | Trigger | Output | — |------|---------|------| — | record | (hook) | JSONL + imp + [P1: batch counter] | — | recall auto | imp≥0.4 & len>20 | last-recall.json (hybrid top3) | — | working refresh | imp≥0.5 × 3 | current.json | — | batch flush | [P1] 10 | syncTranscripts + reindex + consolidate | — | consolidate | 3 | medium | JSONL append + Node | write batching， | — | LoCoMo R@K evaluate 0% | ID | systemcompare |

### ⚠️ Partial Capabilities

| Capability | How Far | Limitation | — |------|--------------|------| — | search | P2 2-gram | — | ❌ | ❌ | — | **Chinese tokenizer** | ✅ 2-gram | ❌ | ❌ | ❌ | ❌ | — | **Git-friendly** | ✅  Markdown | ❌ DB | ❌ | ❌ DB | ❌ | — | **** | ✅ 100% | ⚠️ DB | ❌ API | ✅ | ✅ | — | **install** | bash install.sh | pip install + 79MB | pip + API key | pip + 79MB | — |
| **RAM (100 docs)** | **0MB** | +114MB | N/A | +103MB | 0MB | — | **search(keyword)** | **42ms** | — | | — | <1ms | — | **search(semantic)** | **130ms** | 160ms | ❌ | 158ms | — |

### 🔴 Disadvantages

| Dimension | Mnemosyne v4.5 | Competitor | Gap | — |------|:---:|------|:---:| — | **write** | 2 docs/s | AgentMemory 4 d/s, SQLite 10K+ d/s | 8.5×–5000×  | — | ** R@K** | 0% (LoCoMo) | SQLite FTS5 17% | — |
| **** | bigram/trigram | MiniLM-L6 79MB embedding | — |
| **** | 2-gram | jieba/bge embedding | — |
| **search** | ❌ | embedding | architecture | — | **** | ❌  LLM | Mem0 + LLM | architecture | — | **** | ❌ | Mem0 + LLM | Memory QA | — | **** | — | ChromaDB | architecture | — | **Node.js ** | record ~500ms | ~10ms | — |
| **** | 1 | Mem0 10K+ stars | — |

### 📊 Positioning Summary

| Scenario | Mnemosyne v4.5 | When NOT to use | — |------|:---:|------| — | | ✅ **** | — |
| / | ✅ **** | — |
| (RPi) | ✅ **** | — |
| — | ⚠️ |  Mem0 + embedding | — | search | ❌ |  ChromaDB + bge-m3 | — | | ❌ |  Zep / Postgres | — | QA | ⚠️ |  Mem0 + OpenAI |

---

## 5. Complete Command Reference

### Core Pipeline (5)

| Command | Usage | Description | — |------|------|------| — | `record` | `--role user\|assistant --text "..."` | + imp + batch counter | — | `sync` | `[--quick]` | — | Command | Usage | Description | — |------|------|------| — | `search` | `--query "..." --mode keyword\|hybrid\|semantic\|recent\|history` | + dedupeResults |

### Memory QA (v4.5 new)

| Command | Usage | Description | — |------|------|------| — | `qa` | `--query "..."` | context+profile+search+MEMORY.md |

### Memory Echo (5)

| — | | — |------|------| — | `context` | topic continuation++todo | — | `recall --query "..."` | hybrid top3 | — | `report [--weekly]` | / | — | `profile [--update]` | User Profile/update | — | `distill-proposals --list\|--apply <id>` | — |

### Maintenance (7)

| — | | — |------|------| — | `consolidate [--force\|--check\|--retag]` | / | — | `todos [--add\|--done <id>]` | todo management | — | `embed [--force]` | — |
| `reindex` | Index | — | `cleanup [--confirm]` | — |
| `health` | 13 check | — | `stats` | /imp |

---

## 6. Configuration

`memory/engine/config.json`：

```json
{
 "retention": {
 "injectDays": 7,
 "rawDays": 30,
 "mediumDays": 180,
 "trashDays": 15
 },
 "thresholds": {
 "shortSignalTurns": 5,
 "mediumSignalTurns": 20,
 "workingUpdateMsgs": 3,
 "consolidateMinMsgs": 8,
 "consolidateMinHighImp": 2,
 "consolidateMinImpSum": 3.0,
 "consolidateIntervalMs": 1800000,
 "rawMaxChars": 800
 },
 "recordRaw": true,
 "embed": {
 "defaultEnabled": true,
 "maxRecentDays": 30,
 "dims": 512
 },
 "weights": { /*  2.4  */ }
}
```

---

## 7. Web API

`http://127.0.0.1:8765`

### GET

| Endpoint | Description | — |------|------| — | `/api/status` | — |
| `/api/files` | — |
| `/api/file?p=path` | — |
| `/api/download?p=path` | — |
| `/api/search?q=&mode=` | search | — | `/api/todos` | todo | — | `/api/cleanup-suggestions` | — |
| `/api/stats` | — |
| `/api/trash` | — |

### POST

| Endpoint | Description | — |------|------| — | `/api/enable` `/api/disable` | — |
| `/api/delete` | → | — | `/api/trash/restore` | — |
| `/api/trash/purge` | — |
| `/api/todos/add` | todo | — | `/api/todos/done` | todo | — | `/api/save` | — |

---

## 8. Installation

```bash
# 
cp -r Mnemosyne-v4.5 ~/.openclaw/workspace/tools/
cd ~/.openclaw/workspace/tools/Mnemosyne-v4.5 && bash install.sh

# 
bash /path/to/Mnemosyne-v4.5/install.sh

openclaw gateway restart
open http://127.0.0.1:8765
```

：Node.js v18+，OpenClaw CLI。

---

## 9. Benchmark Quick Reference

### search (x86_64 / Ubuntu 24.04 / Node v22)

| — | avg | P50 | /q | — |------|-----|-----|:---:| — | keyword | 42ms | 43ms | 16.7 | — | hybrid | 130ms | 131ms | 19.3 |

### vs AgentMemory 0.4.8 (ChromaDB + all-MiniLM-L6 79MB)

| Metric | AgentMemory | Mnemosyne v4.5 | Advantage | — |------|:---:|:---:|:---:| — | search hybrid | 164ms | **130ms** | 1.26× | — | RAM | +114MB | **0MB** | ∞ | — | | 79MB | **0MB** | ∞ | — | install | pip + | **bash install.sh** | ∞ | — | write | 4 d/s | **2 d/s** | 0.5× |

### Feature Completeness (vs 6 systems)

In the 3-dimension composite score (memory pipeline completeness + zero deps + search speed), v4.5 ranks #1 among all tested systems.SQLite FTS5 wins on pure speed (<1ms). ChromaDB has better semantic understanding (79MB MiniLM). But no other system simultaneously offers: layered memory + intelligent scoring + auto-consolidation + topic continuation + zero dependencies.

---

## 10. Version History

| Version | Date | Lines | Cmds | Key Difference | — |------|------|------|:---:|------| — | v1 | 08-05 | 2,447 | 28 | architecture·Index·7search·Web UI | — | v2 | 08-06 | 2,981 | 36 | configuration···· | — | v3 | 08-06 | 3,093 | 36 | POST+CSRF··todo·hook | — | v3-lite | 08-06 | 2,975 | 14 | streamline | — | v4 | 08-07 | 3,751 | 44 | memory echo·topic continuation·· | — | v4-pro | 08-07 | 3,768 | 44 | 251·5-fold CV·evaluate | — | **v4.5** | **08-08** | **3,250** | **20** | **cut56% + 9imp + P0 QA + P1 write + P2 Chinese tokenizer + Fix7 commitment detection** |

---

*🦞 Mnemosyne v4.5 · 2026-08-08 · 3,250  · 20 · Zero-NN · · ·  API key*
