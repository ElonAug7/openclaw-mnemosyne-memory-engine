# 🦞 Mnemosyne v2 — 终极能力手册（完整版）

> 4316 行代码 · 109 个引擎函数 · 42 个 CLI 命令 · 30+ API 端点 · 零第三方依赖 · 全部验证通过

---

## 一、CLI 命令全集（42 个）

### 1.1 引擎控制

| 命令 | 参数 | 输出 | 说明 |
|------|------|------|------|
| `status` | 无 | `{enabled, turns, totalMessages, lastSignalAt, lastMessageAt, semanticEnabled, lastArchiveCheckAt, lastMediumCheckAt, lastCleanupAt, highImpMsgs, lastConsolidateTs, lastConsolidateAt, autoConsolidations, lastDistillAt, nextShortIn, nextMediumIn, nextSignalIn, version, semanticIndex:{enabled,mode,items,updatedAt}, todos:{total,open}, retention:{injectDays,rawDays,mediumDays,...}, config:{weights}, workingMemory:{task,state,decisions,questions}, shortLayers:{对话记录,工作台,今日摘要}, pendingProposals, recordRaw}` | 引擎完整状态（30+ 字段） |
| `enable` | 无 | `{enabled: true}` | 开启全部自动记录 |
| `disable` | 无 | `{enabled: false}` | 暂停全部自动记录 |
| `record-raw` | 无 | `{recordRaw: true/false, usage}` | 查看对话记录开关状态 |
| `record-raw` | `--enable` | `{recordRaw: true, note: "对话记录已开启"}` | 仅开启 raw 记录 |
| `record-raw` | `--disable` | `{recordRaw: false, note: "对话记录已关闭（仅关闭 raw，其他功能正常）"}` | 仅关闭 raw 记录（consolidate/sync/distill 照常） |
| `signal` | 无 | `{signalSent: true, turns: N}` | 手动触发摘要信号，发送到 Gateway |
| `init` | 无 | `{initialized: true, root: path, dirs: {...}}` | 创建全部目录 + 写入模板文件（MEMORY.md/index.md/PROTOCOL.md），幂等 |

### 1.2 记录与同步

| 命令 | 参数 | 输出 | 说明 |
|------|------|------|------|
| `record` | `--role user\|assistant --text "内容"` | `{recorded, turns, totalMessages, imp, consolidated}` | 记录单条消息，由 hook 调用。完整流程：sanitize→compress→imp→raw写→todo提取→signal检查→consolidate→转录补录→索引补全 |
| `sync` | 无 | `{synced:{added,files,sessions}, reindexed:{added}, archived:{shortArchived,mediumArchived}, working:{task,state,decisions,questions}, inject:{topics,facts,decisions,confidence}, mediumNeeded, consolidated, suggestions, todos, rawTrimmed, compensation, version, distillCatchUp, at}` | 10 步全量同步，详见自动化管线 |

**sync 的 10 个步骤：**
```
0a. 数据迁移：旧 conversations/ → raw/
0b. raw 截断 + P1 补偿扫描
1.  转录补录 → raw（增量 offset，去重）
2.  索引补全 → index.md
3.  归档检查 → 短期>30天 gzip，中期>180天 gzip，同步 .idx.json
4.  工作记忆刷新 → working/current.json
5.  今日摘要生成 → inject/YYYY-MM-DD.json
6.  自动整合检查 → medium/ 摘要块 + 索引
7.  蒸馏补漏检查 → >20h无蒸馏则从inject提取proposals
8.  TODO 提取 → todos.json + todos.md
9.  静默清理（每天一次）
10. MEMORY.md 版本快照 + 内容索引
```

### 1.3 搜索（7 路并行召回）

**命令：** `search --query "关键词" [--mode keyword|semantic|hybrid|recent|history]`

**输出：** `{query, mode, fallback, total, layers, weights, results:[{file, hits:[{line, text, context, imp}], score, archived}], indexInfo}`

**5 种模式的 7 层权重分配表：**

| 层 (layer) | keyword | semantic | hybrid | recent | history |
|------------|---------|----------|--------|--------|---------|
| 工作台 (working) | 0.08 | 0.08 | 0.10 | 0.25 | 0.02 |
| 今日摘要 (inject) | 0.10 | 0.10 | 0.12 | 0.20 | 0.03 |
| 对话记录 (raw) | 0.12 | 0.10 | 0.15 | 0.25 | 0.05 |
| 中期摘要 (medium) | 0.22 | 0.25 | 0.22 | 0.15 | 0.20 |
| 长期知识 (long) | 0.25 | 0.22 | 0.18 | 0.10 | 0.45 |
| 索引 (index) | 0.18 | 0.05 | 0.08 | 0.03 | 0.20 |
| 语义向量 (semantic) | 0.05 | 0.20 | 0.15 | 0.02 | 0.05 |

**搜索机制详解：**
- **keywordSearch**: 遍历 allMemoryFiles()（含 .gz 归档），对 .gz 先查 .idx.json 索引命中才解压。每文件最多 10 条命中，上下文提取（前后各 1 行），imp 加权排序
- **semanticSearch**: 128 条本地向量（bigram+trigram），远端 API 优先→本地回退。余弦相似度排序，imp 加成
- **multiPathSearch**: 并行调用 keyword + semantic（根据 mode），mergeSortResults 加权合并。去重 key: `file:text[:40]`，combinedScore = weight × score × (1+imp)
- **自动降级**: `semanticEnabled=false` 时 semantic/hybrid → keyword
- **embed 自动触发**: 语义未构建时 search 自动执行 cmdEmbedSilent

### 1.4 记忆整合

