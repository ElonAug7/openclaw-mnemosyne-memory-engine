# 🦞 Mnemosyne v4 Pro — 技术参考手册

> ~3,800 行引擎 + ~600 行 Web 服务器 · 130+ 函数 · 44 命令 · 32 API · 251 条精确校准 · 零依赖

---

## 一、架构

```
Hook → record → sanitize → compress → imp(TF-IDF KNN + regex fallback) → raw JSONL
                    ↓
         recall自动触发(imp≥0.4 & len>20) → last-recall.json
         working刷新(任务/决策/问题/模式/缺口)
         consolidate(30min/3条件) → 话题标签+质量自评 → medium
                    ↓
sync --quick → context(话题续接>12h) → 待办提醒
22:30 cron → distill → proposals(≤10) → agent审阅 → MEMORY.md + growth.md
```

### 记忆层

| 层 | 路径 | 注入 | 生命周期 |
|---|------|:--:|------|
| 索引 | `memory/index/index.md` | ✅ | 永久 |
| raw | `memory/short/raw/YYYY-MM-DD.jsonl` | ❌ | 30天→gzip |
| working | `memory/short/working/current.json` | ✅ | 实时 |
| inject | `memory/short/inject/YYYY-MM-DD.json` | ✅ | 7天 |
| medium | `memory/medium/YYYY-MM-DD.md` | ✅ | 180天→gzip |
| long | `MEMORY.md` | ✅ | 永久 |
| profile | `memory/profile.md` | ✅ | 永久 |
| growth | `memory/growth.md` | ❌ | 永久 |
| stale | `memory/engine/stale.json` | — | 永久 |
| tfidf-model | `memory/engine/imp-tfidf-model.json` | — | 251条训练 |

---

## 二、CLI 命令（44 个）

### 核心管线

| 命令 | 用法 | 说明 |
|------|------|------|
| `record` | `--role user\|assistant --text "..."` | 消息落盘（hook自动调用） |
| `sync` | `[--quick]` | 全量/快速同步（转录+索引+归档+整合+画像） |
| `status` | 无 | 30+ 字段完整状态 |
| `enable/disable` | 无 | 开关引擎 |
| `record-raw --enable/--disable` | 无 | 仅开关对话记录 |
| `init` | 无 | 幂等初始化 |

### 搜索（1 命令 5 模式）

| 模式 | 适用 | 说明 |
|------|------|------|
| `keyword` | 默认 | 关键词精确+模糊，命中长记忆更新 stale |
| `semantic` | 需 embed | 本地 bigram+trigram 512维向量 |
| `hybrid` | 推荐 | keyword + semantic 融合排序 |
| `recent` | — | 偏重短期记忆权重 |
| `history` | — | 偏重长期记忆 & MEMORY.md |

### v4 记忆回响（7 个）

| 命令 | 用法 | 说明 |
|------|------|------|
| `context` | 无 | 话题续接(>12h)+重复检测+待办+问题+决策 |
| `recall` | `--query "..."` | hybrid top3 · hook imp≥0.4 自动触发 |
| `report` | `[--date YYYY-MM-DD] [--weekly]` | 每日/周报(7天话题排行) |
| `profile` | `[--update]` | 画像(成熟度150轮70%) · UI可编辑 |
| `ask` | `--query "决定\|待办\|偏好\|话题" [--days N]` | 结构化问答 + fallback 全量 |
| `time-travel` | `--list \| --restore <id>` | 版本浏览/恢复 |
| `stale` | `[--days 60]` | 过期检测（搜索命中自动追踪） |

### 维护（7 个）

| 命令 | 说明 |
|------|------|
| `consolidate [--force\|--check\|--retag]` | 整合/补标签/补质检 |
| `todos [--add\|--done <id>]` | 待办清单 |
| `embed [--force]` | 语义索引构建/刷新 |
| `reindex` | 索引扫描补全 |
| `cleanup [--confirm]` | 清理无用文件（日志/过期摘要/回收站） |
| `health` | 13项健康检查（100分制） |
| `stats` | 消息/imp/关键词统计 |

### 诊断（5 个）

