🦞 Project Mnemosyne — Full Version Comparison Handbook

The Complete Evolution of the Cognitive Memory Engine from v1 to v4

📦 Version Overview
Attribute   v1   v2   v3   v3-lite   v4   v4 Pro
Release Date   2026-08-05   2026-08-06 (AM)   2026-08-06 (PM)   2026-08-06 (Eve)   2026-08-07   2026-08-07 (PM)

Positioning   Functional   User-Friendly   Secure   Lightweight   Intelligent   Precise

Engine LOC   2,447   2,981   3,092   2,975   ~3,600   ~3,600

UI Server LOC   323   457   551   531   ~600   ~600

HTML LOC   413   504   519   504   ~380   ~380

Total LOC   3,183   3,942   4,162   4,010   ~4,580   ~4,580

CLI Commands   28   36   36   14   44   44

API Endpoints   26   29   29   18   32   32

Engine Functions   88   109   110   109   130+   130+

Reference Manual   ❌   ✅ 825 lines   ✅ 1,061 lines   ❌   ✅ 400 lines   ✅ 400 lines

README Size   3.7KB   18KB   16KB   1.8KB   4.0KB   2.0KB

🏆 Final Evaluation Report

Mnemosyne All-Version Final AssessmentLoCoMo + Bench + Engine Metrics · 2026-08-07
Version   Search Latency   Grounded Retrieval   Bench (5-CV)   Health (100)   Lines   Final Score
v1   40ms   38.3   10*   100   2,448   49

v2   49ms   38.3   15*   100   2,982   51

v3   42ms   38.3   20*   80   3,093   46

v3-lite   39ms   38.3   18*   80   2,977   45

v4   49ms   38.3   34   100   3,751   57

v4-pro   55ms   38.3   56 ★   100   3,768   67 ★

LongMemEval — Comprehensive Assessment
Version   Retrieval   Imp   Health   Latency   Lines   Score
v1   75   10   100   42ms   2,448   60.2

v2   75   15   100   36ms   2,982   62.2

v3   75   20   80   38ms   3,093   59.2

v3-lite   75   18   80   36ms   2,977   58.5

v4   75   34   100   40ms   3,751   69.8

v4-pro   75   41   100   40ms   3,768   72.7 ★

🔍 Version Breakdown

v1 — Foundation (2026-08-05)Engine: 2,447 LOC | 28 Commands | 88 Functions | 26 APIs

Core Deliverables:
✅ Four-tier memory architecture (Index / Short-term / Medium-term / Long-term)
✅ Raw message stream logging (JSONL) + importance (imp) scoring
✅ Semantic vector indexing (Local bigram+trigram, 512-dim)
✅ 7-way parallel search (keyword / semantic / hybrid / recent / history)
✅ Web UI Console (File browsing, search, Markdown rendering, chat bubbles)
✅ Text compression storage (Tables→annotations, Code blocks→tags, 800-char truncation)
✅ Portable installation scripts (Linux systemd + macOS launchd)
✅ AGENTS.md / SOUL.md auto-injection mechanism
✅ Gateway Hook automatic message interception

Not Yet Implemented:
❌ No configuration file (all thresholds hardcoded)
❌ No Recycle Bin (delete = permanent)
❌ No cleanup suggestions
❌ No automatic consolidation
❌ No nightly distillation
❌ No POST/CSRF security
❌ No todo noise filtering
❌ No hook failure detection
❌ No version snapshots/backups
❌ No reference manual
❌ Unfriendly layer names (raw/working/inject)

v2 — Experience Layer (2026-08-06 AM)Engine: 2,981 LOC (+534) | 36 Commands (+8) | 109 Functions (+21) | 29 APIs (+3)

Major Additions:
Category   Feature   Description
Configurable   config.json   Centralized management of thresholds/retention/weights; runtime modification via config --set

