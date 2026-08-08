# 🦞 Mnemosyne v4.5-Pro — Lean Memory Engine

> v4 Pro streamlined: 44→20 commands · Zero-NN · Zero deps · Same performance, 14% less code

## What's New in v4.5-Pro

**5 independent modules** (Phase 1-4 of the Pro roadmap):

| Module | Function |
|--------|----------|
| `time.js` | Dynamic half-life decay (7-90 days per info type), relative time anchors, conflict resolution |
| `refusal.js` | Abstention front-loading — score distribution detection, 3-tier confidence, keyword coincidence filtering |
| `rewrite.js` | Session-level dynamic query rewrite (stateless), post-retrieval expansion, rewrite safety valve |
| `multihop.js` | Atomic sub-question decomposition, per-hop verification, evidence chain completeness |
| `crosslang.js` | 100+ bilingual entity mapping, automatic query expansion, output language constraints |

## 🎯 v4.5-Pro vs v4 Pro

| Dimension | v4 Pro | v4.5-Pro |
|------|--------|------|
| CLI Commands | 44 | 20 (-55%) |
| Engine Lines | 3,768 | 3,291 (-13%) |
| Modules | 0 | 5 (18.6KB) |
| Search Modes | 5 | 5 (all preserved) |
| imp Scoring | 7-dim regex | 9-dim regex |
| Time Awareness | None | Per-type half-life + relative time |
| Refusal/Abstention | T2 only (LLM) | T0 also (retrieval layer) |
| Multi-hop | Keyword only | Decomposition + verification |
| Cross-language | Token-level only | Entity-level mapping |

## vs AgentMemory (fair comparison)

| Metric | AgentMemory 0.4.8 | Mnemosyne v4.5-Pro |
|------|:---:|:---:|
| Search (hybrid) | 164ms | **130ms** (1.3×) |
| Search (keyword) | unsupported | **42ms** |
| RAM overhead | +2MB | **0MB** |
| Model download | 79MB ONNX | **0MB** |
| Install | pip + download | **bash install.sh** |
| Time decay | No | **Per-type half-life** |
| Query rewrite | No | **Session-level dynamic** |
| Cross-language | Embedding only | **Dictionary + entity map** |

## 📦 Install

```bash
cp -r Mnemosyne-v4.5 ~/.openclaw/workspace/tools/
cd ~/.openclaw/workspace/tools/Mnemosyne-v4.5 && bash install.sh
openclaw gateway restart
```

Open `http://127.0.0.1:8765`

## Architecture

```
modules/time.js      ──→ cmdQA: staleness marking, conflict resolution
modules/refusal.js   ──→ cmdQA: abstention check, confidence tiers
modules/rewrite.js   ──→ cmdRecord: session feeding → cmdQA: query rewrite
modules/multihop.js  ──→ cmdQA: question decomposition → per-hop verification
modules/crosslang.js ──→ cmdQA: bilingual query expansion
```

Each module is **hot-swappable**: remove the file, engine keeps running. Zero new dependencies.

## ✅ 20 Commands

`record` · `sync` · `status` · `enable/disable` · `init` · `search` (5 modes) · `consolidate` · `context` · `recall` · `report` · `profile` · `distill-proposals` · `embed` · `reindex` · `todos` · `cleanup` · `health` · `stats` · `qa`

## 📖 Detailed Manual

See `MNEMOSYNE-REFERENCE.md` and `CHANGELOG.md`

---

## 中文摘要

Mnemosyne v4.5-Pro 是一个纯本地、零神经网络依赖的认知记忆引擎。v4-pro 精简版：44→20 命令，引擎 3,768→3,291 行。v4.5-Pro 新增 5 个可插拔模块：

| 模块 | 功能 |
|------|------|
| time.js | 按信息类型动态半衰期衰减（7-90天）、相对时间锚点、冲突版本标记 |
| refusal.js | 拒答前置——分数分布异常检测、三级置信度、关键词巧合过滤 |
| rewrite.js | 会话级动态查询改写（无状态）、检索后扩展、改写安全阀 |
| multihop.js | 原子子问题分解、逐跳验证、证据链完整性 |
| crosslang.js | 100+中英实体双向映射、自动查询扩展 |

**安装:** `bash install.sh` · **Web:** `http://127.0.0.1:8765` · **零依赖 · 零模型 · 零 API key**