| 命令 | 参数 | 输出 | 说明 |
|------|------|------|------|
| `consolidate` | 无（默认） | `{needed, reason, newMessages, highImpCount, impSum}` | 节流检查（30min），判断是否需要 |
| `consolidate` | `--check` | `{needed, newMessages, highImpCount, impSum}` | 强制检查，不写文件 |
| `consolidate` | `--force` | `{needed, written, messages, highImpCount, topics, indexUpdated}` | 强制执行整合，无视节流 |
| `reindex` | 无 | `{added: N}` | 扫描 medium/*.md，为每个 ## 标题块追加 index.md 索引行 |
| `content-index` | `[--force]` | `{builtAt, sectionCount, sections:[{title, entries:[{content,source}], keywords, entities}]}` | 解析 MEMORY.md 构建结构化关键词/实体/时间索引 |
| `reindex-all` | `[--force]` | `{reindex, contentIndex, embed}` | 全量三合一重建：索引补全 + 内容索引 + 语义向量 |

**consolidate 触发条件（三选一）：**
1. 新消息 ≥ 8 条（`consolidateMinMsgs`）
2. 高重要性消息（imp≥0.5）≥ 2 条（`consolidateMinHighImp`）
3. imp 总和 ≥ 3.0（`consolidateMinImpSum`）

**consolidate 执行流程：**
```
1. readNewMessages(lastConsolidateTs) → 获取未整合消息
2. buildAutoSummaryBlock(msgs) → 生成 Markdown 摘要块
   - 话题词频（中文 2-6 字，过滤停用词）
   - 决策提取（IMP_DECISION 正则）
   - 事实提取（user+数字的消息）
   - 待办提取（TODO_PATTERNS 正则）
3. 追加到 medium/YYYY-MM-DD.md
4. reindex() → 同步索引行
5. buildContentIndex() → 刷新内容索引
6. 更新 lastConsolidateTs + lastConsolidateAt
```

### 1.5 长期记忆审阅

| 命令 | 参数 | 输出 | 说明 |
|------|------|------|------|
| `save-distill` | `--section "小节名" --content "条目内容" [--source "..."] [--confidence 0.8]` | `{saved: true, total: N}` | 存入 distill-proposals.json，更新 lastDistillAt。confidence 0-1 |
| `distill-proposals` | `--list` | `{total, pending, proposals:[{id,section,content,source,confidence,status,created_at}], updated_at}` | 列出 pending 状态提案（最多 20 条） |
| `distill-proposals` | `--apply <id>` | `{applied: true/false, proposal}` | 审阅通过写入 MEMORY.md。流程：acquireLock→读取 MEMORY.md→查找对应小节→去重检查（前 40 字符）→追加条目→写入→snapshotMEMORY→buildContentIndex→releaseLock→devlog |
| `distill-reject` | `--id <id> [--reason "..."]` | `{rejected: true, proposal}` | 拒绝提案。写入 status:"rejected" + rejected_at + reason |

**MEMORY.md 小节名参考：** 用户偏好、关键事实、当前项目、重要事件、变更记录

### 1.6 重要性校准

| 命令 | 参数 | 输出 | 说明 |
|------|------|------|------|
| `imp-calibrate` | `--date "YYYY-MM-DD" --line <N> --imp 0.8 [--reason "..."]` | `{calibrated, date, line, oldImp, newImp, text}` | 读取 raw JSONL 第 N 行，覆盖 imp 值，校准记录写入 imp-calibration.json |

### 1.7 版本管理

| 命令 | 参数 | 输出 | 说明 |
|------|------|------|------|
| `version` | `[--force]` | `{snapshotted, version:"YYYY-MM-DDTHH-MM-SS", hash, sections}` | MEMORY.md 快照。节流 1h（VERSION_COOLDOWN），force 无视节流 |
| `version-history` | 无 | `{versions:[{id, ts, hash, size, sections}]}` | 最近 50 个快照（按时间降序） |
| `version-diff` | `[--v1 <id> --v2 <id>]` | `{v1, v2, diff:[{section, type:"added"|"removed"|"modified", old, new}]}` | 对比两个版本的标题级差异。默认最新 vs 前一个 |
| `conflict` | 无 | `{conflicts:[]}` | 扫描 MEMORY.md 相邻条目矛盾（正则检测冲突关键词） |
| `restore` | `--list` | `{action:"list", versions, hint}` | 列出可恢复版本 |
| `restore` | `--id <vid>` | `{restored, version, ts, hash, note}` | 恢复指定快照到 MEMORY.md（先备份当前版） |
| `restore` | `--from latest` | 同上 | 恢复到最新快照 |

### 1.8 待办

| 命令 | 参数 | 输出 | 说明 |
|------|------|------|------|
| `todos` | 无 | `{total:N, open:N, done:N, todos:[{id,text,status,source,created_at,done_at}]}` | 列出全部待办 |
| `todos` | `--add "内容"` | `{added:true, id:N}` | 手动添加待办 |
| `todos` | `--done <id>` | `{completed:true, id:N}` | 标记完成 |

**自动提取规则（3 组正则，仅高 imp user 消息触发）：**
```
TODO_PATTERNS:
  1. /待办|TODO|FIXME)[：:]\\s*(.+)/gi     → 显式标记
  2. /提醒我|记得|别忘了)[：:,，]?\s*([^。\n]{4,60})/g → 提醒类
  3. /下一步|计划)[：:]\\s*(.+)/gi          → 计划类
```

去重：相同 text 前 60 字符的待办不重复添加。

### 1.9 运维

| 命令 | 参数 | 输出 | 说明 |
|------|------|------|------|
| `health` | 无 | `{score:0-100, issues:[{severity, type, msg}], checkedAt}` | 9 项健康检查 |
| `stats` | 无 | `{turns, totalMessages, daily:{...}, archivedDays:{...}, importance:{low,mid,high}, medium:{files,avgSize}, index:{entries}, todos:{total,open}}` | 统计仪表盘 |
| `backup` | `[--msg "提交信息"]` | `{saved:true, commit, files}` | `git add memory/ MEMORY.md SOUL.md AGENTS.md TOOLS.md && git commit` |
| `backup-log` | 无 | `{commits:[{hash, date, message}]}` | 最近 20 条 git log（仅 memory/ + MEMORY.md 相关） |
| `cleanup` | `[--dry] [--confirm]` | `{cleanup, dryRun, deletedFiles, freedBytes, freedKB, details:[{action,file,reason}], rules, note}` | 7 项清理 |
| `export` | 无 | `{exported, file, size}` | 打包 memory/ 为 tar.gz（输出到 workspace 根） |
| `timeline` | 无 | `{total, timeline:[{date, messages, summaries, titles}]}` | 按日汇总（raw消息数 + medium标题列表） |
| `sessions` | 无 | `{total, windowHours:48, sessions:[{agent,session,messages,firstTs,lastTs,topic}]}` | 多会话聚合（扫描 transcripts 最近 48h） |
| `devlog` | `[--log "事件"]` | `{logged, line}` 或 `{total, recent}` | 开发日志追加/查看最近 |
| `config` | `--get key` | JSON value | 读取配置 |
| `config` | `--set key --value val` | `{set, key, value}` | 修改配置（deepMerge） |
| `config` | `--reset` | `{reset}` | 恢复默认配置 |
| `permission` | `[--agent <id> --level read\|write\|admin]` | `{default, agentCount, agents}` | 查看/设置 agent 级权限 |
| `permission` | `--default read\|write` | `{default}` | 设置默认权限级别 |
| `embed` | `[--force]` | `{embedded, dims, items, mode:"local"\|"remote"}` | 构建语义向量索引。force 强制重建 |
| `embed` | `--enable` | `{semanticEnabled:true}` | 开启语义搜索 |
| `embed` | `--disable` | `{semanticEnabled:false}` | 关闭语义搜索 |

**health 检查的 9 项标准：**
```
1. 目录完整性：所有 D.* 目录存在
2. state.json 可读
3. MEMORY.md 存在
4. index.md 存在
5. raw 文件无损坏 JSON
6. 索引无断裂（medium 块都有 index 行）
7. 无残留锁文件（超时自动清理）
8. 引擎 enabled
9. 语义索引健全（如启用）
```

**cleanup 的 7 项清理：**
```
1. 过期 inject 文件 (>injectDays)
2. 过期 suggestions 条目 (>suggestionDays)
3. 调试日志文件 (>logDays)
4. 超出保留数的版本快照 (>VERSION_RETAIN)
5. 回收站到期文件 (>trashDays)
6. 孤立 workmemory 备份文件
7. 空目录
```

---

## 二、引擎全部函数（109 个按模块）

### A. 入口与工具

| 函数 | 位置 | 功能 |
|------|------|------|
| `main()` | 2861 | CLI 入口，arg 解析（--key value），switch 分发 30+ 命令 |
| `out(o)` | 121 | JSON.stringify 输出 |
| `today()` | 113 | YYYY-MM-DD |
| `nowIso()` | 120 | ISO 8601 UTC 时间戳 |
| `dayOf(ts)` | 114 | 时间戳→日期字符串 |
| `daysAgo(dateStr)` | 123 | 计算天数差 |
| `hashStr(s,mod)` | 130 | FNV-1a 哈希 |
| `contentHash(text)` | 139 | 内容哈希（用于版本比较） |
| `ensureDirs()` | 147 | 创建所有目录+模板，debug log 50KB 轮转 |
| `loadTemplate(name)` | 99 | 从 templates/ 或内嵌兜底加载模板 |
| `resolveBin(name)` | 1594 | 解析 node/openclaw 二进制路径（5 级回退） |
| `loadGatewayConfig()` | 1651 | 读取 ~/.openclaw/openclaw.json 中的 gateway 配置 |
| `openclawHome()` | 288 | 环境变量或 ~/.openclaw |

### B. 状态与锁

| 函数 | 位置 | 功能 |
|------|------|------|
| `loadState()` | 176 | 读取 state.json + 合并默认值 |
| `saveState(s)` | 188 | 写入 state.json |
| `acquireLock(label)` | 102 | wx 原子创建 lockfile (+ LOCK_TIMEOUT_MS 超时自动释放) |
| `releaseLock()` | 121 | 删除 lockfile |
| `loadConfig()` | 80 | 读取 config.json + deepMerge 默认值 |
| `deepMerge(def,over)` | 85 | 递归合并配置对象 |

### C. 消息处理

| 函数 | 位置 | 功能 |
|------|------|------|
| `importanceOf(role,text)` | 247 | imp 评分（基准+决策+待办+事实+问号+长度，封顶 1.0） |
| `sanitizeText(text)` | 2066 | 敏感信息脱敏（12 种正则模式） |
| `compressForStorage(text)` | 2080 | 4 级压缩：表格→标注、代码块→标签、JSON→摘要、截断 rawMaxChars |
| `normalizeForDedup(s)` | 318 | 去时间戳 + 空白归一化 |
| `alreadyRecorded(day,text)` | 302 | 语义去重：normalize 后 120 字符匹配 + 完整匹配 |
| `cmdRecord(role,text)` | 2199 | 完整记录流程：sanitize→compress→imp→raw(可选)→todo提取→signal检查→consolidate→转录补录→索引补全 |

### D. 转录同步

| 函数 | 位置 | 功能 |
|------|------|------|
| `syncTranscripts()` | 326 | 扫描 ~/.openclaw/agents/*/sessions/*.jsonl，增量 offset，去重 |
| `readMaybeGz(path)` | 222 | 透明读取 .gz（zlib.gunzipSync）或普通文件 |
| `allMemoryFiles()` | 260 | 递归遍历 memory/ + MEMORY.md + MEMORY-PROTOCOL.md |

### E. 搜索

| 函数 | 位置 | 功能 |
|------|------|------|
| `keywordSearch(query)` | 2521 | 全文关键词搜索，gz 索引先行 |
| `semanticSearch(query,topN)` | 2577 | 128 条本地向量余弦相似度 |
| `multiPathSearch(query,opts)` | 1448 | 7 路并行 → mergeSort |
| `mergeSearchResults(all,weights)` | 1270 | 加权合并去重 |
| `highlight(text,terms)` | 2510 | ⟪关键词⟫ 高亮 |
| `localEmbed(text)` | 1720 | bigram+trigram 本地向量化 |
| `remoteEmbed(texts)` | 1741 | HTTP POST 远端 embedding API |
| `cosine(a,b)` | 1734 | 余弦相似度 |
| `cmdSearch(query,opts)` | 2608 | 搜索命令（mode 选择+降级+embed 自动触发） |
| `cmdEmbedSilent()` | 2627 | 静默 embed（搜索时自动触发） |

### F. 摘要与整合

| 函数 | 位置 | 功能 |
|------|------|------|
| `buildWorkingMemory()` | 570 | 从 raw 提取：当前任务+决策+待确认+事实 |
| `buildInjectableSummary(day)` | 635 | 从 raw 提取：话题词频+事实+决策+待确认+一句话摘要 |
| `checkMediumNeeded()` | 746 | 轮次+imp 密度判断 |
| `readNewMessages(sinceTs)` | 845 | 读取未整合消息 |
| `buildAutoSummaryBlock(msgs)` | 863 | 生成 Markdown 摘要块（话题+决策+事实+待办+关键词） |
| `localHM(ts)` | 839 | 本地时间格式化 |
| `autoConsolidate(opts)` | 912 | 自动整合决策（节流+阈值判断+写入+索引） |
| `suggestLongTermFacts()` | 963 | 从 inject 提取事实候选（噪声过滤） |

### G. 蒸馏与提案

| 函数 | 位置 | 功能 |
|------|------|------|
| `saveDistillProposal(entry)` | 960 | 存入 proposals + 更新 lastDistillAt |
| `loadDistillProposals()` | 950 | 读取 distill-proposals.json |
| `cmdDistillProposals(opts)` | 990 | --list / --apply（acquireLock+去重+快照） |
| `cmdDistillReject(opts)` | 1030 | --id <id> [--reason] |

### H. TODO

| 函数 | 位置 | 功能 |
|------|------|------|
| `extractTodos()` | 493 | 从 raw+medium 匹配 TODO_PATTERNS，去重 |
| `loadTodos()` | 480 | 读取 todos.json |
| `saveTodos(todos)` | 486 | 写入 + 渲染 todos.md |
| `cmdTodos(opts)` | - | --add / --done / 列表 |

### I. 归档与清理

| 函数 | 位置 | 功能 |
|------|------|------|
| `archiveOld()` | 480 | 短期>30天→gzip+索引，中期>180天→gzip |
| `buildArchiveIndex(file,data)` | 450 | JSONL 提取 [(ts, imp, kw)] 索引 |
| `cmdCleanup(opts)` | 1931 | 7 项清理（dry/confirm） |
| `cmdCleanupSilent()` | 2043 | 静默清理（sync 自动调用） |
| `truncateRawFiles()` | 2132 | raw 文件超 rawMaxLines 截断 |
| `compensationScan()` | 2151 | 未提炼/缺失摘要/索引断裂/工作记忆过期检测 |

### J. 版本与快照

| 函数 | 位置 | 功能 |
|------|------|------|
| `snapshotMEMORY(force)` | 945 | 快照（节流 1h，保留 50 个） |
| `listVersions()` | 980 | 列出所有快照（降序） |
| `lastSnapshot()` | 985 | 最新快照 |
| `parseSections(content)` | 998 | 解析 MEMORY.md 小节标题 |
| `buildContentIndex()` | - | 结构化关键词/实体/时间索引 |
| `cmdVersion(opts)` | - | --force |
| `cmdVersionHistory()` | - | 最近 50 个 |
| `cmdVersionDiff(opts)` | - | --v1 --v2 |
| `cmdConflict()` | - | 矛盾扫描 |
| `cmdRestore(opts)` | 2470 | --list / --id / --from latest |

### K. 状态与命令

| 函数 | 位置 | 功能 |
|------|------|------|
| `cmdStatus()` | 2246 | 完整状态（30+ 字段） |
| `cmdSetEnabled(on)` | 2271 | enable/disable |
| `cmdSignal()` | 2278 | 发送摘要信号 |
| `cmdInit()` | 2285 | 初始化目录 |
| `cmdSync()` | 2290 | 10 步全量同步 |
| `cmdReindex()` | 2361 | 索引补全 |
| `cmdStats()` | 2634 | 统计仪表盘 |
| `cmdHealth()` | 2707 | 9 项健康检查 |
| `cmdSave(file,text)` | 2746 | 写文件 + MEMORY.md 自动快照 |
| `cmdExport()` | 2762 | tar.gz 打包 |
| `cmdTimeline()` | 2772 | 按日时间轴 |
| `cmdSessions()` | 374 | 多会话聚合 |
| `cmdBackup(opts)` | 1876 | git 备份 |
| `cmdBackupLog()` | 1909 | 备份历史 |
| `cmdConfig(opts)` | 2094 | 配置读写 |
| `cmdPermission(opts)` | - | 权限管理 |
| `cmdEmbed(opts)` | 1776 | 构建语义向量索引 |
| `cmdReindexAll(opts)` | 2417 | 三合一全量重建 |
| `cmdImpCalibrate(opts)` | 1046 | imp 手动校准 |
| `cmdRecordRaw(opts)` | 1060 | 对话记录开关 |

### L. 日志

| 函数 | 位置 | 功能 |
|------|------|------|
| `appendDevLog(entry)` | 2369 | 追加 index.md 开发日志（最新在前，去重） |
| `cmdDevLog(opts)` | 2391 | 查看/追加 |
| `autoDevLog(synced,inject,working)` | 2405 | sync 自动记录 + daily note 追加 |

### M. 工具（嵌入式/远端）

| 函数 | 位置 | 功能 |
|------|------|------|
| `loadVectors()` | 1764 | 读取 embeddings.json |
| `saveVectors(v)` | 1769 | 写入 embeddings.json |
| `loadGatewayConfig()` | 1651 | 读取 Gateway 配置 |
| `sendSignal(turns,type,cb)` | 1632 | 发送摘要信号（CLI→HTTP fallback） |
| `sendSignalViaHTTP(gw,msg,cb)` | 1655 | HTTP POST /hooks/wake |

---

## 三、Web API 端点（30+）

### 页面
| 方法 | 路径 | 返回 | 说明 |
|------|------|------|------|
| GET | `/` | text/html | 504 行单页应用 |
| GET | `/api/logo` | image/png | logo.png（多格式自动检测: png→jpg→jpeg→webp→gif→svg） |

### 引擎操作
| 方法 | 路径 | 返回 | 说明 |
|------|------|------|------|
| GET | `/api/status` | JSON (30+ 字段) | 引擎完整状态 |
| GET | `/api/enable` | `{enabled:true}` | 开启自动记录 |
| GET | `/api/disable` | `{enabled:false}` | 暂停自动记录 |
| GET | `/api/record-raw-on` | `{recordRaw:true}` | 开启对话记录 |
| GET | `/api/record-raw-off` | `{recordRaw:false}` | 关闭对话记录 |
| GET | `/api/signal` | JSON | 手动触发摘要信号 |

### 文件浏览
| 方法 | 路径 | 返回 | 说明 |
|------|------|------|------|
| GET | `/api/files` | JSON (按层分类的文件列表) | layerOf() 分类，默认隐藏 __系统/__版本 |
| GET | `/api/file?p=<path>` | JSON `{text,size,mtime}` | 512KB 截断，sanitizeHTML |
| GET | `/api/download?p=<path>` | binary (Content-Disposition) | 原文下载 |

### 搜索
| 方法 | 路径 | 返回 | 说明 |
|------|------|------|------|
| GET | `/api/search?q=<query>&mode=<mode>` | JSON (多模式搜索结果) | 5 模式 × 7 层权重 |
| GET | `/api/embed?force` | JSON | 重建语义索引 |

### 待办
| 方法 | 路径 | 返回 | 说明 |
|------|------|------|------|
| GET | `/api/todos` | JSON (全部待办) | 列表 |
| GET | `/api/todos/add?text=` | JSON | 添加 |
| GET | `/api/todos/done?id=` | JSON | 完成 |

### 清理与回收站
| 方法 | 路径 | 返回 | 说明 |
|------|------|------|------|
| GET | `/api/cleanup-suggestions` | `{suggestions,total,freedEstimate}` | 6 种清理建议 |
| GET | `/api/delete?p=<path>` | `{trashed,file,trashId}` | 移入回收站（banned 文件拒绝） |
| GET | `/api/trash` | `{items,total}` | 回收站列表（含 .meta 恢复信息） |
| GET | `/api/trash/restore?id=` | `{restored}` | 还原文件 |
| GET | `/api/trash/purge?id=` | `{purged}` | 彻底删除 |

### 版本
| 方法 | 路径 | 返回 | 说明 |
|------|------|------|------|
| GET | `/api/version` | JSON | 创建快照 |
| GET | `/api/version-history` | JSON | 历史列表 |
| GET | `/api/version-diff?v1=&v2=` | JSON | 对比 |

### 备份
| 方法 | 路径 | 返回 | 说明 |
|------|------|------|------|
| GET | `/api/backup?msg=` | JSON | Git 备份 |
| GET | `/api/backup-log` | JSON | 备份历史 |

---

## 四、Hook 系统

### 架构
```
Gateway message event
  ↓
handler.js (83行, fire-and-forget)
  ├─ event.type === "message"
  ├─ event.action === "received" → execFile(node, [engine, "record", "--role", "user", "--text", content])
  ├─ event.action === "sent"     → execFile(node, [engine, "record", "--role", "assistant", "--text", content])
  └─ webchat 不触发 message:sent  → syncTranscripts() 补录
```

### 路径解析（3 级回退）
```
1. install.sh 写入的绝对路径（__ENGINE_PATH__ → 实际路径）
2. OPENCLAW_WORKSPACE + tools/memory-engine/engine.js
3. ~/.openclaw/workspace/tools/memory-engine/engine.js

Node 二进制：
1. install.sh 写入的 __NODE_BIN__
2. process.execPath（当前运行 Gateway 的 Node）
3. "node"（依赖 PATH）
```

### 调试
```
文件: memory/engine/hook-debug.log
格式: [ISO时间] action=received|sent keys=[ch1,ch2] channel=xxx content_len=N text_len=N
轮转: ensureDirs() 检查 >50KB → 截断保留尾部 20KB
定时清理: cleanup 删除 >logDays 的日志
```

### 降级保障
```
openclaw CLI 不可用 → 跳过 hook 启用步骤
git 不可用 → 跳过备份，其他正常
sendSignal CLI 失败 → HTTP fallback (POST /hooks/wake)
engine 不可用 → hook 静默失败，不阻塞消息
```

---

## 五、自动化管线（完整版）

### A. 实时管线（每条消息 record 时）

```
cmdRecord(role, text)
├─ 1. sanitizeText → 脱敏
├─ 2. compressForStorage → 压缩
├─ 3. importanceOf → imp 评分
├─ 4. raw 写入 raw/YYYY-MM-DD.jsonl（recordRaw !== false 时）
├─ 5. imp ≥ 0.5 → highImpMsgs++ → 每 WORKING_UPDATE_THRESHOLD 条触发 buildWorkingMemory
├─ 6. role=user + 匹配 TODO_PATTERNS → extractTodos
├─ 7. totalMessages++, turns++（仅 user）
├─ 8. turns % 5 === 0 → sendSignal("short")
├─ 9. turns % 20 === 0 → sendSignal("medium")
├─ 10. autoConsolidate() → 满足条件则写 medium/ + 索引
├─ 11. syncTranscripts() → 增量补录
├─ 12. reindex() → 索引补全
└─ 13. 返回 {recorded, turns, totalMessages, imp, consolidated}
```

### B. 会话启动管线（SOUL.md + AGENTS.md 强制执行）

```
1. read MEMORY.md → 加载长期知识
2. read memory/index/index.md → 查索引
3. read memory/todos.md → 查待办
4. engine.js sync → 10 步同步:
   4a. truncateRawFiles → raw 文件超限截断
   4b. compensationScan → 检测缺失/断裂
   4c. syncTranscripts → 转录补录（incremental offset）
   4d. reindex → 索引补全
   4e. archiveOld → 归档+索引生成
   4f. buildWorkingMemory → 工作台刷新
   4g. buildInjectableSummary → 今日摘要生成
   4h. autoConsolidate → 自动整合检查
   4i. distillCatchUp → >20h 无蒸馏→自动补 proposals
   4j. extractTodos → 待办提取
   4k. cleanup(静默) → 每天一次自动清理
   4l. snapshotMEMORY + buildContentIndex → 快照+索引
   4m. autoDevLog → daily note 追加
5. distill-proposals --list → 查看 pending 提案
6. 逐条 distill-proposals --apply <id> 或 --reject
7. 历史话题 → search --query → 按需打开 medium/ 摘要块
```

### C. 定时管线

| 时间 | 任务名 | 类型 | 操作 |
|------|--------|------|------|
| 每 24h | mnemosyne-nightly-distill | isolated agentTurn (LLM) | engine sync → 读 inject/medium → save-distill proposals |
| 每天 03:00 | 记忆系统每日 Git 备份 | isolated agentTurn | git add memory/ MEMORY.md && git commit |
| 每天 03:30 | Memory Dreaming Promotion | isolated agentTurn | 高频高 imp 召回 → 提升到长期层 |
| 周日 10:00 | memory-weekly-maintenance | isolated agentTurn | 索引清理 + 归档融合 + MEMORY.md 降级 |

### D. 离线/睡眠保护

```
情况: 电脑关机 3 天
  ↓
重新开机 → Gateway 启动 → 新会话
  ↓
SOUL.md 强制 → engine sync
  ↓
sync 检测:
  ├─ lastDistillAt > 20h → distillCatchUp 触发
  │   └─ suggestLongTermFacts() → 从 inject 提取事实
  │   └─ 噪声过滤（exec错误/UUID/调试日志）
  │   └─ 去重检查（24h 内已有 catch-up 则跳过）
  │   └─ saveDistillProposal() × N
  ├─ lastConsolidateTs → readNewMessages 补上所有未整合消息
  │   └─ autoConsolidate 自动写 medium/ + 索引
  └─ transcript-offsets → 补录所有未同步转录
  ↓
agent 审阅 distill-proposals --list → apply/reject
  ↓
全部补齐，零数据丢失
```

---

## 六、存储格式与生命周期

### 6.1 对话记录 (raw)
```
格式: JSONL (每行一个 JSON 对象)
示例: {"ts":"2026-08-06T12:00:00.000Z","role":"user","text":"压缩后文本","imp":0.55}
assistant: {"ts":"...","role":"assistant","text":"...","imp":0.3,"source":"transcript","sess":"46ec..-d93"}

生命周期:
  0-30天: 存储为 YYYY-MM-DD.jsonl
  >30天: 按月份合并 gzip → archive/YYYY-MM.jsonl.gz + YYYY-MM.idx.json
  搜索: .gz 先查 .idx.json 关键词匹配 → 命中才 gunzip
  截断: 单文件 >rawMaxLines 行时 truncateRawFiles 删除最早行
  可选: recordRaw=false 时不写入 raw
```

### 6.2 今日摘要 (inject)
```
格式: JSON
字段: {summary, topics:[], facts:[], decisions:[], open_questions:[], source_refs, message_count, high_imp_count, confidence, updated_at}

生命周期:
  0-7天: 存储，搜索参与加权排序
  >7天: cleanup 删除
```

### 6.3 工作台 (working)
```
格式: JSON
字段: {current_task, task_state, recent_decisions:[], open_questions:[], recent_facts:[], source_msg_count, updated_at}

生命周期:
  实时刷新: 每 WORKING_UPDATE_THRESHOLD 条高 imp 消息触发 buildWorkingMemory
  过期检测: compensationScan 检测 >2h 未更新则刷新
```

### 6.4 中期摘要块 (medium)
```
格式: Markdown
结构: ## HH:MM 标题\n- 结论/决策：...\n- 关键事实：...\n- 待办：...\n- 关键词：...

生命周期:
  0-180天: 存储，搜索加权 0.22
  >180天: gzip 归档到 archive/
  写入: autoConsolidate() 自动追加到 YYYY-MM-DD.md
```

### 6.5 长期知识 (MEMORY.md)
```
格式: Markdown
小节: ## 用户偏好 / ## 关键事实 / ## 当前项目 / ## 重要事件 / ## 变更记录
条目: - 内容描述

生命周期:
  写入: agent distill-proposals --apply 确认后写入
  备份: 每次修改自动 version 快照 (50个)
  冲突: conflict 命令扫描矛盾条目
  恢复: restore --id <vid> 可回退
```

### 6.6 索引 (index.md)
```
格式: Markdown 表格
条目: | 日期 | 关键词 | 摘要块 | 一句话 |
例:   | 2026-08-06 | 记忆引擎,可移植性 | medium/2026-08-06.md | 自动摘要 18:40-19:27（44条） |

维护: reindex() 自动扫描 medium/*.md 补齐
       consolidate 时自动追加新行
开发日志: ## 开发日志 节（devlog 命令维护）
```

### 6.7 蒸馏提案 (distill-proposals.json)
```
格式: JSON
条目: {id, section, content, source, confidence, status, created_at, rejected_at?, reason?}
状态: pending → agent apply/reject → applied/rejected/skipped

生命周期:
  nightly distill cron → save-distill → pending
  agent startup → distill-proposals --apply <id> → applied (写入 MEMORY.md)
  或 → distill-reject --id <id> → rejected
  cleanup: rejected >3 天 → 建议清理
```

### 6.8 归档索引 (.idx.json)
```
格式: JSON 数组
条目: {ts, imp, kw:"逗号分隔关键词"}

生成: archiveOld() 时 buildArchiveIndex() 从 JSONL 提取
用途: keywordSearch 对 .gz 先查 .idx.json 命中才 gunzip
      每个 .jsonl.gz 对应一个 .idx.json
```

---

## 七、安全机制全表

| 层级 | 机制 | 实现 |
|------|------|------|
| 数据 | 敏感信息脱敏 (12 种) | `sanitizeText()`: key/secret/token/password/api_key/jwt/private_key/card/ssh/id_rsa/bearer/authorization → `[已脱敏:KEYWORD]` |
| 数据 | 写入前压缩 | `compressForStorage()`: 表格→标注, 代码块→标签, JSON→摘要, 截断 800 字符 |
| 数据 | 核心文件禁止删除 | UI banned: MEMORY.md, MEMORY-PROTOCOL.md, state.json, index.md |
| 数据 | 回收站 (15 天) | 删除→.trash/ 目录 + .meta 文件记录 deletedAt。支持还原/彻底删除 |
| 进程 | 原子文件锁 | `acquireLock()`: fs.writeFileSync(wx flag)，超时 2min 自动释放 |
| 进程 | cron 时间错开 | Git 03:00 / Dreaming 03:30 / Distill 22:30，避免同时写 |
| 记忆 | 人工确认写入 | distill-proposals --apply（拒绝盲写 MEMORY.md） |
| 记忆 | 写入前去重 | apply 前检查 section 已有内容前 40 字符 |
| 记忆 | 版本快照 (50 个) | 每次 MEMORY.md 写入自动 snapshotMEMORY |
| 记忆 | 冲突检测 | conflict 命令扫描矛盾条目 |
| UI | 本地隔离 | `HOST='127.0.0.1'` |
| UI | XSS 防护 (6 种) | sanitizeHTML: script/iframe/style/link/javascript:/onerror/file:/data:text/html |
| UI | 路径白名单 | safePath(): 只允许 ALLOWED 列表内的路径 |
| UI | 系统文件默认隐藏 | layerOf() __ 前缀（__系统/__版本/__回收站） |
| 权限 | agent/session 控制 | permission 命令: read/write/admin |
| 网络 | 零外部依赖 | 所有数据本地，语义向量本地计算，远端 embed 可选 |
| 网络 | 零遥测 | 无任何数据外发（除非手动配置远端 embed API） |

---

## 八、配置项完整参考

### config.json 结构
```json
{
  "retention": {
    "injectDays": 7,        // 今日摘要保留天数
    "rawDays": 30,           // 对话记录保留天数
    "mediumDays": 180,       // 中期摘要保留天数
    "logDays": 3,            // 调试日志保留天数
    "suggestionDays": 14,    // 建议保留天数
    "trashDays": 15          // 回收站保留天数
  },
  "thresholds": {
    "shortSignalTurns": 5,   // 短期信号触发轮次
    "mediumSignalTurns": 20, // 中期信号触发轮次
    "workingUpdateMsgs": 3,  // 工作记忆刷新高 imp 数
    "mediumCheckIntervalMs": 3600000,   // 中期检查间隔 (1h)
    "rawMaxLines": 100,      // raw 文件最大行数
    "rawMaxChars": 800,      // 单消息最大字符数
    "mediumMinDensity": 50,  // 中期摘要最小密度
    "consolidateIntervalMs": 1800000,   // 整合检查间隔 (30min)
    "consolidateMinMsgs": 8, // 最小消息数触发
    "consolidateMinHighImp": 2,         // 最小高 imp 触发
    "consolidateMinImpSum": 3.0,        // 最小 imp 总和触发
    "dailyDistillHour": 22   // 蒸馏参考时间
  },
  "embed": {
    "defaultEnabled": true,  // 语义搜索默认开启
    "maxRecentDays": 30,     // 语义索引覆盖天数
    "dims": 512              // 向量维度
  },
  "recordRaw": true,         // 是否保存对话记录
  "weights": {               // 5 种模式的 7 层权重
    "keyword": {"working":0.08,"inject":0.10,"raw":0.12,"medium":0.22,"long":0.25,"idx":0.18,"semantic":0.05},
    "semantic":{"working":0.08,"inject":0.10,"raw":0.10,"medium":0.25,"long":0.22,"idx":0.05,"semantic":0.20},
    "hybrid":  {"working":0.10,"inject":0.12,"raw":0.15,"medium":0.22,"long":0.18,"idx":0.08,"semantic":0.15},
    "recent":  {"working":0.25,"inject":0.20,"raw":0.25,"medium":0.15,"long":0.10,"idx":0.03,"semantic":0.02},
    "history": {"working":0.02,"inject":0.03,"raw":0.05,"medium":0.20,"long":0.45,"idx":0.20,"semantic":0.05}
  }
}
```

---

## 九、文件路径完整清单

```
WORKSPACE/                          (OPENCLAW_WORKSPACE 或 ~/.openclaw/workspace)
├── MEMORY.md                       ← 长期记忆
├── MEMORY-PROTOCOL.md              ← 协议文档
├── SOUL.md                         ← agent 人格 + 记忆协议
├── AGENTS.md                       ← agent 启动引导
├── memory/
│   ├── YYYY-MM-DD.md               ← 每日笔记（今日摘要时间轴）
│   ├── todos.md                    ← 待办 Markdown 视图
│   ├── index/
│   │   └── index.md                ← 关键词索引 + 开发日志
│   ├── short/
│   │   ├── raw/
│   │   │   └── YYYY-MM-DD.jsonl    ← 对话记录（压缩，可选）
│   │   ├── inject/
│   │   │   └── YYYY-MM-DD.json     ← 结构化摘要
│   │   ├── working/
│   │   │   └── current.json        ← 工作台
│   │   └── archive/
│   │       ├── YYYY-MM.jsonl.gz    ← 归档对话 (30天后)
│   │       └── YYYY-MM.idx.json    ← 归档轻量索引
│   ├── medium/
│   │   ├── YYYY-MM-DD.md           ← 中期摘要块
│   │   └── archive/
│   │       └── YYYY-MM-DD.md.gz    ← 归档摘要 (180天后)
│   ├── long/
│   │   └── MEMORY.md               ← → ../../MEMORY.md (符号链接)
│   ├── engine/
│   │   ├── state.json              ← 引擎状态
│   │   ├── config.json             ← 可配置项
│   │   ├── lockfile                ← 进程锁
│   │   ├── embeddings.json         ← 语义向量索引
│   │   ├── distill-proposals.json  ← 蒸馏候选提案
│   │   ├── suggestions.json        ← 长期事实建议
│   │   ├── todos.json              ← 待办数据
│   │   ├── transcript-offsets.json ← 转录同步偏移
│   │   ├── permissions.json        ← 权限配置
│   │   ├── imp-calibration.json    ← imp 校准记录
│   │   └── hook-debug.log          ← hook 调试日志 (自动轮转)
│   └── versions/
│       └── YYYY-MM-DDTHH-MM-SS.json ← MEMORY.md 快照 (50个)
└── tools/memory-engine/
    ├── engine.js                    ← 主引擎 (2981行)
    ├── ui.js                        ← Web 服务器 (457行)
    ├── ui-page.html                 ← Web 控制台 (504行)
    ├── install.sh                   ← 安装脚本 (291行)
    ├── logo.png                     ← 品牌图标 (64x64)
    ├── README.md                    ← 用户文档
    ├── templates/
    │   ├── AGENTS-SECTION.md        ← AGENTS.md 注入章节
    │   ├── SOUL-SECTION.md          ← SOUL.md 注入章节
    │   ├── MEMORY.md                ← MEMORY.md 模板
    │   ├── MEMORY-PROTOCOL.md       ← 协议模板
    │   └── index.md                 ← 索引模板
    ├── hook/
    │   ├── HOOK.md                  ← hook 元数据
    │   └── handler.js.template      ← hook 处理器 (安装时路径替换)
    └── lib/                         ← 模块目录 (预留拆分)
```

---

## 十、当前数据统计

```
总消息: 134          轮次: 123
对话记录: 2 天 (148KB raw)
今日摘要: 2 份 (4.6KB inject)
工作台: current_task="先修一下" in_progress
中期摘要块: 2 个 (2026-08-05, 2026-08-06)
语义向量: 128 条 (local mode, 215KB)
待办: 7 条 (6 open, 1 done)
版本快照: 22 个
蒸馏提案: 6 条 total, 0 pending
引擎状态: 535B
配置文件: 1.5KB
每日笔记: 2026-08-06.md (2.8KB, 24 条时间轴记录)
```

---

## 附录：imp 评分完整文档

### 计算公式
```
imp = (
  role_base                          // user=0.35, assistant=0.30
  + (IMP_DECISION.test ? 0.30 : 0)   // 决定/确认/结论/选定/采纳/最终方案/agreed/decided/...
  + (IMP_TODO.test ? 0.25 : 0)       // 待办/todo/下一步/提醒我/记得/别忘了/截止/deadline/...
  + (IMP_FACT.test ? 0.10 : 0)       // \d+(元|块|天|小时|月|年|%)
  + (?结尾 ? 0.05 : 0)               // 提问加分
  + (len>500 ? 0.05 : 0)             // 长消息信息量大
)
cap: min(1.0, score)

特殊降级:
  IMP_CHITCHAT.test → 0.10           // 哈哈/嗯/好的/ok/谢谢/收到/明白
```

### imp 驱动矩阵
```
0.0-0.2: 闲聊 → 仅存储，不触发任何操作
0.3-0.4: 普通对话 → 参与搜索排序
0.5-0.6: 重要消息 → 触发 working 刷新 + 纳入 inject 事实
0.7-0.8: 关键消息 → 触发 todo 提取 + consolidate 高 imp 计数
0.9-1.0: 核心消息 → 全部触发 + Dreaming Promotion 候选
```

---

*Mnemosyne v2 · 2026-08-06 · 4316 行 · 109 函数 · 42 命令 · 零依赖 · 全部验证*
