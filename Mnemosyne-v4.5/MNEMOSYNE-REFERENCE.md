# 🦞 Mnemosyne v4.5 — 完整技术参考手册

> 3,250 行 · 20 命令 · Zero-NN · 零依赖 · 零模型 · bash install.sh 一键安装

---

## 〇、一句话定义

Mnemosyne 是一个**纯本地、零神经网络依赖的认知记忆引擎**。它在不引入任何 LLM API、embedding 模型、向量数据库的前提下，用 TF-IDF 关键词匹配 + 9 维 regex 重要性评分 + 四层记忆架构，实现了消息自动记录、智能评分、自动摘要整合、话题续接、长期记忆提炼等完整的记忆管线。

---

## 一、我能做什么

### ✅ 核心能力

| 能力 | 实现方式 | 用户可见效果 |
|------|---------|------------|
| 消息自动记录 | Gateway Hook 拦截 → record | 每条 user/assistant 消息自动落盘 |
| 重要性自动评分 | 9 维 regex 打分 (0.02–1.00) | 关键决策自动推高、闲聊自动降级 |
| 四层分层记忆 | raw → working → medium → long | 从原始对话到长期知识的自动提炼 |
| 自动摘要整合 | consolidate（消息数/imp/时间 三条件触发） | 每 30 分钟将对话整理成结构化摘要 |
| 话题续接 | context（>12h 检测 + 语义重叠 + 对话模式识别） | "上次聊到 XXX，欢迎回来" |
| 记忆回响 | recall（高 imp 消息自动搜索相关历史） | 提到旧话题时自动关联 |
| 长期记忆提炼 | nightly distill（22:30 cron → proposals → agent 审阅） | MEMORY.md 自动维护 |
| 多模式搜索 | keyword / semantic / hybrid / recent / history | 精确查、模糊搜、偏近期、偏历史 |
| 语义去重 | dedupeResults（同文件+相似文本去重） | 搜索结果不重复 |
| Memory QA | qa 命令（context + profile + 搜索 + MEMORY.md 四路召回） | 自然语言提问，引擎综合回答 |
| 中文分词 | tokenizeChinese（2-gram + 停用词过滤） | 中文搜索命中率显著提升 |
| 承诺检测 | Fix 7（"下次一定""我保证"→ imp≥0.75） | 用户承诺自动推入中期/长期记忆 |
| 写入批量化 | record 攒 10 条或 30 秒统一 sync/reindex/consolidate | JSONL 实时落盘，重操作批量执行 |

### ✅ 辅助能力

| 能力 | 说明 |
|------|------|
| 待办管理 | 从对话中提取 todo，Web UI 管理 |
| 用户画像 | 自动维护技术栈/偏好/沟通风格 |
| 日报/周报 | report 命令生成统计摘要 |
| 回收站 | 删除保留 15 天，支持还原 |
| Web 控制台 | http://127.0.0.1:8765 文件浏览/搜索/管理 |
| 自动归档 | >30d raw gzip，>180d medium gzip |
| 敏感信息脱敏 | API key/密码/私钥自动过滤 |
| Git 友好 | 所有记忆纯 Markdown/JSON，可 diff/version |

---

## 二、我怎么做到的

### 2.1 总体架构

```
用户消息
  ↓
Gateway Hook (memory-recorder)
  ↓
record → sanitize → compress → [P2: tokenizeChinese] → [P1: batch counter]
  ↓                          ↓
imp 评分 (9维 regex)        JSONL 实时落盘
  ↓                          ↓
batch flush (10条/30s)      → syncTranscripts
  ↓                          → reindex
recall 自动触发              → autoConsolidate (30min节流)
  ↓
working 记忆刷新
  ↓
consolidate → 话题标签 + 质量自评 → medium 摘要块
  ↓
nightly distill (22:30) → proposals → agent 审阅 → MEMORY.md
```

### 2.2 四层记忆