Auto-Consolidation   consolidate   Auto-check on message save → writes medium-term summary blocks + index when conditions met

Nightly Distillation   nightly distill cron   Reviews daily summaries at 22:30 → generates distill proposals

Recycle Bin   .trash/   Retains deleted items for 15 days; supports restore + permanent delete

Cleanup Suggestions   cleanup suggestions   Auto-detects expired logs/empty dirs/trash expiry; one-click cleanup in Web UI

Friendly Naming   Layer Renaming   raw→Conversation Log / working→Workbench / inject→Daily Summary / medium→Medium Archive / long→Long-term Knowledge

Dev Log   index.md devlog   Auto-appends iteration records on every sync

Reference Manual   MNEMOSYNE-REFERENCE.md   825-line complete technical documentation

Security Enhancement   Proposal Review System   nightly distill → proposals → agent manual --apply / --reject (prevents AI hallucination writes)

Security Enhancement   Process Lock   Atomic creation via wx, auto-release after 2min timeout

Security Enhancement   Cron Staggering   Git Backup 03:00 / Dreaming 03:30 / Distill 22:30

Search Optimization   Gzip Index First   Generates .idx.json during archiving; search queries index before decompression

Search Optimization   Imp Accumulation Trigger   Consolidate triggered by sum(imp) ≥ 3.0 (replaces pure message count)

Search Optimization   Semantic Deduplication   Normalizes text before comparison to resist formatting differences

Imp Enhancement   Manual Calibration   imp-calibrate command to correct scoring

UI Branding   Logo Update   Replaced brain emoji with logo.png, version bump v1→v2

Key Differences (v2 vs v1):
Configuration: Hardcoded → config.json
Memory Consolidation: Manual → Automatic (consolidate + nightly distill)
Deletion: Permanent → Recycle Bin (15-day recovery)
Layer Names: Technical jargon → User-friendly labels
Documentation: None → REFERENCE (825 lines)

v3 — Security Hardening (2026-08-06 PM)Engine: 3,092 LOC (+111) | 36 Commands | 110 Functions (+1) | 29 APIs

Major Additions:
Category   Feature   Description
Web Security   POST Enforcement   14 write endpoints switched from GET→POST to prevent browser prefetch/history/CSRF attacks

Web Security   CSRF Protection   POST requests validate Origin/Referer; allows only 127.0.0.1/localhost

Web Security   Unified safePath   /api/delete + /api/trash/restore both use safePath() whitelist

Data Safety   Proposal Cap   distillCatchUp max 10 items, excess merged — prevents review flooding after offline periods

