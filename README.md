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
