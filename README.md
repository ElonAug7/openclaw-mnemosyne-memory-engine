# Mnemosyne — Zero-Dependency Local Memory Engine for OpenClaw

> 247KB（Mnemosyne-v4.5） runtime · No LLM API · No Vector DB · Pure Markdown · Git-Friendly (Only the Mnemosyne-v4.5(English)， v4.5-pro v5 support bilingual)

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

## Design Philosophy: Data Sovereignty First.
（设计哲学：数据主权至上）
## Your data is yours. Always. No exceptions.
## ·Zero egress — No data ever leaves your device
## ·Zero lock-in — Plain Markdown, not proprietary formats
## ·Zero cost — No API calls, no tokens, no surprises

## 🎯 What It Does

Mnemosyne solves the **memory loss and context degradation** problem in OpenClaw conversations — without adding any external dependencies.

- **Zero token cost** — No LLM API calls for memory retrieval; everything runs locally with TF-IDF + KNN
- **Full data ownership** — All memories stored as plain Markdown files on your machine; nothing leaves your device
- **Tiny footprint** — <0.5MB runtime, no vector database, no embedding model, no Docker required
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

## 📊 How It Compares（full documents are in the /docs file）


> 💡 **When to choose Mnemosyne:** You want a memory system that costs nothing to run, keeps all data as human-readable files you can `git diff`, and works entirely offline without any external service dependencies.
>
> ⚠️ **When NOT to choose Mnemosyne:** You need cross-user shared memory at scale, or require deep semantic understanding beyond TF-IDF keyword matching.

If you want you get more information please step to MNEMOSYNE-REFERENCE.md

If you want to get more about the product iteration information please step to CHANGELOG.md