Data Safety   Truncation Protection   Saves messages with imp≥0.7 to medium layer (## Truncation Protection) before raw truncation

Scoring Enhancement   IMP_TECH   +0.12 bonus for technical/analytical messages (optimization/architecture/code/bug/fix/evaluation/solution)

Quality Enhancement   Todo Noise Filter   isTodoNoise(): Min 8 chars + 5-pattern blacklist

Ops Enhancement   Hook Failure Detection   Health check on lastMessageAt; warns if enabled & >2h without messages

Ops Enhancement   Semantic Index Monitoring   Health check on vector count + freshness

Ops Enhancement   Todo Quality Check   Health scan for noisy todos

Ops Enhancement   Devlog Compression   Cleanup auto-trims devlog to 20 entries

Performance   sync --quick   Quick mode (<1s), core sync only, dedicated for session startup

Documentation   REFERENCE 1061 lines   +236 lines, full rewrite for v3

Key Differences (v3 vs v2):
Web API: GET writes → POST+CSRF (fundamentally eliminates CSRF attack surface)
Scoring: Added technical dimension IMP_TECH; high-imp messages +50%
Todo Quality: From "extract everything" → "filter noise"; 6 todos → 2 valid ones
Health: From fake perfect score 100 (ignoring issues) → Real scoring (13 checks)
Truncation: From simple discard → Protects high-value originals (imp≥0.7 → medium)
Distillation: From uncapped → 10-item cap + overflow merging

v3-lite — Lightweight Edition (2026-08-06 Evening)Engine: 2,975 LOC (-117) | 14 Commands (-22) | 109 Functions (-1) | 18 APIs (-11)Size: 232K (-68K vs v3)

Pruning Principle: Retain core memory pipeline, remove nice-to-have features.

Removed Features:
Category   Removed Items   Impact
Version Mgmt (6)   version / version-history / version-diff / conflict / restore / reindex-all   No snapshots, diffs, conflict detection, or history restore

Backup/Export (2)   backup / export   No Git backup, no tar.gz export

Distill Review (3)   distill-proposals / distill-reject / save-distill   No manual review flow (nightly distill cron suggestions also removed)

Session Auth (2)   sessions / permission   No multi-session view, no permission control

Ops Tools (7)   signal / save / timeline / devlog / config / content-index / imp-calibrate   No manual signals, devlog, config commands, or imp calibration

Record Control (2)   record-raw / save-distill   No raw toggle, no manual distillation

Web UI   Cleanup panel + Trash panel + Layer filter + Auto-refresh + Summary button   Simplified UI: core browse/search/delete only

Retained Core (14 Commands):
record, status, enable/disable, init, sync, consolidate, search, todos, embed, reindex, health, stats, cleanup

Key Differences (v3-lite vs v3):
Commands: 36 → 14 (-61%)
API Endpoints: 29 → 18 (-38%)
Web UI: Full-featured → Core browsing
All v3 security features retained (POST+CSRF, truncation protection, todo filtering, hook detection)
All v3 scoring features retained (IMP_TECH, noise filtering)
Dead code (unused function definitions) retained in engine for future extensibility

v4 — Intelligence Layer (2026-08-07) ★ Current VersionEngine: ~3,600 LOC (+500) | 44 Commands (+8) | 130+ Functions (+20) | 32 APIs (+3)

Design Philosophy: Memory shouldn't just store; it should actively serve. v4 transforms the engine from "passive storage" to "active assistant."

Major Additions (P0+P1 Active Intelligence):
Category   Feature   Description
Memory Echo   context   Session Context: >12h auto topic continuation ("Last time we discussed XX, welcome back") + duplicate topic detection

Memory Echo   recall   Context Flashback: Searches top 3 history before agent reply; hook auto-trigger (imp≥0.4 & len>20)

Memory Echo   report --weekly   Weekly Report: 7-day topic ranking + decision count summary

Memory Echo   profile   User Profile: Maturity + emotional fragments + UI editable

Memory Echo   ask --days N   Structured Q&A: Supports day parameter + full-scan fallback on no results

Growth Tracking   memory/growth.md   Auto-records timeline for every new MEMORY.md entry

Expiry Degradation   stale command   Tracks MEMORY.md entry search hit time; marks >60 days as stale

Conflict Repair   conflict enhancement   Auto-detects contradictory entries → outputs autoResolve suggestions

Major Additions (P2+P3 Precision & Visualization):
Category   Feature   Description
Auto-Tagging   #tech #decision #planning #preference   Auto-appends topic classification tags to summary block titles

Dialogue Mode   instruction/question/confirmation/discussion   Statistics on user sentence patterns; identifies dominant dialogue mode

Knowledge Gaps   knowledge_gaps   Tracks "don't know/check later/not found"; marks areas to fill

Summary Self-Eval   <!-- quality: ✅/missing XX -->   Auto-evaluates completeness for each summary block

Heartbeat Map   30-day Heatmap   UI 💓 button; color depth maps to daily message count

Time Machine   time-travel --list/--restore   Browse/restore MEMORY.md historical versions

Access Log   UI 📜 button   Engine activity stats (turns/messages/consolidations/indexing/todos)

UI Organization   📦 More ▾ Collapsible Group   6 tool buttons tucked into collapsible panel

Profile Editing   UI ✏️ → 💾   Textarea editing + API save endpoint

Refresh Opt.   Workbench uses /api/status   Floating window fetches real-time status instead of reading stale files

New APIs   /api/stats /api/versions /api/version   Stats / Version Browsing / Version Content

v4 Pro — Precision Layer (2026-08-07 PM) ★ RecommendedEngine: ~3,600 LOC | 44 Commands | 130+ Functions | 32 APIsImp: TF-IDF KNN (MAE 0.126) | 251 Calibrated Samples | 5-fold CV

v4 Pro = All v4 Capabilities + Intelligent Imp Scoring

Sole Difference (v4 Pro vs v4):
Dimension   v4   v4 Pro
Imp Scoring   7-dim Regex (MAE 0.185)   TF-IDF KNN (MAE 0.126, -32%)

Evaluation Method   Full Sample (Data Leakage)   5-fold CV (Industry Standard)

Imp Score   34   56

Composite Score   83   88

Training Data   None   251 Manually Calibrated

Scoring Speed   <0.1ms   <2ms

Dependencies   Zero   Zero

Core Principle: Uses your 251 manually annotated samples as a training set. TF-IDF bigram vectorization + cosine similarity Top-5 KNN weighted average. No LLM calls, no network access, no third-party libraries required.

Key Differences (v4 vs v3):
From "store and forget" → "actively tells you what you need to know" (context + recall auto)
From "no tags" → "auto-classification" (#decision #planning #tech #preference)
From "no quality awareness" → "auto-evaluation" (summary self-eval + stale detection)
From "pure text" → "visualization" (heartbeat map + time machine + growth log)
From "non-editable" → "user controllable" (profile editing + time restore)
Commands: 36 → 44 (+8); APIs: 29 → 32 (+3)

📊 Feature Matrix
Feature   v1   v2   v3   v3-lite   v4   v4 Pro
Core Memory Pipeline

Message Recording (record)   ✅   ✅   ✅   ✅   ✅   ✅

Transcription Backfill (sync)   ✅   ✅   ✅   ✅   ✅   ✅

Multi-mode Search (5 types)   ✅   ✅   ✅   ✅   ✅   ✅

Semantic Index (Local)   ✅   ✅   ✅   ✅   ✅   ✅

Imp Scoring   ✅   ✅   ✅   ✅   ✅   ✅

Todo Management   ✅   ✅   ✅   ✅   ✅   ✅

Working Memory   ✅   ✅   ✅   ✅   ✅   ✅

Daily Summary   ✅   ✅   ✅   ✅   ✅   ✅

Engine Status   ✅   ✅   ✅   ✅   ✅   ✅

Health Check   ✅   ✅   ✅   ✅   ✅   ✅

Stats Dashboard   ✅   ✅   ✅   ✅   ✅   ✅

Automation

Auto-Consolidation   ❌   ✅   ✅   ✅   ✅   ✅

Nightly Distillation   ❌   ✅   ✅   ❌   ✅   ✅

Archiving (gzip)   ❌   ✅   ✅   ✅   ✅   ✅

Cleanup   ❌   ✅   ✅   ✅   ✅   ✅

sync --quick Mode   ❌   ❌   ✅   ✅   ✅   ✅

Security

POST+CSRF Protection   ❌   ❌   ✅   ✅   ✅   ✅

Unified safePath   ❌   ❌   ✅   ✅   ✅   ✅

Sensitive Info Masking   ✅   ✅   ✅   ✅   ✅   ✅

Process Lock   ❌   ✅   ✅   ✅   ✅   ✅

Proposal Review System   ❌   ✅   ✅   ❌   ✅   ✅

Proposal Cap   ❌   ❌   ✅   ❌   ✅   ✅

Raw Truncation Protection   ❌   ❌   ✅   ✅   ✅   ✅

Scoring

IMP_TECH Dimension   ❌   ❌   ✅   ✅   ✅   ✅

Manual Imp Calibration   ❌   ✅   ✅   ❌   ✅   ✅

Todo Noise Filtering   ❌   ❌   ✅   ✅   ✅   ✅

v4 Memory Echo

Topic Continuation (context)   ❌   ❌   ❌   ❌   ✅   ✅

Context Flashback (recall auto)   ❌   ❌   ❌   ❌   ✅   ✅

Daily/Weekly Reports   ❌   ❌   ❌   ❌   ✅   ✅

User Profile   ❌   ❌   ❌   ❌   ✅   ✅

Memory Q&A (ask --days)   ❌   ❌   ❌   ❌   ✅   ✅

P2+P3 Intelligence

Topic Tags (#tech, etc.)   ❌   ❌   ❌   ❌   ✅   ✅

Dialogue Mode Recognition   ❌   ❌   ❌   ❌   ✅   ✅

Knowledge Gap Detection   ❌   ❌   ❌   ❌   ✅   ✅

Summary Quality Self-Eval   ❌   ❌   ❌   ❌   ✅   ✅

Stale Memory Degradation   ❌   ❌   ❌   ❌   ✅   ✅

Auto Conflict Resolution   ❌   ❌   ❌   ❌   ✅   ✅

Heartbeat Map (30-day Heatmap)   ❌   ❌   ❌   ❌   ✅   ✅

Memory Time Machine   ❌   ❌   ❌   ❌   ✅   ✅

Growth Log (growth.md)   ❌   ❌   ❌   ❌   ✅   ✅

Editable Profile   ❌   ❌   ❌   ❌   ✅   ✅

Operations

Hook Failure Detection   ❌   ❌   ✅   ✅   ✅   ✅

Configurable File   ❌   ✅   ✅   ✅   ✅   ✅

Config Command   ❌   ✅   ✅   ❌   ✅   ✅

Git Backup   ❌   ✅   ✅   ❌   ✅   ✅

tar.gz Export   ❌   ✅   ✅   ❌   ✅   ✅

Version Management

Version Snapshots   ❌   ✅   ✅   ❌   ✅   ✅

Version Diff   ❌   ✅   ✅   ❌   ✅   ✅

Conflict Detection   ❌   ✅   ✅   ❌   ✅   ✅

Version Restore   ❌   ✅   ✅   ❌   ✅   ✅

Web UI

File Browse/Search   ✅   ✅   ✅   ✅   ✅   ✅

Markdown Rendering   ✅   ✅   ✅   ✅   ✅   ✅

Chat Bubble View   ✅   ✅   ✅   ✅   ✅   ✅

File Deletion   ✅   ✅   ✅   ✅   ✅   ✅

Recycle Bin   ❌   ✅   ✅   ❌   ✅   ✅

Cleanup Suggestions   ❌   ✅   ✅   ❌   ✅   ✅

Layer Filtering   ✅   ✅   ✅   ❌   ✅   ✅

Auto-Refresh   ✅   ✅   ✅   ❌   ✅   ✅

Tool Button Organization   ❌   ❌   ❌   ❌   ✅   ✅

Profile Editing   ❌   ❌   ❌   ❌   ✅   ✅

Record Toggle   ✅   ✅   ✅   ✅   ✅   ✅

Documentation

README   ✅   ✅   ✅   ✅   ✅   ✅

Reference Manual   ❌   ✅ 825L   ✅ 1061L   ❌   ✅ 400L   ✅ 400L

Install Scripts   ✅   ✅   ✅   ✅   ✅   ✅

📈 Growth Curve
Version   Engine LOC   Commands   Functions   APIs   Folder Size
v1   2,447   28   88   26   208K

v2   2,981   36   109   29   292K (+40%)

v3   3,092   36   110   29   300K (+4%)

v3-lite   2,975   14   109   18   232K (-23%)

v4   ~3,600   44   130+   32   ~350K (+17%)

v4 Pro   ~3,600   44   130+   32   ~350K (+0%)

Growth Analysis:
v1→v2: +534 LOC (+22%). Mainly consolidate + distill + recycle bin + cleanup suggestions + config.
v2→v3: +111 LOC (+4%). Mainly POST+CSRF + IMP_TECH + todo filtering + health enhancements + sync --quick.
v3→v4: +500 LOC (+17%). Mainly context/recall/report/profile/ask + topic tags + dialogue mode + knowledge gaps + summary self-eval + stale/conflict/heartbeat/timetravel/growth.
v3→v3-lite: -117 LOC (-4%). Cut 22 commands but dead code not fully removed.

🗺️ Selection Guide
Scenario   Recommended Version
Learning/Researching Memory System Architecture   v1 — Minimal & Understandable

Daily Use, Requires Long-term Memory Review   v3 — Most Feature-Rich (Non-AI)

Resource Constrained / Pursuing Simplicity   v3-lite — Core Sufficiency

Need Full Feature Comparison Reference   v2 — Transitional Bridge

Active Intelligence + Visualization   v4 — Memory Echo · Topic Continuation · Auto-Tags · Heartbeat Map

Precise Imp Scoring + Industrial Evaluation   v4 Pro — TF-IDF KNN · 5-fold CV · 251 Calibrated · Score 88 ★ Recommended

Note: v4 Pro is the currently recommended version. Building upon all v4 capabilities, it replaces pure regex imp scoring with TF-IDF KNN, reducing MAE by 32% (0.185 → 0.126). Combined with industry-standard 5-fold CV evaluation, it eliminates data leakage.

📁 Directory Structure

Project-Mnemosyne/
 ├── README.md                    ← This file
 ├── VISION-v4.md                 ← v4 Vision Planning Document
 ├── Mnemosyne-v1/                ← v1 Complete Source (2,447 LOC Engine)
 │   ├── engine.js
 │   ├── ui.js / ui-page.html
 │   ├── install.sh / logo.png
 │   ├── templates/ / hook/
 │   └── README.md
 ├── Mnemosyne-v2/                ← v2 Complete Source (2,981 LOC Engine)
 │   ├── engine.js
 │   ├── ui.js / ui-page.html
 │   ├── install.sh / logo.png
 │   ├── templates/ / hook/
 │   ├── README.md
 │   └── MNEMOSYNE-REFERENCE.md   ← 825-line Technical Manual
 ├── Mnemosyne-v3/                ← v3 Complete Source (3,092 LOC Engine)
 │   ├── engine.js
 │   ├── ui.js / ui-page.html
 │   ├── install.sh / logo.png
 │   ├── templates/ / hook/
 │   ├── README.md
 │   └── MNEMOSYNE-REFERENCE.md   ← 1,061-line Technical Manual (Most Complete)
 ├── Mnemosyne-v3-lite/           ← v3 Lite Edition (2,975 LOC Engine)
 │   ├── engine.js
 │   ├── ui.js / ui-page.html
 │   ├── install.sh / logo.png
 │   ├── templates/ / hook/
 │   └── README.md
 ├── Mnemosyne-v4/                ← v4 Complete Source (~3,600 LOC Engine)
 ├── Mnemosyne-v4-pro/            ← v4 Pro (~3,600 LOC Engine + TF-IDF) ★ Recommended
 └── Mnemosyne-bench/             ← Independent Evaluation Suite
     ├── engine.js
     ├── ui.js / ui-page.html
     ├── install.sh / logo.png
     ├── templates/ / hook/
     ├── README.md
     └── MNEMOSYNE-REFERENCE.md   ← 400-line Technical Manual
Project Mnemosyne · 2026-08-07 · Complete Evolution History of Six Versions of the Cognitive Memory Engine · v4 Pro Recommended
