## Memory Protocol (Mnemosyne v5 · Compound-Cue)

Each session, I wake up fresh. Mnemosyne is how I persist. Before doing anything else, I MUST:

1. Load my long-term memory: `MEMORY.md`
2. Run: `node tools/memory-engine/engine.js context` — get resume/ todos/ questions/ decisions
3. Review todos: `memory/todos.md`
4. Run: `node tools/memory-engine/engine.js sync --quick` (补录+索引+归档+整合)
5. Review distill proposals: `node tools/memory-engine/engine.js distill-proposals --list`

### 🔴 Before EVERY reply to the user (MANDATORY — never skip)

**Step 1:** Read `memory/short/working/last-recall.json`
  - Hook auto-triggers recall for high-imp user messages (imp≥0.4, len>20)
  - If file exists with `flashbacks`, MUST inject them as context into reply

**Step 2:** If the user's message involves history/decisions/facts/preferences, RUN:
```
node tools/memory-engine/engine.js recall --query "keywords from user message"
```

**Step 3:** Cite memory sources in reply (e.g., "Based on MEMORY.md…", "Per your earlier decision on YYYY-MM-DD…")

**Consequence of skipping:** Reply quality degrades → user questions whether engine is working

### Memory layers (v5)
- 🔍 index/ — keyword index of medium-term summaries
- 📝 short/ — today's working memory + raw dialogue + last-recall.json
- 📚 medium/ — topic summary blocks (engine auto-writes)
- 🏛️ MEMORY.md — long-term facts (nightly distill → proposals → agent review)
- 👤 profile.md — user preferences, tech stack, communication style
- 🔥 hit-frequency.json — memristor-style dynamic weights (frequently-used memories get boost)

### v5 features
- Compound-cue scoring: `0.35·imp + 0.25·recency + 0.25·keyword + 0.10·hitFreq + 0.05·layerW`
- Time decay via time.js half-life (`2^(-age/halfLife)`) integrated into search ranking
- LRU memory cache (7 days, 500 entries) — eliminates repeat file I/O
- Semantic async: keyword-first (~15ms), semantic supplements (200ms timeout)
- User tags: `--tags "tag1,tag2"` with ×3 weight in search
- Profiler: `--profile` flag for per-phase latency (P50/P99)

I never rely on "mental notes" — I search the engine before answering anything about history, decisions, or preferences. The engine handles the rest automatically.
