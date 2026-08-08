# 分层记忆协议 (Mnemosyne v4)

## 短期 memory/short/ — hook 自动记录
- `short/raw/` — 原始消息流（JSONL，含 imp 评分），30 天后自动 gzip 归档
- `short/working/` — 工作台：当前任务、待确认问题、最近决策（高 imp 消息自动刷新）
- `short/inject/` — 今日结构化摘要：话题/事实/决策（每日自动生成）

## 中期 memory/medium/ — 按日摘要块
- 引擎 `autoConsolidate()` 自动整合：每 30 分钟检查，满足条件时自动写入
- 触发条件（三选一）：新消息 ≥8 条 OR 高 imp 消息 ≥2 条 OR imp 累积值 ≥3.0
- 自动同步索引 `memory/index/index.md`

## 长期 MEMORY.md — 全局知识
- 每晚 22:30 cron 自动运行 `nightly-distill`
- 生成 ≤10 条候选建议 → agent 人工审阅确认后写入（安全加固）
- 每次写入自动生成版本快照到 `memory/versions/`
- 新条目自动追加到 `memory/growth.md`（成长日志）

## 👤 用户画像 memory/profile.md
- `sync`/`consolidate` 后自动更新
- 含技术偏好、沟通风格、决策节奏、个性碎片
- 成熟度：150 轮≈70%，之后每 50 轮+5%，上限 95%
- UI 可手动编辑修正

## 索引 memory/index/ — 思考时最先查

## 🧠 v4 记忆回响

| 命令 | 触发时机 | 说明 |
|------|---------|------|
| `context` | 会话启动 | 话题续接(>12h自动)+待办+问题+决策 |
| `recall` | 回复前/hook自动 | hybrid搜索top3历史记忆 |
| `report` | 手动/cron | 每日统计+话题+决策汇总 |
| `profile` | sync自动/手动 | 用户画像(技术/风格/情绪) |
| `ask` | 手动 | 结构化查询"决定/待办/偏好/话题" |

## 🌱 记忆成长日志 memory/growth.md
- 每次 MEMORY.md 新增条目自动记录
- Web UI 可查看

## 语义搜索
- `search --mode hybrid` — 关键词+语义融合（推荐）
- `search --mode keyword|semantic|recent|history`
- 7 路并行召回，5 种权重策略

## imp 评分
```
基准: user=0.35, assistant=0.30
加成: IMP_TECH +0.12 | IMP_DECISION +0.30 | IMP_TODO +0.25 | IMP_FACT +0.10
封顶: 1.0 | 闲聊: 0.1
```

## 配置
`memory/engine/config.json` — 保留期/阈值/权重/语义索引开关/raw记录开关
