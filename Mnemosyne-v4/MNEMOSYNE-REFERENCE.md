# 🦞 Mnemosyne v4 — 技术参考手册

> ~3600 行引擎 + ~600 行 Web 服务器 · 130+ 函数 · 44 命令 · 32 API · 251 条校准 · 零依赖

---

## 一、架构

```
Hook → record → sanitize → compress → imp(7维regex) → raw JSONL
                    ↓
         recall自动触发(imp≥0.4)
         working刷新(模式+缺口)
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

---

## 二、CLI 命令（44 个）

### 核心管线
| 命令 | 用法 |
|------|------|
| `record` | `--role user\|assistant --text "..."` |
| `sync` | `[--quick]` |
| `status` | 30+ 字段 |
| `enable/disable` | 开关引擎 |
| `record-raw --enable/--disable` | 仅开关对话记录 |
| `init` | 幂等初始化 |

### 搜索（1 命令 5 模式）
| 模式 | 适用 |
|------|------|
| `keyword` | 精确+模糊（默认） |
| `semantic` | 向量搜索（需 embed） |
| `hybrid` | 融合排序（推荐） |
| `recent` | 偏重短期 |
| `history` | 偏重长期 |

命中 MEMORY.md 条目自动更新 stale.json。

### v4 记忆回响
| 命令 | 用法 | 说明 |
|------|------|------|
| `context` | 无 | 话题续接(>12h)+待办+问题+决策 |
| `recall` | `--query "..."` | hybrid top3 · hook imp≥0.4 自动 |
| `report` | `[--date YYYY-MM-DD] [--weekly]` | 每日/周报(7天话题排行) |
| `profile` | `[--update]` | 画像(成熟度150轮70%) · UI可编辑 |
| `ask` | `--query "决定\|待办\|偏好\|话题" [--days N]` | 问答+fallback全量 |
| `time-travel` | `--list \| --restore <id>` | 版本浏览/恢复 |
| `stale` | `[--days 60]` | 过期检测 |

### 维护
| 命令 | 说明 |
|------|------|
| `consolidate [--force\|--check\|--retag]` | 整合/补标签 |
| `todos [--add\|--done <id>]` | 待办 |
| `embed [--force]` | 语义索引 |
| `reindex` | 索引补全 |
| `cleanup [--confirm]` | 清理 |
| `health` | 13项健康检查(100分制) |
| `stats` | 消息/imp/关键词统计 |
| `conflict` | 冲突检测+autoResolve |
| `distill-proposals --list/--apply <id>` | 审阅候选 |
| `distill-reject --id <id>` | 拒绝候选 |
| `imp-calibrate --date --line --imp` | 手动校准 |
| `help` | 完整帮助 |

---

## 三、imp 评分系统

```
7 维 regex · 251 条人工校准 · Δ0.185 · ±0.10:34% · ±0.20:63%

base:        user=0.40, assistant=0.30
IMP_INSTRUCT +0.25  帮/给/请/做/改/写/实现/修复/安装/部署/配置/把/继续/然后
IMP_PREF     +0.35  喜欢/不喜欢/必须/不能/不许/不准/原则/底线/风格/习惯
IMP_DECISION +0.30  决定/确认/结论/选定/采纳/最终方案/agreed/decided
IMP_TODO     +0.25  待办/todo/下一步/计划/提醒/别忘了/deadline/明天
IMP_TECH     +0.12  优化/改进/重构/架构/代码/bug/修复/性能/安全/配置/模块
IMP_FACT     +0.10  数字+单位(元/块/天/小时/月/年/%)
QUESTION     +0.05  user消息以?/?结尾
LONG         +0.05  长度>500字符
封顶: 1.0 · 闲聊: 0.1 · recall触发: imp≥0.4 & len>20
```

### 校准流程
```bash
# 交互式批量校准
node tools/memory-bench/calibrate-batch.js

# 重算（算法更新后）
node tools/memory-bench/imp-recalc.js

