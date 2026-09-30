https://www.t2d3.pro/learn/six-months-shipping-software-with-claude-code

# Six Months of Shipping Software With Claude Code: Our Field Notes

T2D3 OS is built almost entirely by Claude Code agents, directed by a founder who doesn't write code. A peer CTO asked what we learned, so we wrote it down: the constitution, shared memory, token cost, the overnight bug loop, Mission Control, agents that answer support mail, and moving CI, builds and batch AI onto our own servers.

Stijn Hendrikse · Sep 17, 2026

A CTO I work with, whose team is going deep on Claude Code, asked me what we have learned building T2D3 OS this way. I wrote him a briefing. It turned out to be the most useful document we have about how we work, so here it is for everyone.

**Prefer slides?** The companion deck covers the same ground in 14 slides: [Agentic Field Notes deck](https://claude.ai/artifact/JANaoVWbH3ZpXzmsibsr9A).

Some context first. T2D3 OS is a B2B marketing SaaS on Next.js and Supabase. Since March 15, 2026 it has taken about 10,350 commits, almost all written by Claude Code agents. I direct and review; I don't write code. By July we had merged about 3,600 pull requests with zero human code reviews.

We didn't plan to work that way. It is what happens when agents write the code and one person steers. Once it was true, every guarantee had to come from somewhere other than a reviewer: types, lint, CI gates, hooks, and a merge queue that won't merge a red PR. Almost everything below follows from one sentence we keep relearning:

> Prose rules are about 95% reliable. A rule is only as strong as the lowest layer that enforces it.

## 1. The constitution: a CLAUDE.md that is mostly a table of CI checks

Our `CLAUDE.md` is organised by *how a rule is enforced*, not by how important it is:

- **Invariant:** never broken. Enforced by types, lint or a CI script; a violating PR can't merge.
- **Convention:** follow unless there's a reason not to. Caught by review agents and periodic audits.
- **Suggestion:** the default when nothing else applies.
The file's first instruction to its reader: before adding a "thou shalt", ask whether the type system or a lint can enforce it. If it can, add an invariant and wire the check, not another paragraph.

### How a lesson graduates

An incident becomes a memory, and the memory becomes an invariant. A new invariant lands as one PR: a check in our invariants script (now over 5,000 lines and 110+ numbered rules), a one-line row in CLAUDE.md, a rationale with a copy-paste fix in a longer doc, and, when existing code can't comply on day one, a **ratchet baseline**. Once CI enforces the lesson, the memory is deleted.

A ratchet is a text file that freezes today's violations. New violations fail CI, and the file may only shrink. A stale row fails CI too, so the debt can't quietly grow back. We have 38 of them, covering things like database writes that drop their error, type-system escape hatches, files over 700 lines, and fetches that are never cancelled.

### Incidents that became rules

| What happened | The rule it produced |
|---|---|
| Work "done" in chat never landed | Every task starts by stating how it will be verified. A Stop hook refuses to end a session whose branch is unmerged. |
| 30 open PRs, all assumed shipped | A session-start hook shows the repo-wide PR backlog. "An open PR is a debt, not a deliverable." |
| Schema changed live, with no file in git | The migration tool refuses uncommitted SQL, and a pre-tool hook blocks raw schema changes. |
| A rebase silently dropped 292 translation keys | The key count may never drop. The parity check had stayed green because every language lost the same keys. |
| A database function was replaced from a stale copy, twice | A migration that replaces a listed function must execute every branch when it is applied. |
| A custom domain made production "not look like production" | One resolver answers "which environment is this?", and private copies of that logic fail CI. |
| 349 loose files led to six copies of the same helper | The shared library root is a closed set, so new code goes into a domain folder where agents will find it. |
| A deploy token showed up in the process list | No secret may appear on a command line, and every credential must be listed in a registry. |

Three things we'd tell anyone starting this:

- **Cap the constitution's size in CI.** Ours regrew to 97% of its pre-cleanup size within a month, so a line and word budget is now itself an invariant.
- **Check that the docs match the checks.** CLAUDE.md once said "5 required checks" when the queue required 7. Every rule in the script now needs a row in the doc, or CI fails.
- **Verify a ratchet's floor by deleting the thing it guards.** A search once claimed "1 file, 8 sites". Actually deleting the field revealed 174 files and 452 errors.

## 2. Hooks and worktrees: the harness enforces what the model forgets

Claude Code hooks are our middle layer, between prose and CI. The ones that earned their place:

- **At session start:** the open-PR backlog; migrations committed but not applied (and the reverse); configuration that drifted between environments; a memory watchdog; a cost guard that resets risky model settings; and this machine's role and permissions.
- **Before a tool runs:** block raw schema changes that bypass the migration tool.
- **After a tool runs:** after 300 tool calls or 6 hours, tell the session to wrap up, hand off and start fresh. It nags; it never blocks.
- **On stop:** refuse the first stop while the branch is unmerged or the session's own done-conditions are unmet.
**One worktree per session, always.** Several sessions sharing one checkout silently overwrite each other's files: a `git checkout` in one session changes the files under another. A launcher script creates a fresh worktree on its own branch, links environment files and dependencies, points it at the shared memory folder and prunes merged worktrees.

**Machines as roles.** We run Claude on several machines, each with a fixed role: primary builder, backup builder, mobile, inference. Every role can write code, but only one machine at a time may change the shared development database schema. That right is a lease stored as a file in a git repo, so claiming it is a commit and a push, and git's own rejection of a conflicting push settles any race.

Claude Code's file-based memory is where lessons live before they graduate into checks. Ours is a private git repo. A hook pulls it when a session starts and pushes it when a session stops, so every machine and every worktree reads the same store.

| Type | Files | What goes in it |
|---|---|---|
| Project | ~765 | Live programs: state, the next session's name, what's owed |
| Reference | ~240 | How the system actually behaves: failure signatures, gotchas |
| Feedback | ~150 | How I want the agents to work, with the *why* |
| User | 2 | Who they work for |

The hygiene rules: update a memory rather than create a near-duplicate; replace an outdated one with a tombstone; give project memories a review date; delete a lesson once CI enforces it; and run a script that checks the index for orphans and duplicates. The index is loaded into every session and cut off past a size limit, so it has to stay short. We still overshoot it regularly.

### Ten lessons worth stealing

1. **"Done" never has follow-ups.** If you name a follow-up in the same breath, it wasn't done.
2. **Verify by content, not status.** "Merged" isn't proof: a merge queue squashes the snapshot it was given, not the branch tip. Check that the change is actually on the default branch.
3. **Spot-audit completion reports.** One 16-PR program's final report had 3 of 10 checkable claims wrong.
4. **No speculative tool chains.** Parallel push, open-PR and merge calls with guessed PR numbers produced "two rounds of imagined merges".
5. **Background shell tasks die at the end of the turn.** Run long checks in the foreground, or detach them properly.
6. **Prefer structural fixes to one-off patches.** Build the self-heal and let it repair the bad data.
7. **Check whether a pasted handoff already landed.** Two machines once wrote the same production rows 47 seconds apart.
8. **Stay in your own lane.** Drive your own work to merge; another session's work gets one factual line at most.
9. **Claim before expensive work.** Record the claim before a multi-minute background job starts, and ship a cleanup for claims that never finish.
10. **Triage a red check before calling an incident.** Know which checks are required and which are advisory.

## 4. Sessions and token cost: the bill was context re-reads, not model intelligence

In late August, coding with Claude Code was costing us about **$45k per 30 days** at API list price, while the product's own AI features cost about $800. So we audited the bill:

- **About 73% was cache reads.** Every tool call re-reads the whole context. Sessions using a 1M-token window averaged roughly 230k tokens of context per call, with peaks near 1M.
- **The top 15 of 382 sessions were 43% of spend.** Half of all usage came from sessions longer than 8 hours. Loops that watched PRs burned 0.4 to 1.1M tokens per run.
- **Model intelligence itself was about 6% of the bill.**
What we changed:

- **A 200k context window by default** and no 1M model, with a hook that resets those settings on every machine at session start.
- **Session length caps.** After 300 tool calls or 6 hours, the session commits, writes a handoff and starts fresh through the launcher.
- **Route models by task and never downgrade quietly.** The frontier model at high effort for real coding; a smaller model for mechanical sweeps and PR watching. Moving up a tier is always allowed, as long as it's announced.
- **A session launcher with an account picker.** We hold several Claude subscription seats. The picker reads each seat's weekly and 5-hour usage, spreads work evenly across the week, and falls back to a metered API key only when every seat is exhausted.
Within a week the daily average fell from about $2,240 to about $990, down 56%. Spend on 1M-context sessions went to zero.

What surprised us:

- **"Auto-continue at limit" quietly billed** about $7.5k in usage credits on one seat in a single month. Turn it off, or watch it closely.
- **Old worktrees rolled back the launcher.** A hook copied the picker from whichever worktree a session started in. The fix was a version stamp that refuses downgrades. A self-heal must live where the rollback can't reach it.
- **When a spend cap trips, spend moves to the next key** rather than stopping. Cap every path.

## 5. The overnight bug loop: bugs triaged by an agent panel and fixed while we sleep

1. **Intake.** In-app feedback, support tickets, Sentry issues, QA failures and a Slack channel feed one work-item table, synced every 10 minutes.
2. **Panel.** Every 4 hours, read-only agents score each item, then a devil's advocate and a synthesizer write a verdict.
3. **Approval.** Policy lanes (items I filed, Sentry issues, trusted reporters) or an operator's single click mark an item for an AI fix.
4. **Fixer.** Twice a night, headless Claude Code opens one PR per bug in its own worktree, with a restricted tool list.
5. **Land and reply.** A blast-radius band decides whether the PR merges on its own. The reply to the reporter is drafted and sent after a 24-hour veto window.

### The panel

These are Claude Code subagents. A **signal aggregator** deduplicates, clusters and weights the requester by usage. Depending on the item type, a **business-value analyst**, **strategic-fit gatekeeper**, **technical architect**, **UX advocate** and **effort estimator** score it in parallel. A **devil's advocate** is never skipped: it is our insurance against specialists who all share one base model. A **synthesizer** then routes the item.

If two specialists' scores differ by 4 or more points, the item goes to a human, because disagreement is exactly what a human should spend ten minutes on. A bug only qualifies for an automatic fix when the architect marks it isolated (no authentication, row-level security, billing, migrations or API contract changes), under about 50 lines, and sized XS or S.

### The fixer's guardrails

- **Split fetch, agent and apply.** The step holding production secrets never runs a model, and the model step has no shell and no database access. A CI check fails any workflow that puts an agent step next to a production secret. That breaks up the "lethal trifecta" of untrusted input, secrets and tools in one agent.
- **A restricted tool list.** Read, search and edit tools, plus test, git and PR-creation commands only, with a turn limit and a 25-minute timeout inside the harness.
- **It checks first whether the bug is already fixed.** Reports can wait days, so the fixer records "already fixed" and stops instead of rebuilding.
- **Tests are re-run independently** before merging is enabled. A fixer once shipped with its own new test failing.
- **Parallelism is capped at 2, below the runner pool.** Five fixers once held every runner and starved the merge queue.
- **Retry once, then hand to a human.** A lost retry marker once created an endless requeue loop.
A script classifies every PR by the paths it touches: `direct` (tests, docs, tooling, isolated defects), `owner` (inside a domain someone owns) or `founder` (architecture, data model, security, billing). Paths that match no rule count as `founder`. It's a required check. Only a `direct` PR gets auto-merge from the fixer, because arming auto-merge *is* the yes.

## 6. Mission Control: a cockpit for human judgment, not for typing

Mission Control is an admin area inside our app. It has an **Inbox** of work items from every source, each showing the panel's verdict with the specialists' disagreement visible; a **Fix queue**; **Requests** sent to a coding agent; an **Ask the Codebase** read-only analyst; and a **Ledger** of work programs and sessions.

- **Decision briefs.** For every parked item, an agent writes a recommendation, the case against it, and a draft reply for each outcome. The human's click records the real verdict.
- **Send to the coding agent.** One button turns an item into a request. A GitHub Action runs headless Claude Code with the full constitution and opens a ready PR. The agent never merges it. A follow-up box starts another run on the same PR.
- **Agents suggest; they don't reclassify.** An agent that could relabel a suggestion as a bug could route it into the auto-fix queue with no human involved.

> When the backlog hit 150, the fixer was using 12 of its 45 nightly slots. It wasn't a capacity problem. It was a judgment problem, a hundred times over.

That's why Mission Control spends its effort on making each human decision faster (brief, recommendation, devil's advocate, draft replies) rather than on adding more agents.

