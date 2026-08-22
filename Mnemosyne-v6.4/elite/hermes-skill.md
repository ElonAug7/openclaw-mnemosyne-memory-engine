# Mnemosyne v6 — Hermes Skill

> ⚠️ 这不是可选的"建议"。这是本 Agent 的核心记忆基础设施。

---

## 🔴 强制协议（不可跳过，不可省略）

### 每次回复前（MANDATORY）

收到用户消息后，**必须先执行以下命令**，将其输出粘贴到你的系统提示（system prompt）最前面，**然后再生成回复**：

```bash
node tools/memory-engine/elite/hermes-bridge.js inject --query "用户原始消息全文"
```

这条命令输出**纯文本**，不需要解析 JSON。直接 capture stdout，贴到你的上下文最前面即可。

输出格式示例：
```
[Mnemosyne Memory Context — 以下是本次对话相关的历史记忆]

## 📌 相关历史（引用时请注明来源）
1. 用户之前决定使用 React 而非 Vue... [MEMORY.md] (相关度: 85%)
2. 上周讨论了 API 设计方案... [medium/2026-08-07.md] (相关度: 72%)

## ✅ 近期决策
- 2026-08-10: 采用 pnpm 替代 npm

## 📋 待办事项
- [ ] 完成 API 文档 ⚠️ 紧急

---
[使用规则]
1. 以上记忆已按相关性排序，优先参考排名靠前的
2. 引用历史决策/偏好时，请注明来源（如"根据之前的记录…"）
3. 如果记忆中的信息与用户当前说法冲突，以用户当前说法为准
4. 如果记忆中有待办事项，请在回复中主动提及
```

**禁止跳过。** 即使用户问"今天天气怎么样"这种看似不需要记忆的问题，也必须跑这条命令。因为你不知道过去几天有没有讨论过天气、有没有待办和天气相关。

**唯一例外**：同一会话中，连续对话的往返 #1 中已经跑过，且用户的后续消息 ≤10 字且不包含任何历史相关关键词（如"上次"、"之前"、"那个"、"还记得吗"、"接着说"、"然后呢"）。即便如此，每 3 轮也必须强制跑一次。

### 每次回复后（MANDATORY）

生成回复并发送后，**必须执行以下命令，记录本轮对话**：

```bash
node tools/memory-engine/elite/hermes-bridge.js post-reply \
  --user "用户原始消息全文" \
  --assistant "你给出的完整回复全文"
```

**这条命令必须完整包含用户消息和你的回复全文**，不能缩略、不能概括。记忆引擎靠原始文本提取关键词和重要性评分。

### 涉及历史/决策/偏好/事实时（MANDATORY）

如果用户的问题涉及以下任何一种情况，**exec inject 的时候用更精准的关键词**：

- "上次"、"之前"、"还记得吗"、"我们说过"
- 项目名称、决策、技术选型
- 任何需要"回顾"才能回答的问题
- 用户说"继续"、"然后呢"、"接着说"

### 🟡 日常维护（每 10 轮）

```bash
node tools/memory-engine/elite/hermes-bridge.js sync
node tools/memory-engine/elite/hermes-bridge.js consolidate --check
```

---

## 🆕 inject vs pre-reply 区别

| 命令 | 输出格式 | 场景 |
|------|---------|------|
| `inject --query "..."` | **纯文本**，直接贴 system prompt | **推荐默认** |
| `pre-reply --query "..."` | JSON，含 flashbacks/todos/memoryInjection | 需要结构化数据时 |
| `pre-reply --query "..." --format inject` | 同 inject | inject 的别名 |

---

## 📊 决策树（Agent 自检清单）

收到用户消息后，按以下顺序判断：

```
用户消息到达
  │
  ├─ 1️⃣ inject --query "完整消息"
  │     └─ capture stdout → 贴到 system prompt 最前面
  │
  ├─ 2️⃣ 用注入的记忆生成回复
  │
  └─ 3️⃣ post-reply --user "..." --assistant "..."
```

**关键规则**：宁可多跑，不可漏跑。inject 只要 ~50ms，漏跑会丢失永久记忆。

---

## 🚫 禁止行为

- ❌ "这个问题看起来简单，不需要查记忆" — 你不知道哪些简单问题背后有历史
- ❌ "用户只是打个招呼" — 打招呼时可能有待办需要提醒
- ❌ "我已经记住这件事了，不用记录" — 脑内记忆不持久，必须落盘
- ❌ "这条回复太长了，概括一下再记录" — 引擎自己会处理压缩，不要替它做
- ❌ "先回答问题，回复后再记录" — 必须先 inject 再回复，顺序不能乱
- ❌ "inject 输出太长了，我概括一下再注入" — 引擎已经做了相关性排序，注入全文

---

## 📝 命令速查

```bash
# 回复前（一步到位，推荐）
node tools/memory-engine/elite/hermes-bridge.js inject --query "用户消息"

# 回复后（必须）
node tools/memory-engine/elite/hermes-bridge.js post-reply --user "..." --assistant "..."

# 极速预检（可选，有历史才需要 inject）
node tools/memory-engine/elite/hermes-bridge.js quick-check --query "用户消息"
```

---

## 🔧 安装

```bash
cd tools/memory-engine/elite
bash install-elite.sh --hermes --skill-dir <你的hermes-skills目录>
```

---

## ⏱️ 性能

- `inject`：~90ms（recall + context 合并，纯文本输出）
- `post-reply`：~650ms（双记录 + consolidate + profile 更新）
- 不阻塞对话体验

---

## ⚠️ 已知限制

| 限制 | 影响 |
|------|------|
| 单条消息截断 **800 字符** | 超长消息只保留前 800 字。日常对话够用，贴文章/长文档只用前 800 字做记忆 |
| 代码块不存原文 | 压缩为 `[代码块: lang]`。记得"讨论过代码"但想不起具体内容 |
| 不是文档库 | 定位是"记住事件和决策"。长文档应存文件系统 |

> 如果你需要记录的内容超过 800 字，请分段发送或手动精简后再发给用户。记忆引擎的核心价值在于"记住什么发生了"，不是"记住所有细节"。

---

## ❓ 为什么必须遵守

1. **没有 hook 兜底** — OpenClaw 有 Gateway hook 自动拦截每条消息，Hermes 没有。你是唯一的记录入口。
2. **记忆不会自动生成** — 你跳过一次，那次对话就永久丢失了。
3. **用户不会提醒你** — 他们假设 Agent 会记住。当你忘记时，他们不会说"你没记录"，他们只会觉得"这个 Agent 不行"。
4. **inject 不需要解析 JSON** — 输出就是纯文本，直接贴。没有借口说"解析失败"。