# 单条校准
node tools/memory-engine/engine.js imp-calibrate --date 2026-08-07 --line 5 --imp 0.85
```

---

## 四、自动化管线

| 管线 | 触发 | 输出 |
|------|------|------|
| record | 每条消息(hook) | raw JSONL + imp |
| recall auto | imp≥0.4 user msg | `last-recall.json` (top3) |
| working refresh | imp≥0.5×3累积 | current.json (任务/决策/问题/模式/缺口) |
| consolidate | 30min节流 + (≥8条\|≥2高imp\|imp累积≥3) | medium + index + profile |
| retag | `consolidate --retag` | 旧块补标签+质量自评 |
| reindex | 每次record/sync | 索引补全 |
| archive | sync检查 | >30d raw gzip · >180d medium gzip |
| nightly distill | 22:30 cron | ≤10 proposals |
| growth log | distill apply | growth.md |
| stale track | search命中long层 | stale.json |
| profile update | sync/consolidate | profile.md |

---

## 五、Web 控制台

`http://127.0.0.1:8765`

### 布局
- 左侧可折叠侧栏 + 📦 更多工具组
- 右侧 Markdown/JSONL 内容区
- 右下工作台浮窗(实时任务/问题/决策)
- 底部浮动按钮(待办/报告/画像/决策)

### 工具组
🌱 成长 · 💓 心跳(30天热力图) · 📊 报告 · 💡 决策 · ⏳ 时光机 · 📜 日志

### API（32 个端点）
**GET:** status/files/file/download/search/todos/cleanup/stats/versions/version/trash/logo  
**POST:** enable/disable/delete/trash/restore/purge/todos/add/done/save/backup/signal/enable-raw/disable-raw

---

## 六、Benchmark 体系

`http://127.0.0.1:8766` · `tools/memory-bench/`

### 5 维指标
1. **搜索精度**: 多模式并行召回 · avg/P50/P95 latency · hits · errors
2. **imp 准确率**: 自动评分 vs 人工校准 · avgDiff · ±0.05/±0.10/±0.20 通过率
3. **摘要质量**: 块数 · 完整率(4字段) · 标签覆盖率 · 质检覆盖率
4. **过期健康**: 条目数 · stale(30d) · 预警(20d软阈值)
5. **系统健康**: health score · turns/msgs/consolidations/semantic

### 工具
| 工具 | 用途 |
|------|------|
| `bench.js` | 5维基准引擎(`--quick` `--json` `--trace`) |
| `imp-recalc.js` | 重算校准 oldImp |
| `calibrate-batch.js` | 批量 imp 校准 |
| `server.js` | 独立HTTP服务器(:8766) |
| `ui.html` | 评估面板(调用链+评分+详情) |

### 当前分
```
🏆 73/100
  search 93 · imp 34 · consolidation 43 · staleness 100 · health 95
```

---

## 七、安全

- **POST+CSRF**: 写操作强制POST, Origin/Referer校验
- **进程锁**: distill写入 acquireLock(120s超时)
- **proposals上限**: ≤10条
- **截断保护**: imp≥0.7 → medium备份
- **safePath**: 统一白名单防目录穿越
- **权限模块**: agent/session级读写控制

---

## 八、配置

`memory/engine/config.json`:
```json
{
  "retention": {"injectDays":7, "rawDays":30, "mediumDays":180, "trashDays":15},
  "thresholds": {
    "consolidateMinMsgs":8, "consolidateMinHighImp":2,
    "consolidateMinImpSum":3.0, "consolidateIntervalMs":1800000,
    "workingUpdateMsgs":3, "rawMaxChars":800
  },
  "recordRaw": true,
  "embed": {"defaultEnabled": true, "maxRecentDays": 30, "dims":512},
  "weights": {"keyword":{...}, "semantic":{...}, "hybrid":{...}, ...}
}
```

---

## 九、版本历史

| 版本 | 日期 | 行数 | 命令 | 核心 |
|------|------|------|------|------|
| v4 | 08-07 | ~3600 | 44 | 记忆回响·话题续接·成长日志·话题标签·摘要自评·过期降级·对话模式·知识缺口·心跳图·时光机·stale追踪·冲突修复·251校准·评估面板 |
| v3 | 08-06 | 3092 | 36 | POST+CSRF·截断保护·IMP_TECH·待办过滤·hook检测·sync --quick |
| v2 | 08-06 | 2981 | 36 | 可配置·回收站·建议清理·自动整合·夜间蒸馏 |
| v1 | 08-05 | 2447 | 28 | 四层架构·语义索引·7路搜索·Web UI |

---

*🦞 Mnemosyne v4 · 2026-08-07 · 零依赖 · 配置即用*