## 7. Continuous deploy: a merge queue on dev and an error budget on production

We used to have a rule requiring weekend production releases. In practice we were syncing to production up to 13 times a day. A rule that fictional teaches every session that rules are decorative, so we wrote down what we actually did:

- **Development branch:** a GitHub merge queue with 9 required checks (typecheck, invariants, lint, security-policy coverage, unit tests, an authorization matrix, translation parity, build plus function size, and change band). Agents enqueue with `gh pr merge --auto`.
- **Production:** a sync PR may land any time it's green. A required **error budget** check fails above 150 production errors in 6 hours, or when one issue exceeds 100 events in 24 hours. It fails open when Sentry itself is down and fails closed on an auth error, because silent auth failures are how gates die.
- **Canary:** a synthetic user signs in to production every 30 minutes and on every deploy, walks the core flows, and blocks the next sync if anything fails.
- **My review moved** to a weekly risk-ranked digest and to demo-gated promotions from beta to released.

## 8. Agents that email users: Wren answers support mail, and never picks the recipient

Our Claude coding partner has a name (Wren), a real mailbox, and a place on our team page. Three scheduled runs a day read the inbox and sort each message into a lane: **do**, **answer**, **triage**, **escalate**, **support** or **noise**. The prompt says: "If there is nothing in the inbox, the correct output is nothing."

