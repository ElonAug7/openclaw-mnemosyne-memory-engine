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
cd Mnemosyne-v4-pro
node engine.js init
open http://localhost:8766

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