| 命令 | 说明 |
|------|------|
| `conflict` | 冲突检测+autoResolve 建议 |
| `distill-proposals --list/--apply <id>` | 审阅长期记忆候选 |
| `distill-reject --id <id>` | 拒绝候选 |
| `imp-calibrate --date --line --imp` | 手动校准消息重要性 |
| `help` | 完整帮助 |

### 评估工具（`tools/memory-bench/`）

| 工具 | 说明 |
|------|------|
| `bench.js --quick/--json` | 5维基准引擎 |
| `imp-evaluate.js` | 全流程工业评估（4方法） |
| `imp-tfidf.js build/score/eval` | TF-IDF 模型构建/评分/评估 |
| `imp-recalc.js` | 校准数据重评分 |
| `calibrate-batch.js` | 批量交互式 imp 校准 |
| `locomo-adapter.js` | LoCoMo 兼容评估 |
| `server.js + ui.html` | 独立评估面板 :8766 |

---

## 三、imp 评分系统

### v4 Pro：TF-IDF KNN（主）+ regex（兜底）

```
架构: bigram tokenizer → TF-IDF 向量 → cosine top-5 KNN 加权平均
训练: 251条精确人工校准 · 分布 🔴73 🟡158 🟢20
兜底: cosine<0.3 → 回退到7维regex评分器
过滤: 系统消息/心跳/错误日志 → 0.02
```

### 7 维 regex（兜底评分器）

```
base:        user=0.40, assistant=0.30
IMP_INSTRUCT +0.25  帮/给/请/做/改/写/实现/修复/安装/部署/配置/把/继续/然后
IMP_PREF     +0.35  喜欢/不喜欢/必须/不能/不许/不准/原则/底线/风格/习惯
IMP_DECISION +0.30  决定/确认/结论/选定/采纳/最终方案/agreed/decided
IMP_TODO     +0.25  待办/todo/下一步/计划/提醒/别忘了/deadline/明天
IMP_TECH     +0.12  优化/改进/重构/架构/代码/bug/修复/性能/安全/配置
IMP_FACT     +0.10  数字+单位(元/块/天/小时/月/年/%)
CORE_PRINCIPLE +0.15 约束词+领域词同时出现（必须/禁止+本地/隐私/开源）
LONG_DIRECTIONAL →0.75 >100字+方向/架构/竞品/评估关键词
CHITCHAT      →0.10 纯确认/好/嗯/ok/谢谢
SYSTEM_MSG    →0.02 系统消息/心跳/错误日志
封顶: 1.0 · recall自动触发: imp≥0.4 & len>20
```

### 校准流程

```bash
# 交互式批量校准
node tools/memory-bench/calibrate-batch.js

# 重建 TF-IDF 模型
node tools/memory-bench/imp-tfidf.js build

# 单条校准
node tools/memory-engine/engine.js imp-calibrate --date 2026-08-07 --line 5 --imp 0.85

# 查看校准记录
node tools/memory-bench/calibrate-batch.js --list
```

---

## 四、自动化管线

| 管线 | 触发 | 输出 |
|------|------|------|
| record | 每条消息(hook) | raw JSONL + imp(TF-IDF优先) |
| recall auto | imp≥0.4 & len>20 | `last-recall.json` (top3 hybrid) |
| working refresh | imp≥0.5×3累积 | current.json (任务/决策/问题/模式/缺口) |
| consolidate | 30min节流 + 3条件触发 | medium摘要块(含标签+质检) + index + profile |
| retag | `consolidate --retag` | 旧块补标签+质量自评 |
| reindex | record/sync后 | 索引补全 |
| archive | sync检查 | >30d raw gzip · >180d medium gzip |
| nightly distill | 22:30 cron | ≤10 proposals → agent审阅 |
| growth log | distill apply | `growth.md` 追加 |
| stale track | search命中long层 | `stale.json` 更新时间戳 |
| profile update | sync/consolidate | `profile.md` 自动刷新 |

---

## 五、Web 控制台

`http://127.0.0.1:8765`