How a support case runs:

1. **The run assembles a dossier before the model starts,** using read-only credentials. For every external address it gathers account status, recent sign-in errors, and email delivery and suppression records. A source it can't reach is marked *unavailable*, not skipped.
2. **The model names one of three outcomes:** not a bug, a bug it fixes in a PR, or an escalation.
3. **It replies to the teammate who forwarded the mail,** with findings plus a draft the customer-success person can send as-is (no internal jargon, no vendor names). It writes to a customer directly only if that customer wrote to it.
**Keep the secrets away from the model.** The model only writes a reply file to an outbox. The run posts it to an endpoint that looks up the recipient from the stored inbound message and sends it through our single email wrapper, with threading headers and rate limits. There is no recipient field anywhere the model can touch: "There is no address in that file because there is no address for you to choose."

The first real case was a magic link that "never arrived". It wasn't a bug: the customer's mail gateway was holding it. The same run caught one of our own bugs, a reply sent three times, which was fixed the same day.

## 9. Agents in the product: background jobs are the product's agents

Inside T2D3 OS, 27 registered agents own 85 types of background job: content ideation and drafting, signal extraction, audience enrichment, client reporting and more. A CI invariant requires that every job type belongs to exactly one agent, so no work escapes the per-customer pause, cadence, daily cap and spend tracking.

