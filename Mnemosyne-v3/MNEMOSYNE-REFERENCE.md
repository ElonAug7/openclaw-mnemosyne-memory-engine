# 🦞 Mnemosyne v4 — 终极能力手册（完整版）

> ~3500 行引擎 + 600 行 Web 服务器 · 130+ 函数 · 44 命令 · 32 API · 零依赖 · 全部验证

---

## 目录

1. [架构概览](#一架构概览)
2. [CLI 命令全集](#二cli-命令全集)
3. [v4 记忆回响](#三v4-记忆回响)
4. [P0+P1 主动智能](#四p0p1-主动智能)
5. [P2+P3 精度与可视化](#五p2p3-精度与可视化)
6. [用户画像系统](#六用户画像系统)
7. [Web 控制台](#七web-控制台)
8. [API 端点](#八api-端点)
9. [imp 评分系统](#九imp-评分系统)
10. [搜索系统](#十搜索系统)
11. [自动化管线](#十一自动化管线)
12. [健康检查](#十二健康检查)
13. [安全机制](#十三安全机制)
14. [配置文件参考](#十四配置文件参考)
15. [版本历史](#十五版本历史)

---

## 一、架构概览

```
用户消息 → Hook → record → imp评分 → recall自动触发(imp≥0.4)
                         ↓
              working memory 刷新（含对话模式+知识缺口）
              consolidate 检查 → 话题标签 + 质量自评 → medium
                         ↓
会话启动 → sync --quick → context（话题续接>12h）→ 待办提醒
                         ↓
每晚22:30 → nightly distill → proposals(≤10) → agent审阅 → MEMORY.md
                         ↓
              growth.md 自动记录 · stale.json 命中追踪
```

### 记忆层结构

| 层 | 路径 | 生命周期 | 注入模型 | 说明 |
|---|------|---------|-----------|------|
| 🔍 索引 | `memory/index/index.md` | 永久 | ✅ | 中期摘要关键词索引 |
| 📝 短期·raw | `memory/short/raw/YYYY-MM-DD.jsonl` | 30天→gzip | ❌ | 原始消息流，含 imp |
| 📝 短期·working | `memory/short/working/current.json` | 实时刷新 | ✅ | 任务/决策/问题/模式/缺口 |
| 📝 短期·inject | `memory/short/inject/YYYY-MM-DD.json` | 7天 | ✅ | 话题/事实/决策 |
| 📚 中期 | `memory/medium/YYYY-MM-DD.md` | 180天→gzip | ✅ | 按日摘要块（含标签+质量） |
| 🏛️ 长期 | `MEMORY.md` | 永久 | ✅ | 全局知识 |
| 👤 画像 | `memory/profile.md` | 永久 | ✅ | 用户偏好/风格/个性 |
| 🌱 成长 | `memory/growth.md` | 永久 | ❌ | 知识点新增记录 |
| 📊 stale | `memory/engine/stale.json` | 永久 | ❌ | MEMORY.md 条目命中追踪 |

---

## 二、CLI 命令全集

### 2.1 记录与同步（3 个）

| 命令 | 用法 | 说明 |
|------|------|------|
| `record` | `--role user\|assistant --text "..."` | 消息落盘（hook 自动调用） |
| `sync` | `[--quick]` | 全量/快速同步（转录+索引+归档+整合+画像） |
| `init` | 无 | 幂等创建全部目录+模板 |

### 2.2 搜索（1 命令，5 模式）

| 模式 | 说明 |
|------|------|
| `keyword` | 关键词精确+模糊匹配（默认） |
| `semantic` | 语义向量搜索（需先 embed） |
| `hybrid` | 关键词+语义融合（推荐日常） |
| `recent` | 偏重短期记忆权重 |
| `history` | 偏重长期记忆 & MEMORY.md |

搜索命中 MEMORY.md 条目时自动更新 `stale.json` 追踪。

### 2.3 引擎控制（3 个）

| 命令 | 说明 |
|------|------|
| `status` | 30+ 字段完整状态 |
| `enable` / `disable` | 开关自动记录 |
| `record-raw --enable/--disable` | 仅开关 raw 对话记录 |

### 2.4 记忆维护（5 个）

| 命令 | 说明 |
|------|------|
| `consolidate` | 手动触发中期摘要整合 |
| `todos` | 待办清单（提取/添加/完成） |
| `embed [--force]` | 构建/刷新语义索引 |
| `reindex` | 索引补全 |
| `cleanup [--confirm]` | 清理无用文件 |

### 2.5 v4 记忆回响（7 个）

| 命令 | 用法 | 说明 |
|------|------|------|
| `context` | 无 | 会话上下文：话题续接(>12h)+待办+问题+决策 |
| `recall` | `--query "..."` | 上下文闪回：hybrid搜索 top 3 历史 |
| `report` | `[--date YYYY-MM-DD] [--weekly]` | 每日/每周报告 |
| `profile` | `[--update]` | 用户画像（自动更新+可编辑） |
| `ask` | `--query "决定\|待办\|偏好\|话题" [--days N]` | 结构化记忆问答 |
| `time-travel` | `--list \| --restore <id>` | 记忆时光机：查看/恢复历史版本 |
| `stale` | `[--days 60]` | 过期记忆检测 |

### 2.6 运维调试（10 个）

| 命令 | 说明 |
|------|------|
| `health` | 13 项健康检查 |
| `stats` | 消息/imp 分布/关键词统计 |
| `conflict` | MEMORY.md 冲突检测+自动修复建议 |
| `distill-proposals --list/--apply <id>` | 审阅长期记忆候选 |
| `distill-reject --id <id>` | 拒绝候选 |
| `imp-calibrate --date --line --imp` | 手动校准消息 imp |
| `backup` | 备份工作区 |
| `export` | 导出记忆为 tar.gz |
| `restore --list/--from latest` | 版本恢复 |
| `help` | 完整帮助 |

---

## 三、v4 记忆回响

### context — 会话上下文

```bash
node tools/memory-engine/engine.js context
```

返回：
- `resume`: 若距上次 >12h，自动检测话题续接（含 repeatedTopics 重复检测）
- `todos`: 未完成待办（>3 天标 urgent）
- `questions`: 工作记忆中待确认问题
- `decisions`: 最近决策

### recall — 上下文闪回

**手动调用：**
```bash
node tools/memory-engine/engine.js recall --query "模型切换方案"
```

**自动触发：** hook 中 imp≥0.4 且长度>20 的用户消息自动执行，结果写入 `memory/short/working/last-recall.json`。

### report — 每日/每周报告

```bash
# 今天
node tools/memory-engine/engine.js report
# 指定日期
node tools/memory-engine/engine.js report --date 2026-08-06
# 周报
node tools/memory-engine/engine.js report --weekly
```

### ask — 记忆问答

```bash
# 最近14天决策
node tools/memory-engine/engine.js ask --query "决定"
# 最近90天决策
node tools/memory-engine/engine.js ask --query "决定" --days 90
# 待办
node tools/memory-engine/engine.js ask --query "待办"
# 偏好
node tools/memory-engine/engine.js ask --query "偏好"
```

### profile — 用户画像

```bash
node tools/memory-engine/engine.js profile          # 查看
node tools/memory-engine/engine.js profile --update # 强制刷新
```

画像成熟度：150轮≈70%，每50轮+5%，上限95%。
UI 可点 ✏️ 手动编辑修正。

---

## 四、P0+P1 主动智能

| 功能 | 机制 | 触发 |
|------|------|------|
| ⑬ 话题续接 | 检查 lastMessageAt >12h，读取上次 medium 摘要 | context 命令 |
| ② 重复检测 | 对比 resume.pendingQuestions 和当前 openQuestions | context 命令 |
| ⑤ 成长日志 | MEMORY.md 新增条目 → `memory/growth.md` 表格行 | distill apply 后 |
| recall 自动 | imp≥0.4 & len>20 → hybrid搜索 top3 | record 后 fire-and-forget |
| ask --days | 默认14天，支持 --days N，无结果 fallback 全量 | ask 命令 |

---

## 五、P2+P3 精度与可视化

| 功能 | 机制 | 访问 |
|------|------|------|
| ④ 心跳图 | 30天热力图，颜色深浅映射消息数 | UI 💓 按钮 → `/api/stats` |
| ⑦ 话题标签 | 摘要块标题后 + `[#tech] [#decision]` 等 | consolidate 时自动 |
| ⑨ 过期降级 | search 命中更新 stale.json，>60天标 stale | `stale` 命令 |
| ⑧ 冲突修复 | 检测 MEMORY.md 矛盾条目 → autoResolve 建议 | `conflict` 命令 |
| ⑪ 对话模式 | 统计 user 句式 → instruction/question/confirmation/discussion | working memory 自动 |
| ⑮ 知识缺口 | 追踪"不知道/查一下/没找到" | working memory 自动 |
| ⑱ 摘要自评 | `<!-- quality: ✅ 完整 / 缺少XX -->` | consolidate 时自动 |
| ㉑ 周报 | 7天话题排行+决策数 | `report --weekly` |
| ⑳ 时光机 | 版本快照列表+内容查看 | `time-travel --list/--restore` |
| ㉒ 访问日志 | 引擎活动统计 | UI 📜 按钮 → `/api/status` |

---

## 六、用户画像系统

`memory/profile.md` 自动维护，含：
- 💻 技术偏好（从 MEMORY.md 提取）
- 💬 沟通风格（简洁/详细）
- 🎯 当前关注项目
- 🌟 个性碎片（追求优雅/安全执着/开源信仰…）
- 📝 偏好清单
- 🧬 成熟度百分比 + 温暖提示

底部注释 `<!-- 用户可手动编辑此文件修正画像 -->`

---

## 七、Web 控制台

`http://127.0.0.1:8765`

### UI 布局
- 左侧：可折叠侧栏（◀/▶）+ 📦 更多工具组
- 中间：文件内容区（Markdown 渲染 / JSONL 聊天气泡）
- 右下：工作台浮窗（实时任务/问题/决策文本）
- 底部：浮动快捷按钮（待办/报告/画像/决策）

### 工具组（📦 更多 ▾）
- 🌱 成长日志 · 💓 心跳图 · 📊 报告 · 💡 决策
- ⏳ 时光机 · 📜 访问日志

### 功能
- 文件搜索（📁文件名 / 🧠内容混合搜索）
- 搜索结果点击跳转行 + 橙色脉冲高亮
- 画像 ✏️ 编辑按钮 → textarea → 💾 保存
- 待办输入 + 一键完成
- 回收站 + 建议清理
- Toast 通知（顶部，3s）

---

## 八、API 端点

### GET（读操作）

| 端点 | 说明 |
|------|------|
| `/api/status` | 引擎完整状态（含 workingMemory） |
| `/api/files` | 文件列表（分层+大小+时间） |
| `/api/file?p=...` | 读取文件内容 |
| `/api/download?p=...` | 下载文件 |
| `/api/search?q=...&mode=...` | 记忆搜索 |
| `/api/todos` | 待办清单 |
| `/api/cleanup-suggestions` | 建议清理列表 |
| `/api/stats` | 消息统计（daily/importance/keywords） |
| `/api/versions` | 版本快照列表 |
| `/api/version?id=...` | 读取特定版本内容 |
| `/api/trash` | 回收站列表 |
| `/api/version-history` | 版本变更历史 |
| `/api/logo` | 引擎 logo |

### POST（写操作 — CSRF 保护）

| 端点 | 说明 |
|------|------|
| `/api/enable` / `/api/disable` | 开关记录 |
| `/api/delete` | 移入回收站 |
| `/api/trash/restore` | 恢复文件 |
| `/api/trash/purge` | 彻底删除 |
| `/api/todos/add` | 添加待办 |
| `/api/todos/done` | 完成待办 |
| `/api/save` | 保存文件（含画像编辑） |
| `/api/backup` | 触发备份 |
| `/api/signal` | 手动触发摘要信号 |

---

## 九、imp 评分系统

```
基准: user=0.35, assistant=0.30
加成:
  IMP_TECH     +0.12  优化/架构/代码/bug/修复/性能/安全/配置/评估/方案
  IMP_DECISION +0.30  决定/确认/结论/选定/采纳/最终方案/agreed
  IMP_TODO     +0.25  待办/todo/下一步/计划/提醒/别忘了/deadline
  IMP_FACT     +0.10  含数字+单位
  QUESTION     +0.05  以问号结尾（仅 user）
  LONG         +0.05  长度>500字符
封顶: 1.0
闲聊降级: 0.1（哈哈/嗯/好的/ok/谢谢/收到/明白）

手动校准: engine.js imp-calibrate --date "..." --line N --imp 0.8

recall 自动触发阈值: imp≥0.4 且 文本长度>20
```

---

## 十、搜索系统

7 路并行召回（working / inject / raw / medium / long / idx / semantic），5 种权重策略。

搜索命中 MEMORY.md 条目时自动调用 `trackMemoryHit()` 更新 `memory/engine/stale.json`。

---

## 十一、自动化管线

| 管线 | 触发 | 说明 |
|------|------|------|
| record | 每条消息 | sanitize → compress → imp评分 → raw JSONL |
| recall auto | imp≥0.4 user msg | hybrid搜索 top3 → last-recall.json |
| working refresh | imp≥0.5 累积3条 | 任务/决策/问题/模式/缺口 |
| consolidate | 30min节流 + 3条件 | 话题标签 + 质量自评 → medium |
| reindex | 每次 record/sync | 自动补全索引 |
| archive | sync 时检查 | >30天 raw gzip · >180天 medium gzip |
| nightly distill | 22:30 cron | ≤10 proposals → agent审阅 |
| growth log | distill apply | MEMORY.md 新增 → growth.md |
| stale track | search 命中 | 更新 stale.json 时间戳 |
| profile update | sync/consolidate | 画像自动刷新 |

---

## 十二、健康检查

`health` 命令 13 项检查，100分制：

1. 摘要块索引完整性
2. MEMORY.md 模板状态
3. 引擎启用状态
4. hook 活跃度（>2h无消息报警）
5. 短期记忆非空
6. 摘要块覆盖率（有对话无摘要）
7. 语义索引完整性 + 新鲜度
8. 待办噪音检测
9. 待办数量告警（>15条）
10. devlog 膨胀检查
11. git 仓库检测
12. stale 过期条目数
13. 配置完整性

---

## 十三、安全机制

- **POST+CSRF**：写操作端点强制 POST，Origin/Referer 校验
- **进程锁**：distill 写入时 acquireLock(120s 超时)
- **proposals 上限**：离线积压 ≤10 条
- **截断保护**：imp≥0.7 的消息截断前存入 medium
- **safePath**：统一路径白名单防目录穿越
- **权限模块**：agent/session 级读写控制

---

## 十四、配置文件参考

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
  "weights": { /* 5模式×7层权重 */ }
}
```

---

## 十五、版本历史

| 版本 | 日期 | 核心 |
|------|------|------|
| **v4** | 2026-08-07 | 记忆回响 · 话题续接 · 成长日志 · 话题标签 · 过期降级 · 心跳图 · 对话模式 · 知识缺口 · 摘要自评 · 周报 · 时光机 · stale追踪 · 冲突修复 · 画像可编辑 · 按钮收纳 |
| **v3** | 2026-08-06 | POST+CSRF · 截断保护 · IMP_TECH · 待办过滤 · hook检测 · sync --quick · health13项 |
| **v2** | 2026-08-06 | 可配置 · 友好命名 · 回收站 · 建议清理 · 自动整合 · 夜间蒸馏 |
| **v1** | 2026-08-05 | 四层架构 · 语义索引 · 7路搜索 · Web UI · 可移植安装 |

---

*🦞 Mnemosyne v4 · ~3500 行 · 130+ 函数 · 44 命令 · 32 API · 零依赖 · P0+P1+P2+P3 全部交付*