### 布局
- **左侧可折叠侧栏**：统计+开关+搜索+层过滤+文件列表
- **📦 更多工具组**：🌱成长·💓心跳·📊报告·💡决策·⏳时光·📜日志
- **右侧内容区**：Markdown渲染/JSONL聊天气泡
- **右下工作台浮窗**：实时任务+待确认问题+最近决策
- **底部浮动按钮**：📋待办·📊报告·👤画像·💡决策

### API（32 个端点）

**GET（读）：** `status` `files` `file?p=` `download?p=` `search?q=&mode=` `todos` `cleanup-suggestions` `stats` `versions` `version?id=` `trash` `logo`

**POST（写，CSRF保护）：** `enable/disable` `delete` `trash/restore` `trash/purge` `todos/add` `todos/done` `save` `backup` `signal` `enable-raw/disable-raw`

---

## 六、Benchmark 体系

`http://127.0.0.1:8766` · `tools/memory-bench/`

### 5 维基准（bench.js）

1. **搜索精度**：多模式并行召回 · avg/P50/P95 latency · hits · errors
2. **imp 准确率**：5-fold CV · MAE · ±0.05/±0.10/±0.20 通过率
3. **摘要质量**：块数 · 标签覆盖率 · 质检覆盖率
4. **过期健康**：条目数 · stale(30d) · 预警(20d软阈值)
5. **系统健康**：health score · turns/msgs/consolidations/semantic

### 工业级评估（imp-evaluate.js）

| 方法 | 说明 |
|------|------|
| Train/Test Split (80/20) | 200train/51test |
| 5-fold CV | 金标准，5轮轮换验证 |
| Time Holdout (real→synth) | 真实训/合成测（最严） |
| Regex Baseline | 纯 regex 对照 |

### LoCoMo 兼容评估（locomo-adapter.js）

- Factual Recall (Top-1) · Temporal Reasoning · Multi-Session Consistency

---

## 七、安全

- **POST+CSRF**：写操作强制 POST，Origin/Referer 校验
- **进程锁**：distill 写入 acquireLock（120s 超时，wx 原子创建）
- **proposals 上限**：离线积压 ≤10 条
- **截断保护**：imp≥0.7 的消息截断前存入 medium 备份
- **safePath**：统一白名单防目录穿越
- **权限模块**：agent/session 级读写控制

---

## 八、配置

`memory/engine/config.json`：
```json
{
  "retention": {"injectDays":7, "rawDays":30, "mediumDays":180, "trashDays":15},
  "thresholds": {
    "consolidateMinMsgs": 8,
    "consolidateMinHighImp": 2,
    "consolidateMinImpSum": 3.0,
    "consolidateIntervalMs": 1800000,
    "workingUpdateMsgs": 3,
    "rawMaxChars": 800
  },
  "recordRaw": true,
  "embed": {"defaultEnabled": true, "maxRecentDays": 30, "dims": 512},
  "weights": {"keyword":{...}, "semantic":{...}, "hybrid":{...}, "recent":{...}, "history":{...}}
}
```

---

## 九、版本历史

| 版本 | 日期 | 行数 | 命令 | imp方法 | imp分 | 核心 |
|------|------|------|------|---------|-------|------|
| v1 | 08-05 | 2,447 | 28 | 4维regex | ~10 | 四层架构·语义索引·7路搜索·Web UI |
| v2 | 08-06 | 2,981 | 36 | 4维regex | ~15 | 可配置·回收站·建议清理·自动整合·夜间蒸馏 |
| v3 | 08-06 | 3,093 | 36 | 6维regex | ~20 | POST+CSRF·截断保护·IMP_TECH·待办过滤·hook检测 |
| v3-lite | 08-06 | 2,975 | 14 | 6维regex | ~18 | 精简版·核心管线保留 |
| v4 | 08-07 | 3,751 | 44 | 7维regex | ~34 | 记忆回响·话题续接·自动标签·摘要自评·过期降级·对话模式·心跳图·时光机 |
| **v4 Pro** | **08-07** | **3,800** | **44** | **TF-IDF KNN** | **41** | **TF-IDF评分·251条精确校准·5-fold CV·系统消息过滤·工业评估** |

---

*🦞 Mnemosyne v4 Pro · 2026-08-07 · 251条精确校准 · TF-IDF KNN · 5-fold CV · 67分 LoCoMo · 零依赖*
