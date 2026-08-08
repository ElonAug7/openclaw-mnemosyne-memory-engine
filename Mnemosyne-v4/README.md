# 🦞 Mnemosyne v4 — OpenClaw 可移植认知记忆引擎

> **Mnemosyne**（谟涅摩绪涅）— 希腊记忆女神，泰坦神族，九位缪斯之母。

> **零第三方依赖 · 纯 Node.js · 单文件夹部署 · 一键安装**

---

## 📦 安装

### 方法一（推荐）: 手动放到工作区

```bash
cp -r Mnemosyne-v4 ~/.openclaw/workspace/tools/
cd ~/.openclaw/workspace/tools/Mnemosyne-v4 && bash install.sh
```

### 方法二: 从任意位置一键部署

```bash
bash /path/to/Mnemosyne-v4/install.sh
```

安装后重启网关使 hook 生效：

```bash
openclaw gateway restart
```

打开 `http://127.0.0.1:8765` · 评估面板 `http://127.0.0.1:8766`

---

## 🧠 v4 核心能力

### 记忆回响

| 命令 | 功能 | 触发 |
|------|------|------|
| `context` | 📋 会话上下文 + 话题续接(>12h) | 会话启动自动 |
| `recall` | 🔮 上下文闪回(top 3) | hook imp≥0.4 自动 |
| `report` | 📊 每日/每周报告 | `--weekly` |
| `profile` | 👤 用户画像(成熟度+情绪碎片) | sync自动 · UI可编辑 |
| `ask` | 💡 结构化问答 | `--days N` + fallback |

### P0+P1 主动智能

- **话题续接**：>12h 自动检测 "上次聊到 XXX，欢迎回来"
- **recall 自动触发**：imp≥0.4 & len>20 → hybrid搜索
- **成长日志**：MEMORY.md 新增 → `growth.md` 自动记录
- **ask --days**：默认14天，无结果全量fallback
- **画像可编辑**：UI ✏️→💾

### P2+P3 精度与可视化

| 功能 | 说明 |
|------|------|
| 🏷️ 话题标签 | `#decision` `#planning` `#tech` `#preference` 自动 |
| 📊 摘要自评 | `<!-- quality: ✅/缺失XX -->` |
| ⏳ 过期降级 | `memory/engine/stale.json` 追踪命中时间 |
| ⚔️ 冲突修复 | `conflict` → autoResolve + superseded 标记 |
| 🗣️ 对话模式 | instruction/question/confirmation/discussion |
| 🔍 知识缺口 | "不知道/查一下/没找到" 自动追踪 |
| 💓 心跳图 | 30天热力图 |
| ⏳ 时光机 | MEMORY.md 版本浏览+恢复 |
| 📜 访问日志 | 引擎活动统计 |

### 🎯 imp 评分（7 维 regex）

```
base: user=0.40, assistant=0.30
IMP_INSTRUCT +0.25  帮/给/请/做/改/写/实现/修复/把/继续/然后
IMP_PREF     +0.35  喜欢/不喜欢/必须/不能/不许/原则/底线/风格
IMP_DECISION +0.30  决定/确认/结论/选定/agreed
IMP_TODO     +0.25  待办/todo/下一步/deadline
IMP_TECH     +0.12  优化/架构/代码/bug/性能/安全
IMP_FACT     +0.10  数字+单位(元/天/小时/%)
封顶 1.0 · 闲聊 0.1
251条人工校准 · Δ0.185 · ±0.10:34%
```

---

## 🏗️ 记忆架构

| 层 | 路径 | 说明 |
|---|------|------|
| 🔍 索引 | `memory/index/` | 关键词索引 |
| 📝 短期·raw | `memory/short/raw/` | 消息流(含imp) |
| 📝 短期·工作台 | `memory/short/working/` | 任务/决策/模式/缺口 |
| 📚 中期 | `memory/medium/` | 摘要块(含标签+质量) |
| 🏛️ 长期 | `MEMORY.md` | 全局知识 |
| 👤 画像 | `memory/profile.md` | 偏好/风格/碎片 |
| 🌱 成长 | `memory/growth.md` | 知识点流水 |
| 📊 stale | `memory/engine/stale.json` | 命中追踪 |

---

## ⚙️ 自动化管线

```
消息 → record → imp评分 → recall自动触发 → working刷新(模式+缺口)
consolidate(30min节流) → 话题标签+质量自评 → medium
会话启动 → sync --quick → context(话题续接) → 待办提醒
每晚22:30 → distill → proposals(≤10) → agent审阅 → MEMORY.md
```

---

## 📊 Benchmark 体系

独立评估套件 `tools/memory-bench/`：

```
node tools/memory-bench/server.js   # 评估面板 :8766
node tools/memory-bench/bench.js    # 5维基准引擎
node tools/memory-bench/imp-recalc.js # imp重评分
node tools/memory-bench/calibrate-batch.js # 批量校准
```

**5 维指标**：搜索精度 / imp准确率 / 摘要质量 / 过期健康 / 系统健康

```
🏆 综合: 73/100
  search           93 █████████░  70ms avg, P95 85ms, 50次查询0错误
  imp              34 ███░░░░░░░  251条校准, Δ0.185, ±0.20:63%
  consolidation    43 ████░░░░░░  64块, 标签80%
  staleness       100 ██████████  15条目0过期
  health           95 ██████████  231轮250消息15次整合
```

---

## 📋 命令速查

### 🤖 日常（auto）
`record` | `sync --quick` | `context` | `recall` | `consolidate` | `todos`

### 🧑 运维
`status` | `search` | `report [--weekly]` | `profile` | `ask [--days N]` | `health` | `stats` | `stale` | `conflict` | `time-travel --list/--restore`

### 🔧 调试
`enable/disable` | `embed` | `reindex` | `backup` | `export` | `cleanup` | `distill-proposals`

---

## 🔧 配置

`memory/engine/config.json` — 保留期/阈值/权重/consolidate触发条件

---

## 📜 版本历史

| 版本 | 日期 | 核心 |
|------|------|------|
| **v4** | 08-07 | 记忆回响·话题续接·成长日志·话题标签·摘要自评·过期降级·对话模式·知识缺口·心跳图·时光机·stale追踪·冲突修复·251条校准·独立评估面板 |
| **v3** | 08-06 | POST+CSRF·截断保护·IMP_TECH·待办过滤·hook检测·sync --quick |
| **v2** | 08-06 | 可配置·回收站·建议清理·自动整合·夜间蒸馏 |
| **v1** | 08-05 | 四层架构·语义索引·7路搜索·Web UI |

---

## 🔗 相关文档

- `MNEMOSYNE-REFERENCE.md` — 完整技术手册
- `MEMORY-PROTOCOL.md` — 分层记忆协议
- `docs/COMPARISON.md` — vs Mem0/MemGPT/LangChain 竞品对比
- 评估面板: `http://127.0.0.1:8766`

---

*🦞 Mnemosyne v4 · ~3600行 · 44命令 · 32API · 251条校准 · 零依赖 · 配置即用*
