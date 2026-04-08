# Learning Journal

Personal lessons from building Austin AI Events. Updated each session when a question, pushback, or discussion leads to a better outcome.

---

## 2026-03-29

### Commit hygiene: each commit should be independently valid
**Context:** I asked whether to make one commit or four for parallel changes.
**Lesson:** Each commit should be one logical change that could be reverted without breaking anything else. If you need to say "it does four things" — it should be four commits. Commit in dependency order so later commits can't break earlier ones.
**Why it mattered:** Two parallel agents both modified `index.js`. When committed naively, commit 1 imported a file that didn't exist until commit 3 — leaving a broken intermediate state. We reset and recommitted with correct groupings. This matters because the outer loop will revert individual commits autonomously — each one needs to stand alone.

### Don't penalize the agent for things outside its control
**Context:** The system was stuck at C grade for 10 days. I pushed back on the grading criteria.
**Lesson:** The grade was measuring event count and empty calendar days — metrics that reflect community activity, not agent performance. A quiet month with all scrapers healthy was grading C. The grade should measure what the agent controls: scraper health, error rate, source diversity, discovery activity.
**Why it mattered:** Bad metrics drive bad behavior. If the grade penalizes empty days, the system wastes API budget trying to "fix" a problem that doesn't exist (organizers haven't posted events yet). Separating the grade (infrastructure health) from the coverage mission (find more events) lets the agent focus on real problems while still pursuing growth.

### Discuss before building
**Context:** The full autonomy architecture needed careful design before implementation.
**Lesson:** For non-trivial systems, talk through the architecture, identify gaps, think 10 steps ahead, and align on the approach before writing code. We spent 45+ minutes designing the outer loop before writing a single line.
**Why it mattered:** The discussion surfaced 10 gaps (testing, rollback, oscillation, scope gates, etc.) that would have been much harder to retrofit after building. The design conversation shaped a system that's safe by construction rather than patched after failures.

### The right tool for each type of work
**Context:** I asked why we didn't build the agent with Claude Code or Agent SDK instead of vanilla Node.js.
**Lesson:** Pipelines (deterministic, same steps every time) should be code. Agents (open-ended reasoning, deciding what to do) should be LLMs. The inner loop is a pipeline — scrape, validate, store. The monitor is a reasoner — evaluate and decide. The outer loop is an agent — read a problem, figure out the fix, implement it.
**Why it mattered:** Using Claude Code for the inner loop would cost 10-100x more in tokens, be slower, and be non-deterministic. The multi-tool architecture (Node.js pipeline + Claude API for judgment calls + Claude Code for code repair) puts each tool where it's most effective.

### Read-only defaults exist for a reason, but don't let them block you
**Context:** The Supabase MCP was read-only, blocking our ability to run migrations.
**Lesson:** Read-only is a good default for production data. But when it creates friction that contradicts your workflow (you already have write access through another path), change it. Don't work around a security setting that isn't protecting anything.
**Why it mattered:** We spent time trying workarounds (`node -e`, SQL editor) when the real fix was changing the MCP permission from read-only to read-write. The agent already had the service role key — read-only MCP was security theater.

### One fix per autonomous run
**Context:** Designing the outer loop's behavior.
**Lesson:** When an autonomous system makes changes, do one thing at a time. One fix per run makes verification clean (one variable changed), keeps costs predictable, and prevents the system from going on a refactoring spree. If there are 5 issues, it takes 5 days — that's fine.
**Why it mattered:** If the outer loop fixed 5 things at once and one broke, you can't tell which one caused the failure. One-at-a-time makes every change traceable and independently revertible.

### Scheduled Claude Code tasks run on Max plan
**Context:** I asked if the outer loop could use my Max plan instead of API credits.
**Lesson:** Cloud scheduled tasks via claude.ai/code/scheduled are included in the Max subscription. CLI automation with ANTHROPIC_API_KEY is billed at API rates. The execution mode determines the billing, not the task.
**Why it mattered:** This made the entire outer loop free (beyond the existing Max subscription) — a major factor in the architecture decision.

---

## 2026-04-07/08

### Metrics that lie are worse than no metrics
**Context:** The monitor graded itself A while scrapers were silently broken. `scraperHealthRate` counted any source with events in the last 14 runs as "healthy" — so a source returning 403 today was still "healthy" from two-week-old data.
**Lesson:** A metric that can't go negative when things are broken is a cheerleader, not a health check. Every metric should be able to surface bad news. If `undefined` silently passes a check (because `undefined !== 'failed'` is true), you have a permission slip, not a guard.
**Why it mattered:** Sprocket caught this — the `scraperHealthRate` was passing sources with no diagnostic data through all the negative checks. The fix: explicitly check if diagnostics exist before trusting them. If they don't exist, fall back honestly to historical data instead of pretending the check passed.

### The system can already do what you think it can't
**Context:** We assumed the system needed new investigation capabilities. But when we traced what actually happened during the debugging session, the human's only contribution was "events are missing — investigate." Claude did all the investigation, diagnosis, and fixing.
**Lesson:** The gap wasn't capability — it was trigger. Claude could already fetch URLs, read HTML, trace code, diagnose root causes, and fix scrapers. The system just never told itself to do it. The monitor saw symptoms and guessed; the outer loop acted on guesses. Neither one ever looked at the actual evidence.
**Why it mattered:** This reframed the entire design. Instead of building new investigation tools, we made the existing tools observable (scraper diagnostics), made the trigger accurate (diagnostic-aware monitor), and told the outer loop to investigate first (prompt update). The self-healing loop was one trigger away, not a research project away.

### Close every loop before moving on
**Context:** We updated CLAUDE.md with the investigation-first workflow but almost forgot to update the actual outer loop trigger prompt — which is the thing that runs.
**Lesson:** Documentation that doesn't reach the executing system is aspirational, not operational. When you change how a system should behave, trace the instruction all the way to the code/prompt that actually runs. CLAUDE.md guides human sessions. The trigger prompt guides the outer loop. They need to stay in sync.
**Why it mattered:** Without updating the trigger, the outer loop would have run tonight with the old blind-fix behavior, making all the diagnostic work decorative.
