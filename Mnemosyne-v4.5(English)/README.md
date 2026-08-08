# 🦞 Mnemosyne v4.5 (bilingual) — Lean Memory Engine

> v4 Pro streamlined: 44→20 commands · Zero-NN · Zero deps · Same performance, 14% less code

## 🎯 v4.5 vs v4 Pro

| Dimension | v4 Pro | v4.5 |
|------|--------|------|
| CLI Commands | 44 | 20 (-55%) |
| Engine Lines | 3,768 | 3,250 (-14%) |
| Web UI Features | 15+ | 8 |
| Search Modes | 5 | 5 (all preserved) |
| imp Scoring | 7-dim regex | **9-dim regex** (P0 enhanced) |
| Search (keyword) | ~40ms | ~42ms |
| Search (hybrid) | ~120ms | ~130ms |
| Composite Score | 76/100 | 76/100 |

## vs AgentMemory (fair comparison)

| Metric | AgentMemory 0.4.8 | Mnemosyne v4.5 |
|------|:---:|:---:|
| Search (hybrid) | 164ms | **130ms** (1.3×) |
| Search (keyword) | unsupported | **42ms** |
| RAM overhead | +2MB | **0MB** |
| Model download | 79MB ONNX | **0MB** |
| Install | pip + download | **bash install.sh** |

## 📦 Install

### Method 1 (recommended)
```bash
cp -r Mnemosyne-v4.5 ~/.openclaw/workspace/tools/
cd ~/.openclaw/workspace/tools/Mnemosyne-v4.5 && bash install.sh
openclaw gateway restart
```

### Method 2: One-click
```bash
bash /path/to/Mnemosyne-v4.5/install.sh
```

Open `http://127.0.0.1:8765`

## ✅ 20 Commands

`record` · `sync` · `status` · `enable/disable` · `init` · `search` (5 modes) · `consolidate` · `context` · `recall` · `report` · `profile` · `distill-proposals` · `embed` · `reindex` · `todos` · `cleanup` · `health` · `stats` · `qa`

## ✂️ Removed (25 commands)

time-travel · stale · conflict · ask · timeline · sessions · content-index · permission · config · devlog · signal · save · export · backup* · version* · record-raw · reindex-all · imp-calibrate · distill-reject · save-distill

## 📖 Detailed Manual

See `MNEMOSYNE-REFERENCE.md`

---

## 📜 Changelog

See `CHANGELOG.md` for the full version history from v1 through v4.5 (bilingual).
