# 🦞 Mnemosyne v4 — OpenClaw 可移植认知记忆引擎

> **Mnemosyne**（谟涅摩绪涅）— 希腊记忆女神，泰坦神族，九位缪斯之母。

> **零第三方依赖 · 纯 Node.js · 单文件夹部署 · 一键安装**

---

## 📦 新用户：3 步上手

```bash
# 1. 复制到工作区
cp -r Mnemosyne-v4 ~/.openclaw/workspace/tools/

# 2. 安装（自动重命名 + 杀旧进程 + 重启 UI）
cd ~/.openclaw/workspace/tools/Mnemosyne-v4 && bash install.sh

# 3. 重启网关
openclaw gateway restart
```

打开 `http://127.0.0.1:8765` 即可使用。

---

## 🧠 v4 核心能力

### 记忆回响（5 条命令 + 自动触发）

| 命令 | 功能 | 触发时机 |
|------|------|---------|
| `context` | 📋 会话上下文 + 话题续接 | 每次新会话启动（AGENTS.md 自动执行） |
| `recall` | 🔮 上下文闪回（top 3 历史） | agent 回复前手动 → hook 自动（imp≥0.4 & 长度>20） |
| `report` | 📊 每日/每周报告 | `--date` 指定日 / `--weekly` 周报 |
| `profile` | 👤 用户画像 | sync/consolidate 自动更新，UI 实时刷新 |
| `ask` | 💡 结构化记忆问答 | `--query "决定/待办/偏好/话题" [--days N]` |

### P0+P1 主动智能

- **⑬ 话题续接**：距上次 >12h 自动检测，"上次聊到 XXX，欢迎回来"
- **⑤ 记忆成长日志**：`MEMORY.md` 新增条目自动录入 `memory/growth.md`
- **recall 自动触发**：hook 中 imp≥0.4 的用户消息自动搜索历史
- **ask --days**：支持天数参数 + 无结果自动 fallback 全量
- **画像可编辑**：UI 点击 ✏️ 编辑，手动修正不会被自动刷新覆盖

### P2+P3 精度与可视化

- **④ 记忆心跳图**：30 天热力图，颜色深浅映射活跃度
- **⑦ 话题标签**：摘要块自动标签 `#decision` `#planning` `#tech` `#preference`
- **⑨ 过期记忆降级**：追踪 MEMORY.md 条目搜索命中时间，超 60 天标 stale
- **⑧ 冲突自动修复**：检测 MEMORY.md 矛盾条目，自动标记 superseded
- **⑪ 对话模式识别**：自动分类 instruction / question / confirmation / discussion
- **⑮ 知识缺口检测**：追踪"不知道/查一下/没找到"标记 knowledge gap
- **⑱ 摘要质量自评**：每块含 `<!-- quality: ✅/缺失XX -->` 标记
- **㉑ 周报**：`report --weekly` 汇总 7 天话题排行 + 决策数
- **⑳ 记忆时光机**：浏览/恢复历史 MEMORY.md 版本快照
- **㉒ 访问日志**：UI 📜 按钮查看引擎活动统计

---

## 🏗️ 四层记忆架构

| 层 | 路径 | 说明 |
|---|------|------|
| 🔍 索引 | `memory/index/index.md` | 中期摘要关键词索引，agent 最先查 |
| 📝 短期·raw | `memory/short/raw/` | 原始消息流，含 imp 评分 |
| 📝 短期·工作台 | `memory/short/working/` | 当前任务、待确认问题、最近决策、对话模式 |
| 📚 中期 | `memory/medium/` | 按日摘要块，含话题标签 + 质量自评 |
| 🏛️ 长期 | `MEMORY.md` | 全局知识，夜间提炼 + 人工审阅 |
| 👤 画像 | `memory/profile.md` | 用户偏好/技术栈/沟通风格/个性碎片 |
| 🌱 成长 | `memory/growth.md` | 每次新增知识点自动记录 |

---

## ⚙️ 自动化管线

```
消息落盘 → imp评分 → recall自动触发 → 工作记忆刷新（含模式/缺口）
consolidate → 话题标签 + 质量自评 → medium 摘要块 + profile 更新
会话启动 → sync --quick → context（含话题续接） → 待办提醒
每晚22:30 → nightly distill → proposals审阅（上限10条）
```

---

## 🔍 搜索引擎

```bash
engine.js search --query "关键词" --mode keyword|semantic|hybrid|recent|history
```

7路并行召回，5种模式权重可配。hybrid 模式推荐日常使用。
命中 MEMORY.md 条目自动更新 stale 追踪。

---

## 🛡️ 安全机制

- **POST+CSRF**：写操作端点强制 POST，Origin 校验
- **proposals 上限**：离线积压 ≤10 条
- **截断保护**：imp≥0.7 的消息截断前存入 medium
- **待办过滤**：`isTodoNoise()` 防碎片误抓
- **hook 检测**：health 监控 >2h 无消息报警
- **进程锁**：distill 写入时 acquireLock(120s 超时)

---

## 📊 imp 评分

```
基准: user=0.35, assistant=0.30
加成: IMP_TECH +0.12 | IMP_DECISION +0.30 | IMP_TODO +0.25 | IMP_FACT +0.10
封顶: 1.0 | 闲聊: 0.1
recall 自动触发: imp≥0.4 & 长度>20
```

---

## 🌐 Web 控制台

`http://127.0.0.1:8765`

- 可折叠侧栏 + 📦 更多工具组（成长/心跳/报告/决策/时光/日志）
- 内容搜索（📁文件 / 🧠内容）→ 结果可点击跳转行 + 关键词脉冲动画
- 右下角工作台浮窗：实时显示当前任务、待确认问题、最近决策文本
- 画像页 ✏️ 编辑按钮 → 可手动修正画像
- 30天心跳热力图 💓
- 记忆时光机 ⏳ → 浏览/查看历史版本
- 待办输入 + 一键完成
- 回收站 + 建议清理

---

## 📋 命令速查

### 🤖 日常（Agent 自动执行）
```
record  | sync --quick | context | recall | consolidate | todos
```

### 🧑 运维（用户偶尔手动）
```
status | search | report [--weekly] | profile | ask [--days N]
time-travel --list | --restore <id> | stale [--days 60] | conflict
health | stats | cleanup
```

### 🔧 调试（出问题时才用）
```
enable/disable | embed | reindex | backup | export | distill-proposals | signal
```

> 💡 完整命令清单：`node tools/memory-engine/engine.js help`

---

## 🔧 可配置

`memory/engine/config.json` — 保留期/阈值/权重/语义索引开关/consolidate 触发条件。

---

## 📜 版本历史

| 版本 | 日期 | 核心 |
|------|------|------|
| **v4** | 08-07 | 记忆回响（context/recall/report/profile/ask）· 话题续接 · 成长日志 · 话题标签 · 过期降级 · 心跳图 · 对话模式 · 知识缺口 · 摘要自评 · 周报 · 时光机 · stale追踪 · 冲突修复 · 画像可编辑 |
| **v3** | 08-06 | POST+CSRF · 截断保护 · IMP_TECH · 待办过滤 · hook检测 · sync --quick · health13项 |
| **v2** | 08-06 | 可配置 · 友好命名 · 回收站 · 建议清理 · 自动整合 · 夜间蒸馏 |
| **v1** | 08-05 | 四层架构 · 语义索引 · 7路搜索 · Web UI · 可移植安装 |

---

*🦞 Mnemosyne v4 · P0+P1+P2+P3 全部交付 · 零依赖 · 配置即用*
