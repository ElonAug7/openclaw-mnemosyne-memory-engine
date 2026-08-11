# 🧠 Mnemosyne 认知理论基础 & 论文全集

> 最后更新: 2026-08-11

---

## 一、经典认知科学（1885 → 1996）

| # | 理论 | 提出者 | 年份 | 人的记忆怎么做 | Mnemosyne 实现 | 状态 |
|---|------|------|:--:|------|------|:--:|
| 1 | **遗忘曲线** | Hermann Ebbinghaus | 1885 | 记忆随时间指数衰减 | `time.js` `2^(-age/halfLife)` | ✅ |
| 2 | **间隔重复** | Ebbinghaus→Leitner→Wozniak | 1885→1990s | 间隔回顾比集中复习好 3-5 倍 | `hitFreq` 雏形，可升级 | 🟡 |
| 3 | **多存储模型** | Atkinson-Shiffrin | 1968 | 感官→短期→长期 | raw→working→medium→long | ✅ |
| 4 | **加工水平理论** | Craik & Lockhart | 1972 | 深度处理的记忆更持久 | 9 维 imp 评分 (0.02-1.00) | ✅ |
| 5 | **编码特异性** | Tulving | 1973 | 检索线索=编码线索 | 2-gram 分词 + 标签匹配 ×3 | ✅ |
| 6 | **情境依赖记忆** | Godden & Baddeley | 1975 | 同环境回忆更好 | session 内关联权重 | 🔲 |
| 7 | **SAM 模型** | Raaijmakers & Shiffrin | 1981 | 多重线索复合检索 | compound-cue 公式 | ✅ |
| 8 | **MINERVA 2** | Hintzman | 1984 | 痕迹并行激活 | 多路并行召回→统一排序 | ✅ |
| 9 | **ACT-R** | Anderson | 1996 | base-level activation | `hitFreq` 动态权重 + 衰减 | ✅ |
| 10 | **系列位置效应** | Murdock | 1962 | 首尾记得最牢 | `recent` 模式已有 recency，缺 primacy | 🟡 |
| 11 | **干扰理论** | McGeoch | 1932 | 新旧记忆互相干扰 | superseded（TEPA 的理论根源） | ✅ |
| 12 | **检索诱发遗忘 (RIF)** | Anderson, Bjork | 1994 | 回忆一个会抑制同类其他 | 🔲 可做 | 🔲 |
| 13 | **测验效应** | Roediger & Karpicke | 2006 | 被测试过的记忆记得更牢 | 命中 boost > hitFreq | 🔲 |
| 14 | **蔡格尼克效应** | Zeigarnik | 1927 | 未完成任务记得更牢 | IMP_TODO 已有，可加强 | 🟡 |
| 15 | **认知负荷理论** | Sweller | 1988 | WM 有限，信息过多崩溃 | lean context 哲学 | ✅ |

> ✅ 已实现 | 🟡 雏形已有 | 🔲 可做未做

---

## 二、机器学习论文

| # | 论文 | 作者 | 年份 | 核心思想 | 与 Mnemosyne 的关系 |
|---|------|------|:--:|------|------|
| 16 | **Prioritized Experience Replay** | Schaul et al. | 2016 | 按 TD-error 优先回放 | 对应 imp 评分——高惊讶度消息应高 imp |
| 17 | **Elastic Weight Consolidation** | Kirkpatrick et al. | 2017 | 防灾难性遗忘：重要参数加惩罚 | 高 imp 记忆不应被轻易降权 |
| 18 | **Memory Networks** | Weston et al. | 2015 | 外部记忆模块 + 端到端读写 | 架构上类似 JSONL 存储 + 搜索召回 |
| 19 | **Neural Turing Machine** | Graves et al. | 2014 | 可微分外部记忆，注意力寻址 | 概念类似 compound-cue，NTM 用梯度我们用公式 |
| 20 | **Transformer-XL** | Dai et al. | 2019 | 段级递归，跨 segment 传递状态 | 对应 context 跨 session 传递 |
| 21 | **RETRO** | Borgeaud et al. | 2022 | 检索增强，先查再生成 | "先查记忆再回复"的范本 |

---

## 三、当代 AI Agent 记忆论文（2026）

| # | 论文 | arXiv | 日期 | 借用内容 | 状态 |
|---|------|-------|:--:|------|:--:|
| 22 | **Engram: Bi-Temporal Memory Engine** | [2606.09900](https://arxiv.org/abs/2606.09900) | 06-05 | lean context > full history; as-of 查询 | ✅ |
| 23 | **TEPA: Revoking Stale Memories** | [2608.07429](https://arxiv.org/abs/2608.07429) | 08-07 | revoked 状态 + 降权 ×0.15 | ✅ |
| 24 | **LeanMem: Content-Type Memory** | [2608.03463](https://arxiv.org/abs/2608.03463) | 08-04 | content-type selective storage | ✅ |
| 25 | **MemSIF: Dual-Track Fact Memory** | [2608.01742](https://arxiv.org/abs/2608.01742) | 08-03 | TSM + DUM; topicCoherence + hitFreq | ✅ |
| 26 | **ChronoMem: Version Control** | [2607.27773](https://arxiv.org/abs/2607.27773) | 07-30 | 记忆版本控制 + 语义回滚 | ✅ |
| 27 | **Memory Provenance Laundering** | [2607.29167](https://arxiv.org/abs/2607.29167) | 07-31 | source provenance 追踪 | ✅ |
| 28 | **PMMC: Multimodal Memory Compilation** | 08-01 | 多模态记忆编译 | 📖 |
| 29 | **OpsMem: Dual-Memory Reasoning** | 07-13 | 双记忆推理 + 跨记忆共振 | 📖 |
| 30 | **Muscle Memory: Compile not Retrieve** | 08-09 | 高频记忆应固化为行为 | 🔲 |
| 31 | **SuperLocalMemory 4.0: Memory OS** | 08-08 | 记忆治理 + 权限 + 持久化 | 📖 |

> ✅ 已集成 | 📖 已读，待评估 | 🔲 计划中

---

## 四、核心公式 (compound-cue)

```
familiarity = 0.35·imp + 0.25·recency + 0.25·keyword + 0.10·hitFreq + 0.05·layerW
               + topicCoherence     ← v5.1 MemSIF TSM
               × supersededMultiplier ← v5.1 TEPA (×0.15 if superseded)
               × confidenceMultiplier ← v5.0 time-fallback protection
```

---

## 五、待实现方向 (v5.2+)

| 优先级 | 方向 | 理论来源 | 实现难度 |
|:--:|------|------|:--:|
| P0 | Testing Boost（被 recall 命中的记忆 ×1.5 boost） | Roediger & Karpicke 2006 | 低 |
| P0 | RIF Penalty（同 topic 排名靠后的短暂降权） | Anderson & Bjork 1994 | 低 |
| P1 | Muscle Memory（高频记忆自动提升到工作记忆） | Muscle Memory paper 2026 | 中 |
| P1 | Primacy Weight（系列位置效应的首因效应） | Murdock 1962 | 低 |
| P2 | Session Context（跨 session 情境关联） | Godden & Baddeley 1975 | 中 |

---

**总计: 31 篇论文/理论 | 已集成 19 篇 | 计划中 4 篇 | 已读待评估 3 篇 | 纯算法备用 5 篇**
