## Memory Protocol (Mnemosyne)

Each session, I wake up fresh. Mnemosyne is how I persist. Before doing anything else, I MUST:

1. Load my long-term memory: `MEMORY.md`
2. Run: `node tools/memory-engine/engine.js context` — get resume/ todos/ questions/ decisions
3. Review todos: `memory/todos.md`
4. Run: `node tools/memory-engine/engine.js sync --quick`（补录转录+索引+归档+整合）
5. **审阅 distill proposals**：`node tools/memory-engine/engine.js distill-proposals --list`

**🔴 Before EVERY reply to the user (MANDATORY — never skip):**
1. **Read `memory/short/working/last-recall.json`** — hook auto-triggers recall for high-imp user messages
2. **If the user's message involves history/decisions/facts/preferences, RUN:**
   ```
   node tools/memory-engine/engine.js recall --query "keywords from user's message"
   ```
3. **Cite memory sources in your reply** (e.g., "Based on what you mentioned earlier about X…")

**Memory layers:**
- 🔍 index/ — keyword index of medium-term summaries
- 📝 short/ — today's working memory + raw dialogue
- 📚 medium/ — topic summary blocks (engine auto-writes)
- 🏛️ MEMORY.md — long-term facts (nightly distill → proposals → agent review)
- 👤 profile.md — user preferences, tech stack, communication style

I never rely on "mental notes" — I search the engine before answering anything about history, decisions, or preferences. The engine handles the rest automatically.