| 层 | 路径 | 数据格式 | 保留期 | 用途 |
|---|------|---------|:---:|------|
| 短期·对话记录 | `memory/short/raw/YYYY-MM-DD.jsonl` | JSONL (ts, role, text, imp) | 30天→gzip | 原始消息流 |
| 短期·工作台 | `memory/short/working/current.json` | JSON (task, decisions, questions, facts) | 实时更新 | 当前上下文 |
| 短期·可注入摘要 | `memory/short/inject/YYYY-MM-DD.json` | JSON (summary, topics, facts, decisions) | 7天 | agent 启动时注入 |
| 中期·摘要块 | `memory/medium/YYYY-MM-DD.md` | Markdown (### 时间 + 话题标签 + 质量自评) | 180天→gzip | 按日归档 |
| 长期·全局知识 | `MEMORY.md` | Markdown (用户偏好/关键事实/项目/事件) | 永久 | agent 长上下文 |
| 索引 | `memory/index/index.md` | Markdown (每行一个话题+关键词) | 永久 | 搜索加速 |
| 用户画像 | `memory/profile.md` | Markdown (偏好/技术栈/风格) | 永久 | 个性化 |
| 成长日志 | `memory/growth.md` | Markdown (长期记忆增量记录) | 永久 | 记忆演化追踪 |

### 2.3 imp 评分：9 维正则表达式

**这是 Mnemosyne 最核心的差异化能力。** 不使用任何神经网络，纯正则表达式判断消息重要性。

```
base: user=0.40, assistant=0.30
──────────────────────────────────────
IMP_INSTRUCT  +0.25  帮/给/请/做/改/实现/修复/把/继续/然后
IMP_PREF      +0.35  喜欢/不喜欢/必须/不能/不许/原则/底线/风格
IMP_DECISION  +0.30  决定/确认/结论/选定/agreed
IMP_TODO      +0.25  待办/todo/下一步/deadline
IMP_TECH      +0.12  优化/架构/代码/bug/性能/安全
IMP_FACT      +0.10  数字+单位(元/天/小时/%)
──────────────────────────────────────
Fix 1: 系统消息/闲聊降级
  SYSTEM → 0.02  心跳/系统通知/续写指令
  CHITCHAT → 0.10  哈哈/嗯/ok/谢谢/收到
──────────────────────────────────────
Fix 2: 核心原则加权 +0.15
  约束词(必须|不能|不许|禁止|隐私第一)
  + 领域词(本地|云端|依赖|上传|隐私|开源)
──────────────────────────────────────
Fix 3: 长文本方向性 → 0.75
  文本 >100字 + (优先级|方向|架构|定位|原则|评估|竞品)
──────────────────────────────────────
Fix 4 (v4.5): 双关键词组合 +0.20
  部署|发布 + 模型|引擎|系统
  修改|重构 + 架构|核心|底层
  性能|延迟 + 必须|要求|指标
  砍|精简 + 功能|命令|模块
  对比|评估 + 方案|系统|工具
──────────────────────────────────────
Fix 5 (v4.5): 否定/纠正 +0.25
  (不是|不要|不对|错了|换个思路|重新来|推翻)
──────────────────────────────────────
Fix 6 (v4.5): 对比决策 +0.18
  (比|不如|超过|更好|更优|更强|更简洁|完胜|碾压)
  + (方案|系统|工具|方法|模型|引擎)
──────────────────────────────────────
Fix 7 (v4.5): 承诺/保证 +0.35
  (下次一定|我保证|我承诺|发誓|从今往后|记住了)
  强承诺(发誓|保证|永远不会忘) → 直接推到 0.90
──────────────────────────────────────
封顶: 1.00
```

**实测效果：**

| 输入 | 旧版本 imp | v4.5 imp | 触发规则 |
|------|:---:|:---:|------|
| "不要用之前的方案，那个性能不行，换个思路" | ~0.65 | **1.00** | PREF+negation+TECH |
| "必须保证搜索延迟不超过 50ms，这是硬指标" | ~0.70 | **0.95** | PREF+TECH+combo |
| "对比了三个方案，Mnemosyne 比 Mem0 更简洁更快" | ~0.70 | **0.90** | TECH+combo+compare |
| "我保证以后每次更新都同步到 memory-engine" | ~0.60 | **0.90** | Fix7 强承诺 |
| "今天天气不错" | 0.40 | 0.40 | base only（不受影响） |

### 2.4 搜索：5 模式并行

| 模式 | 算法 | 权重策略 | 延迟 | 适用场景 |
|------|------|---------|:---:|------|
| `keyword` | 全文关键词 + [P2: 中文 2-gram 切词] | 4 层加权 | ~42ms | 精确查找 |
| `semantic` | 本地 bigram+trigram 向量 (512 维) | 向量余弦相似度 | ~120ms | 模糊匹配 |
| `hybrid` | keyword + semantic 融合 | [P1: dedupeResults 去重] | ~130ms | **推荐默认** |
| `recent` | 同上 | 偏短期 (working 25%, raw 25%) | ~120ms | 近期焦点 |
| `history` | 同上 | 偏长期 (long 45%, idx 20%) | ~120ms | 历史追溯 |

**7 路权重分配（hybrid 模式）：**

| 召回通道 | 权重 | 说明 |
|---------|:---:|------|
| 工作台 working | 0.10 | 当前任务、最近决策 |
| 可注入摘要 inject | 0.12 | 今日话题、事实 |
| 对话记录 raw | 0.15 | 原始消息流（含 imp 加权） |
| 中期摘要 medium | 0.22 | 按日的结构化摘要 |
| 长期知识 long | 0.18 | MEMORY.md 持久知识 |
| 索引 idx | 0.08 | 关键词索引加速 |
| 语义向量 semantic | 0.15 | bigram/trigram 余弦相似度 |

### 2.5 Memory QA（v4.5 新增）

**四路召回综合回答：**

```
qa --query "问题"
  ├─ 1. context: 工作记忆 (current task + decisions + facts)
  ├─ 2. profile: 用户画像 (偏好/技术栈)
  ├─ 3. search: keyword 搜索 (P2 中文分词后)
  └─ 4. MEMORY.md: 全文关键词匹配 (长期知识)
  → 综合排序 → 返回 top-10 来源 + 置信度
```

### 2.6 自动化管线

| 管线 | 触发条件 | 输出 |
|------|---------|------|
| record | 每条消息 (hook) | JSONL + imp + [P1: batch counter] |
| recall auto | imp≥0.4 & len>20 | last-recall.json (hybrid top3) |
| working refresh | imp≥0.5 × 3 累积 | current.json |
| batch flush | [P1] 10 条或 30 秒 | syncTranscripts + reindex + consolidate |
| consolidate | 3 条件 | medium 摘要块（话题标签+质量自评） |
| retag | consolidate --retag | 旧块补标签 |
| reindex | flush 后 | 索引补全 |
| archive | sync 检查 | >30d raw → gzip, >180d medium → gzip |
| nightly distill | 22:30 cron | proposals → agent 审阅 → MEMORY.md |
| profile update | sync/consolidate | profile.md |

### 2.7 安全机制

| 机制 | 说明 |
|------|------|
| POST+CSRF | 所有写操作强制 POST |
| 进程锁 | distill 写入 wx 原子锁（120s 超时） |
| safePath | 路径白名单防目录穿越 |
| 敏感信息脱敏 | API key / JWT / 密码 / 私钥 / 卡号正则过滤 |
| XSS 防护 | Web UI 过滤 script/iframe/onerror |
| 本地隔离 | 仅绑定 127.0.0.1 |

---

## 三、我不能做什么

### ❌ 明确不能

| 限制 | 原因 | 替代方案 |
|------|------|---------|
| 无法直接回答"为什么""哪个更好"等推理问题 | 无 LLM，仅关键词匹配+规则评分 | 使用 Memory QA 的四路召回作为信息基础，由外部 LLM 做最终回答 |
| 无法处理跨语言语义搜索 | 不支持 embedding 模型的跨语言能力 | keyword 模式支持多语言关键词匹配；中文 P2 分词仅 2-gram 级别 |
| 无法做多跳推理 | 无神经网络推理能力 | 依赖外部 LLM 对 recall 结果做推理 |
| 无法做个性化推荐 | 无用户行为模型训练 | profile.md 提供偏好事实供外部使用 |
| 无法处理图像/音频 | 纯文本系统 | 外部预处理为文本描述后注入 |
| 无法做流式增量大规模写入 (1000+ docs/s) | JSONL append + Node 子进程负担 | 写入批量化已将重操作合并，但吞吐仍有上限 |
| LoCoMo R@K 评估得 0% | 返回记忆内容而非文档 ID | 记忆系统不应与文档检索系统直接对比 |

### ⚠️ 部分能做到但有局限

| 能力 | 能做到什么程度 | 局限 |
|------|--------------|------|
| 中文搜索 | P2 2-gram 切词大幅提升命中率 | 不如专业分词器（jieba）精准 |
| 语义搜索 | 本地 bigram/trigram 向量 | 512 维粗粒度，不如 embedding 模型精确 |
| Memory QA | 四路召回综合提供信息来源 | 不生成自然语言答案，仅返回结构化来源 |
| 话题续接 | >12h 检测 + 语义重叠 | 依赖 consolidate 摘要质量 |
| 用户画像 | 自动从对话中提取偏好 | 需要 >150 轮才能达到 70% 成熟度 |

---

## 四、相较于主流模型的优势和劣势

### 🟢 优势

| 维度 | Mnemosyne v4.5 | AgentMemory | Mem0 | ChromaDB | SQLite FTS5 |
|------|:---:|:---:|:---:|:---:|:---:|
| **零依赖** | ✅ bash install.sh | ❌ chromadb+pip | ❌ OpenAI API | ❌ pip | ✅ python built-in |
| **零模型下载** | ✅ 0MB | ❌ 79MB | ❌ API | ❌ 79MB | ✅ 0MB |
| **离线可用** | ✅ 完全离线 | ✅ | ❌ 必须联网 | ✅ | ✅ |
| **imp 智能评分** | ✅ 9 维 regex | ❌ | ❌ | ❌ | ❌ |
| **分层记忆** | ✅ 4 层 | ❌ 单层 | ❌ 单层 | ❌ 单层 | ❌ 单层 |
| **自动整合** | ✅ consolidate | ❌ | ❌ | ❌ | ❌ |
| **话题续接** | ✅ context v2 | ❌ | ❌ | ❌ | ❌ |
| **承诺检测** | ✅ Fix 7 | ❌ | ❌ | ❌ | ❌ |
| **搜索去重** | ✅ dedupeResults | ❌ | ❌ | ❌ | ❌ |
| **对话模式识别** | ✅ 4 分类 | ❌ | ❌ | ❌ | ❌ |
| **Memory QA** | ✅ 四路召回 | ❌ | ✅ (with LLM) | ❌ | ❌ |
| **中文分词** | ✅ 2-gram | ❌ | ❌ | ❌ | ❌ |
| **Git 友好** | ✅ 纯 Markdown | ❌ 二进制 DB | ❌ 云端 | ❌ 二进制 DB | ❌ 二进制 |
| **数据隐私** | ✅ 100% 本地 | ⚠️ 本地 DB | ❌ 云端 API | ✅ 本地 | ✅ 本地 |
| **安装成本** | bash install.sh | pip install + 79MB | pip + API key | pip + 79MB | 内置 |
| **RAM 增量(100 docs)** | **0MB** | +114MB | N/A | +103MB | 0MB |
| **搜索延迟(keyword)** | **42ms** | — | — | — | <1ms |
| **搜索延迟(semantic)** | **130ms** | 160ms | ❌ | 158ms | — |

### 🔴 劣势

| 维度 | Mnemosyne v4.5 | 对手 | 差距 |
|------|:---:|------|:---:|
| **写入吞吐** | 2 docs/s | AgentMemory 4 d/s, SQLite 10K+ d/s | 8.5×–5000× 慢 |
| **纯关键词 R@K** | 0% (LoCoMo) | SQLite FTS5 17% | 证据索引结构差异 |
| **英文语义匹配** | bigram/trigram 粗粒度 | MiniLM-L6 79MB embedding | 精度差 |
| **中文语义匹配** | 2-gram 切词 | jieba/bge embedding | 分词精度差 |
| **跨语言搜索** | ❌ 不支持 | embedding 模型支持 | 架构性差距 |
| **多跳推理** | ❌ 无 LLM | Mem0 + LLM | 架构性差距 |
| **自然语言回答** | ❌ 仅返回来源 | Mem0 + LLM | Memory QA 不生成答案 |
| **大规模并发** | 单进程 | ChromaDB 多线程 | 架构性差距 |
| **Node.js 进程开销** | 每个 record ~500ms | 内存写入 ~10ms | 子进程开销 |
| **社区生态** | 1 个仓库 | Mem0 10K+ stars | 推广差距 |

### 📊 定位总结

| 场景 | Mnemosyne v4.5 | 什么时候不该用 |
|------|:---:|------|
| 个人 AI 助手记忆 | ✅ **最佳选择** | — |
| 离线/隐私敏感环境 | ✅ **最佳选择** | — |
| 低资源设备 (RPi) | ✅ **最佳选择** | — |
| 需要语义理解深度 | ⚠️ 可用但不最优 | 用 Mem0 + embedding |
| 需要跨语言搜索 | ❌ 不支持 | 用 ChromaDB + bge-m3 |
| 高并发企业场景 | ❌ 不适合 | 用 Zep / Postgres |
| 需要自然语言 QA | ⚠️ 外部 LLM 组合 | 用 Mem0 + OpenAI |

---

## 五、20 命令完整参考

### 核心管线 (5)

| 命令 | 用法 | 说明 |
|------|------|------|
| `record` | `--role user\|assistant --text "..."` | 消息落盘 + imp 评分 + batch counter |
| `sync` | `[--quick]` | 全量同步（转录+索引+归档+整合+画像） |
| `status` | — | 30+ 字段状态 |
| `enable/disable` | — | 开关引擎 |
| `init` | — | 幂等初始化目录结构 |

### 搜索 (1 命令 5 模式)

| 命令 | 用法 | 说明 |
|------|------|------|
| `search` | `--query "..." --mode keyword\|hybrid\|semantic\|recent\|history` | 多路并行召回 + dedupeResults |

### Memory QA (v4.5 新增)

| 命令 | 用法 | 说明 |
|------|------|------|
| `qa` | `--query "..."` | context+profile+search+MEMORY.md 四路综合 |

### 记忆回响 (5)

| 命令 | 说明 |
|------|------|
| `context` | 话题续接(>12h+语义重叠)+对话模式识别+待办 |
| `recall --query "..."` | hybrid top3 回响 (hook imp≥0.4 自动) |
| `report [--weekly]` | 每日/周报 |
| `profile [--update]` | 用户画像查看/更新 |
| `distill-proposals --list\|--apply <id>` | 长期记忆候选审阅 |

### 维护 (7)

| 命令 | 说明 |
|------|------|
| `consolidate [--force\|--check\|--retag]` | 自动整合 / 补标签 |
| `todos [--add\|--done <id>]` | 待办管理 |
| `embed [--force]` | 语义索引构建 |
| `reindex` | 索引补全 |
| `cleanup [--confirm]` | 清理过期文件 |
| `health` | 13 项健康检查 |
| `stats` | 消息/imp 统计 |

---

## 六、配置文件

`memory/engine/config.json`：

```json
{
  "retention": {
    "injectDays": 7,
    "rawDays": 30,
    "mediumDays": 180,
    "trashDays": 15
  },
  "thresholds": {
    "shortSignalTurns": 5,
    "mediumSignalTurns": 20,
    "workingUpdateMsgs": 3,
    "consolidateMinMsgs": 8,
    "consolidateMinHighImp": 2,
    "consolidateMinImpSum": 3.0,
    "consolidateIntervalMs": 1800000,
    "rawMaxChars": 800
  },
  "recordRaw": true,
  "embed": {
    "defaultEnabled": true,
    "maxRecentDays": 30,
    "dims": 512
  },
  "weights": { /* 见 2.4 节 */ }
}
```

---

## 七、Web API

`http://127.0.0.1:8765`

### GET

| 端点 | 说明 |
|------|------|
| `/api/status` | 引擎状态 |
| `/api/files` | 文件列表 |
| `/api/file?p=path` | 文件内容 |
| `/api/download?p=path` | 文件下载 |
| `/api/search?q=&mode=` | 搜索 |
| `/api/todos` | 待办 |
| `/api/cleanup-suggestions` | 清理建议 |
| `/api/stats` | 统计 |
| `/api/trash` | 回收站 |

### POST

| 端点 | 说明 |
|------|------|
| `/api/enable` `/api/disable` | 开关 |
| `/api/delete` | 删除→回收站 |
| `/api/trash/restore` | 还原 |
| `/api/trash/purge` | 彻底删除 |
| `/api/todos/add` | 加待办 |
| `/api/todos/done` | 完成待办 |
| `/api/save` | 保存文件 |

---

## 八、安装

```bash
# 方法一(推荐)
cp -r Mnemosyne-v4.5 ~/.openclaw/workspace/tools/
cd ~/.openclaw/workspace/tools/Mnemosyne-v4.5 && bash install.sh

# 方法二(一键)
bash /path/to/Mnemosyne-v4.5/install.sh

openclaw gateway restart
open http://127.0.0.1:8765
```

要求：Node.js v18+，OpenClaw CLI。

---

## 九、测试结果速查

### 搜索延迟 (x86_64 / Ubuntu 24.04 / Node v22)

| 模式 | avg | P50 | 命中/q |
|------|-----|-----|:---:|
| keyword | 42ms | 43ms | 16.7 |
| hybrid | 130ms | 131ms | 19.3 |

### vs AgentMemory 0.4.8 (ChromaDB + all-MiniLM-L6 79MB)

| 指标 | AgentMemory | Mnemosyne v4.5 | 优势 |
|------|:---:|:---:|:---:|
| 搜索 hybrid | 164ms | **130ms** | 1.26× |
| RAM 增量 | +114MB | **0MB** | ∞ |
| 模型下载 | 79MB | **0MB** | ∞ |
| 安装 | pip + 下载 | **bash install.sh** | ∞ |
| 写入 | 4 d/s | **2 d/s** | 0.5× |

### 功能完整性 (vs 6 系统)

在"记忆管线完整度 + 零依赖 + 搜索速度"三维综合评分中，v4.5 在所有已测系统中排名第一。纯速度维度 SQLite FTS5 第一（<1ms），纯语义理解维度 ChromaDB 更强（79MB MiniLM），但没有任何系统同时具备：分层记忆 + 智能评分 + 自动整合 + 话题续接 + 零依赖。

---

## 十、版本历史

| 版本 | 日期 | 行数 | 命令 | 核心差异 |
|------|------|------|:---:|------|
| v1 | 08-05 | 2,447 | 28 | 四层架构·语义索引·7路搜索·Web UI |
| v2 | 08-06 | 2,981 | 36 | 可配置·回收站·建议清理·自动整合·夜间蒸馏 |
| v3 | 08-06 | 3,093 | 36 | POST+CSRF·截断保护·待办过滤·hook检测 |
| v3-lite | 08-06 | 2,975 | 14 | 精简版 |
| v4 | 08-07 | 3,751 | 44 | 记忆回响·话题续接·心跳图·时光机 |
| v4-pro | 08-07 | 3,768 | 44 | 251条校准·5-fold CV·评估面板 |
| **v4.5** | **08-08** | **3,250** | **20** | **砍56%命令 + 9维imp + P0 QA + P1 批量写 + P2 中文分词 + Fix7 承诺检测** |

---

*🦞 Mnemosyne v4.5 · 2026-08-08 · 3,250 行 · 20 命令 · Zero-NN · 零依赖 · 零模型 · 零 API key*