**Autonomy is a ladder, earned by context:** `proposal_only` → `draft_for_review` → `auto`. How far an agent climbs depends on how rich the customer's foundation is (ICP, personas, value propositions, brand). Destructive or outbound actions never reach `auto`. The product principles behind it, several of which are becoming CI checks:

- **Close the loop.** Every generator ships a way to capture human feedback, distill it and feed it back in. A generator with no feedback path is unfinished.
- **Glass box.** Every output records the sources it was grounded in, and the interface shows them.
- **AI recommends before humans decide.** Every vote or required input comes with a recommendation and a devil's-advocate critique. Silent zero defaults are banned.
- **Agents lead, humans steer.** Modules draft before being asked; humans keep the votes, locks and final decisions.
**Named teammates and an AI CMO.** We're building a virtual team of 26 named AI specialists, one PR per member: logic, a decision record, a prompt plus a critic prompt, a UI panel and an acceptance test. Above them sits **Lark**, an AI CMO. Every day Lark gathers context and writes a brief that a validator checks (every "needs you" item must name an owner), then emails and posts it and takes tasks from the replies. For reviews, Lark runs several team members as subagents and keeps their disagreements. Lark acts through our own MCP server: 107 tools, every call runs as a real user so security policies and the audit trail apply, and a per-credential policy sets each capability to auto, propose or deny. Proposals can be approved by replying to an email.

What we learned the hard way:

- **A green workflow doesn't prove the agent inside it could work.** Read the run log. One dry run was green while the agent had silently lost its shell tool.
- **Check what the human actually receives.** Three briefs were validated and merged, and nobody read them, because nothing delivered them.
- **An agent given a real mailbox gets a real mailbox's spam.** Look at the inbox before you ship "read your mail and act on it."
- **Audit the doors before adding features.** What the AI CMO lacked was credentials, an autonomy policy, an approval flow and speed, not intelligence.
Agents also write in public: a daily changelog generated from merged PRs, with a validator that checks it's safe to publish, and a first-person engineering journal.

## 10. Our own servers: we moved the builds, not the functions

### CI: from GitHub-hosted runners to our own machines

GitHub Actions spend grew from about $160 in May to $1,000 in August, at 218k minutes a month. Then a billing cap we didn't know existed made every job fail within 5 seconds. Within a day we routed 59 jobs through one repository variable (`runs-on: ${{ vars.CI_RUNS_ON || 'ubuntu-latest' }}`) to about 19 self-hosted runners on three servers and a workstation. Rolling back means deleting that one variable. Hosted minutes are now close to zero.

