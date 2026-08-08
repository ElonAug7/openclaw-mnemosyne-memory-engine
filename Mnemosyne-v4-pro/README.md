# 🦞 Mnemosyne v4 Pro — 智能认知记忆引擎

> **v4 Pro = v4 全部能力 + TF-IDF KNN 评分 + 251条精确校准 + 5-fold CV 工业评估**

> **零第三方依赖 · 纯 Node.js · 单文件夹部署 · 一键安装**

---

## 📦 安装

### 方法一（推荐）: 手动放到工作区

```bash
cp -r Mnemosyne-v4-pro ~/.openclaw/workspace/tools/
cd ~/.openclaw/workspace/tools/Mnemosyne-v4-pro && bash install.sh
```

### 方法二: 从任意位置一键部署

```bash
bash /path/to/Mnemosyne-v4-pro/install.sh
```

安装后重启网关使 hook 生效：

```bash
openclaw gateway restart
```

`http://127.0.0.1:8765` · 评估面板 `http://127.0.0.1:8766`

---

## 🧠 v4 Pro 独有：TF-IDF KNN imp 评分

**正则天花板 MAE 0.185 → TF-IDF KNN MAE 0.168。** 251 条人工校准数据做训练集，bigram 向量化 + cosine 相似度 Top-5 加权平均。单次评分 <2ms，零 LLM 调用。

**7 维 regex 退居兜底：** 当 TF-IDF 找不到相似训练样本（cosine <0.3），自动回退到 regex 评分器。

```
校准数据: 251 条 · 分布: 🔴73 🟡158 🟢20
imp 评分: 5-fold CV · MAE 0.168 · ±0.10:41%
```

### imp 评分公式

```
base: user=0.40, assistant=0.30
IMP_INSTRUCT +0.25  帮/给/请/做/改/写/实现/修复/把/继续
IMP_PREF     +0.35  喜欢/不喜欢/必须/不能/不许/原则/底线
IMP_DECISION +0.30  决定/确认/结论/选定/agreed
IMP_TODO     +0.25  待办/todo/下一步/deadline
IMP_TECH     +0.12  优化/架构/代码/bug/性能/安全
IMP_FACT     +0.10  数字+单位(元/天/小时/%)
系统消息     →0.02  自动识别 · 核心原则加权+0.15
```

---

## 📊 当前评分（全部真实，无数据泄露）

```
═══════════════════════════════════
  LoCoMo v4 Pro 评估
═══════════════════════════════════
  🔍 Search:     132ms · R@1:40% R@3:60%
  🎯 Imp (5-CV): 41/100 · MAE 0.168 · ±0.10:41%
  📝 Consol:     120块 · 标签55% · 质检55%
  ⏳ Stale:      0/15 · Health 100/100
  🏆 Composite:  67/100
═══════════════════════════════════
```

**提分路径：** 标到 500 条校准 → imp 41→55+ → 总分 67→73+。其余三项已到硬顶。

---

## ⚙️ v4 全部能力（继承自 v4）

### 记忆回响
| 命令 | 功能 | 触发 |
|------|------|------|
| `context` | 会话上下文 + 话题续接(>12h) | 会话启动自动 |
| `recall` | 上下文闪回(top 3) | hook imp≥0.4 自动 |
| `report` | 每日/每周报告 | `--weekly` |
| `profile` | 用户画像(成熟度+情绪碎片) | sync自动 · UI可编辑 |
| `ask` | 结构化问答 | `--days N` + fallback |

### 主动智能
- **话题续接**：>12h "上次聊到 XXX，欢迎回来" + 重复话题检测
- **recall 自动触发**：imp≥0.4 & len>20 → hybrid top3 → `last-recall.json`
- **成长日志**：MEMORY.md 新增 → `growth.md` 自动记录
- **画像可编辑**：UI ✏️→💾

### 精度与可视化
- 🏷️ 话题标签 `#decision #planning #tech #preference`
- 📊 摘要质量自评 `<!-- quality: ✅/缺失XX -->`
- ⏳ 过期记忆降级 `stale.json` 追踪命中+软阈值20天预警
- ⚔️ 冲突检测+自动修复建议 `superseded`
- 🗣️ 对话模式识别 instruction/question/confirmation/discussion
- 🔍 知识缺口检测 "不知道/查一下/没找到"
- 💓 30天心跳热力图 · ⏳ 记忆时光机 · 📜 访问日志

---

## 🏗️ 记忆架构

| 层 | 路径 | 说明 |
|---|------|------|
| 🔍 索引 | `memory/index/` | 关键词索引 |
| 📝 short/raw | `memory/short/raw/` | 消息流(含imp) |
| 📝 short/working | `memory/short/working/` | 任务/决策/模式/缺口 |
| 📚 medium | `memory/medium/` | 摘要块(含标签+质量) |
| 🏛️ long | `MEMORY.md` | 全局知识 |
| 👤 profile | `memory/profile.md` | 偏好/风格/碎片 |
| 🌱 growth | `memory/growth.md` | 知识点流水 |

---

## 📋 命令

**🤖 日常:** `context` | `recall` | `report [--weekly]` | `profile` | `ask [--days N]`  
**🧑 运维:** `status` | `search` | `health` | `stale` | `conflict` | `time-travel`  
**📊 评估:** `node tools/memory-bench/bench.js` | `imp-tfidf.js build`  
**🔧 调试:** `consolidate --retag` | `embed` | `cleanup` | `distill-proposals`

---

## 📜 版本

| 版本 | imp 方法 | imp 分 | 综合 |
|------|---------|--------|------|
| v4 | 7维 regex | 34 | 83 |
| **v4 Pro** | **TF-IDF KNN** | **41** | **67** |

> v4 Pro 的综合分更低因为评估更严格——5-fold CV 杜绝数据泄露 + 251条精确校准取代粗略打分。

---

*🦞 Mnemosyne v4 Pro · 251条精确校准 · TF-IDF KNN · 5-fold CV · 零依赖*
