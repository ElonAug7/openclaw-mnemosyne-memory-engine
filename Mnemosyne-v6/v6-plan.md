# 🧠 Mnemosyne v6 — 论文筛选报告

> 筛掉与核心理论背道而驰的，只留能用的。
> 核心原则: 零 NN · 零 LLM · 纯算法 · 永不真删 · 存储像机器检索像人

---

## ❌ 筛掉的（与路线冲突）

| # | 论文/理论 | 冲突原因 |
|---|------|------|
| ✗ | **Memory Networks** (Weston 2015) | 需要训练 NN 做端到端读写 |
| ✗ | **Neural Turing Machine** (Graves 2014) | 可微分记忆需要梯度训练 |
| ✗ | **PMMC** (2026-08) | 多模态需要视觉模型 |
| ✗ | **OpsMem** (2026-07) | 双记忆推理依赖 LLM |
| ✗ | **SuperLocalMemory 4.0** (2026-08) | OS 级记忆治理，过于重量级 |

---

## ⚠️ 保留概念但抛弃实现

这些论文的原始实现依赖 NN/embedding，但核心思想可以纯算法化：

| 论文 | 原始实现 | 我们提取的概念 | 纯算法化方案 |
|------|---------|------|------|
| **Prioritized Experience Replay** | 按 TD-error（NN 输出）优先回放 | "惊讶度"高的经历更值得记住 | 已有！imp 评分里 IMP_DECISION、否定纠正等就是"惊讶信号" |
| **EWC** | Fisher 信息矩阵保护重要参数 | 重要信息不应该被轻易覆盖 | 已有！superseded ×0.15 但从未删除。可加强：high imp 记忆完全免疫降权 |
| **RETRO** | embedding 检索 + cross-attention | "先查再生成"的流程模式 | 已有！recall → inject → reply |
| **Transformer-XL** | segment-level hidden state recurrence | 跨 session 传递上下文 | 已有！context 命令 + 话题续接 |

---

## ✅ 留下的（完全对齐）

### 已实现 (v5.1-elite)

| # | 理论/论文 | 年份 | Mnemosyne 实现 |
|---|------|:--:|------|
| 1 | Ebbinghaus 遗忘曲线 | 1885 | `time.js` 半衰期 |
| 2 | Atkinson-Shiffrin 多存储模型 | 1968 | raw→working→medium→long |
| 3 | Craik & Lockhart 加工水平 | 1972 | 9 维 imp 评分 |
| 4 | Tulving 编码特异性 | 1973 | 2-gram 分词 + 标签 ×3 |
| 5 | SAM 复合线索模型 | 1981 | `0.35·imp + 0.25·recency + 0.25·keyword + 0.10·hitFreq + 0.05·layerW` |
| 6 | MINERVA 2 并行激活 | 1984 | 多路并行召回→统一排序 |
| 7 | ACT-R base-level activation | 1996 | hitFreq 动态权重 |
| 8 | McGeoch 干扰理论 | 1932 | superseded 自动检测 |
| 9 | Engram (bi-temporal) | 2026 | `--as-of` 时间过滤 |
| 10 | TEPA (stale revocation) | 2026 | superseded ×0.15 降权 |
| 11 | LeanMem (content-type) | 2026 | `compressForStorage()` |
| 12 | MemSIF (TSM + DUM) | 2026 | topicCoherence + hitFreq |
| 13 | ChronoMem (version control) | 2026 | version/version-diff/restore |
| 14 | Provenance Laundering | 2026 | `_provenance` 源标记 |

### 待实现 (v6 候选)

| # | 理论/论文 | 年份 | 核心思想 | 纯算法方案 | 难度 |
|---|------|:--:|------|------|:--:|
| 15 | **测验效应** — Roediger & Karpicke | 2006 | 被"测试"过的记忆比被"复习"过的更牢 | recall 命中 → ×1.5 临时 boost（比 hitFreq 更强） | 🔵 低 |
| 16 | **检索诱发遗忘 (RIF)** — Anderson & Bjork | 1994 | 回忆 A 会短暂抑制 B（同类未检索项） | 同次搜索中排名靠后的同 topic 结果 ×0.7 | 🔵 低 |
| 17 | **系列位置效应** — Murdock | 1962 | 最早和最新的信息天然优先 | 搜索排序加 primacy 权重（时间戳最早的同等内容 +0.05） | 🔵 低 |
| 18 | **蔡格尼克效应** — Zeigarnik | 1927 | 未完成的任务记得更牢 | IMP_TODO 消息额外 +0.15 权重 | 🔵 低 |
| 19 | **情境依赖记忆** — Godden & Baddeley | 1975 | 同一 session/上下文下回忆更好 | 同一 session 来源的记忆之间 +0.05 相关性 boost | 🟡 中 |
| 20 | **肌肉记忆** — Muscle Memory paper | 2026 | 高频记忆应编译进"行为" | hitFreq > 10 的记忆自动写入工作记忆/context | 🟡 中 |

---

## 📊 总结

| 类别 | 数量 |
|------|:--:|
| 原始论文/理论 | 31 |
| 筛掉（与路线冲突） | 5 |
| 概念保留但抛弃 NN 实现 | 4 |
| 已实现 | 14 |
| v6 待实现 | 6 |
| **可用净数** | **20** |

---

## 🎯 v6 核心升级方向

6 个待实现项全部是纯算法，改动集中在三个地方：

| 改动位置 | 加入什么 | 来源 |
|------|------|------|
| `compoundScore()` | Testing Boost: recall 命中 ×1.5 | Roediger & Karpicke |
| `compoundScore()` | RIF Penalty: 同 topic 后位 ×0.7 | Anderson & Bjork |
| `compoundScore()` | Primacy: 最早记忆 +0.05 | Murdock |
| `compoundScore()` | Zeigarnik: todo 消息 +0.15 | Zeigarnik |
| `compoundScore()` | Context: 同 session +0.05 | Godden & Baddeley |
| `autoConsolidate()` | Muscle Memory: 高频→工作记忆 | Muscle Memory paper |