- **Use capability labels, not host names.** A `build` label marks the machines that can actually finish a Next.js build.
- **Admission control for memory.** A gate gives each host a shared memory budget (build 24 GiB, typecheck 10 GiB, tests 6 GiB), queues jobs in order, and reclaims slots held for more than 90 minutes.
- **Don't trust GitHub's runner status.** It once reported all 21 runners offline while CI was running.

### Vercel: build on our runners, deploy prebuilt

In August, Vercel build CPU was about $4,160 of a $4,620 bill (90%), while function compute was $27. So our development and production branches now run `vercel build` on our own runners and `vercel deploy --prebuilt`. Vercel is told to skip its own build, and preview builds are opt-in per commit. Expected saving: roughly $3–4k a month.

Gotchas: `vercel pull` writes sensitive environment variables as the literal string `[SENSITIVE]`, so we re-inject them from CI secrets. Test tokens with `vercel pull`, not a single API call. And fail the build on any unexpected file in the function trace: one tracing bug pulled the whole repo into every function and blocked deploys for 18 hours.

### Self-hosted LLMs for batch and high-volume work

Every AI call in the product goes through one dispatcher. Vendor SDKs and model IDs are allowed in exactly one place, and CI enforces it. Self-hosted servers plug in as OpenAI-compatible providers, routed per prompt, with fallback to the cloud.

| Tier | Hardware | Serves | Used for |
|---|---|---|---|
| Fast | RTX 5090 + 4090, vLLM | Qwen 3.5 9B (130 tok/s; 2,600 tok/s at batch 32), Whisper, embeddings, image generation | Extraction, triage, URL checks, dedup |
| Batch | 128 GB unified-memory desktop, llama.cpp | gpt-oss-120b (~40 tok/s) | Content grading, dedup decisions |
| Mid | RTX 3090, 256 GB RAM | Qwen 3.5 27B (41 tok/s) | Longer structured tasks |
| Frontier | Anthropic, OpenAI and Google APIs | Current top models; Anthropic's Batch API at 50% off for background work | Everything customer-facing that hasn't passed evals locally |

Local models handled 36% of our AI calls over the last 30 days. We measure cost (tokens per second, power at $0.22/kWh, three-year amortisation) instead of assuming it. And we don't route to a cheaper model when quality matters: the rule is to match the model to the task and never degrade the work to save tokens.

Traps we hit:

- **Qwen 3.5 "thinks" by default.** Each call spent about 3,300 reasoning tokens and 83 seconds, and 95% of calls fell back to the cloud even while the server was up. With thinking disabled, a call takes 811 ms and nothing falls back. The rule we took from it: a local fleet has to be a proven cost hedge, not a decorative one.
- **A proxy served a different model when the context overflowed,** so our cost tracking now records the model that actually answered.
- **CI and inference share the same machines.** A 120B model holding 105 GB left too little memory for builds. That's why capability labels exist.
- **"Lost communication with the runner" was memory pressure throttling the runner's own network.** Raise the memory ceiling, add swap, and set the service to always restart: the runner exits cleanly when it can't reach GitHub, so restart-on-failure never brings it back.

## If we were starting again next Monday

1. **One worktree per session, created by a script.** It's the cheapest fix for the most destructive failure.
2. **Tier CLAUDE.md by enforcement, and add one CI invariant per incident.** Use ratchets for existing debt, and cap the file's size.
3. **Add a Stop hook that won't let "done" mean "on a branch".** Done means merged, and verified by content on the default branch.
4. **Keep memory in git, with a graduation rule.** Lessons live there until CI enforces them, then they're deleted.
5. **Read your token bill by context size, not model tier.** Cap the context window and session length, and pace usage across seats.
6. **Use a merge queue with required checks, plus an error budget and a canary on production.** Replace the human review you no longer do with gates you actually run.
7. **Split fetch, agent and apply** in any workflow where a model reads untrusted text.
8. **Put an agent panel in front of the autofixer,** and let blast radius, not confidence, decide what merges without a human.
9. **Move builds to your own runners** behind one repository variable you can roll back.
10. **Spend human time on judgment.** Make every decision arrive with a recommendation, the case against it, and a draft reply.
The slides for this piece are here: [Agentic Field Notes deck](https://claude.ai/artifact/JANaoVWbH3ZpXzmsibsr9A). If you're running something similar, I'd love to compare notes.

*Figures are from our repository, CI and billing as of September 16, 2026. Dollar amounts are rounded.*

## Join the conversation

## Put this playbook to work — with the OS built for it.

T2D3 OS turns the method behind this guide into working modules: ICP, personas, positioning, content, and a full GTM plan. Start free.