https://alisson.au/articles/paperclip-cloudxm/

[Paperclip](https://github.com/paperclipai/paperclip) is an open-source orchestration platform designed to run AI-run companies. I installed it on an Intel NUC home server in May 2026, configured it with 15 AI agents, and let it run CloudXM operations. It worked, and it was the best bet I made that month.

## The org structure

Paperclip runs agents as a single company, not as isolated workers. I set up a full organizational hierarchy:

![CloudXM org chart on Paperclip](/articles/paperclip/org-chart.png)

Fifteen agents, a count from my own deployment rather than an audited figure. Each one has its own AGENTS.md with role-specific instructions, a HEARTBEAT.md that defines what it does when it wakes up, and a SOUL.md for personality. The CTO agent literally has “NO CODING” as a hard rule. It delegates everything to the leads below it.

## The heartbeat

Every agent runs on a heartbeat. When Paperclip wakes an agent, it follows a checklist. The CEO’s heartbeat, for example:

1. Confirm identity via API (`GET /api/agents/me`)
2. Check wake context: was it a task, a mention, or a scheduled wake?
3. Read today’s plan from its memory directory
4. Get assignments from the issue tracker (`GET /api/companies/{companyId}/issues`)
5. Prioritize: in_progress first, then in_review, then todo
6. Checkout the issue, do the work, update status
7. Delegate subtasks to the right agent
8. Extract facts from conversations to its knowledge base
9. Exit cleanly
The CTO heartbeat is simpler: check for architecture reviews, review PRs, check deployment pipeline, coordinate with AI Engineer. Never write code.

The Frontend Engineer heartbeat: verify the active repo, read the issue plan, check backend API health before making changes, run `npm run build` before committing.

Each heartbeat is a contract. The agent wakes up, follows the checklist, does the work, and goes back to sleep, with no room for drift or improvisation.

## The busiest month

June 2026 was the busiest month. The system was running at full tilt. Here is what a normal day looked like:

- **06:00** - CEO wakes up, reviews daily plan, delegates tasks to leads
- **07:00** - CTO reviews overnight PRs, approves architecture changes
- **08:00** - Convert Product Lead breaks down features into subtasks
- **09:00** - Frontend Engineer starts on admin console changes
- **10:00** - Backend AI Engineer works on API endpoints
- **11:00** - AI Engineer tunes prompt templates
- **12:00** - Knowledge Engineer reviews RAG pipeline quality
- **13:00** - DevOps Engineer deploys to NUC for smoke testing
- **14:00** - Playwright Tester runs E2E suite against staging
- **15:00** - QA Engineer validates plugin compatibility
- **16:00** - Website Developer updates cloudxm.com.br
- **17:00** - Content Writer drafts blog posts
- **18:00** - CEO reviews progress, updates plan for tomorrow
- **19:00** - CTO signs off on merge approvals
- **20:00** - System goes quiet until next heartbeat cycle
This was the daily rhythm, not a one-time burst. The NUC handled the load without issue.

## Token burn

The numbers are real, but the forward-looking cost figures are estimates, not independently audited. DeepSeek v4 Flash through OpenCode was the primary model (the model name checks out on [DeepSeek’s pricing and model page](https://api-docs.deepseek.com/quick_start/pricing)). At peak, the system burned through roughly 2-3 billion tokens per month. That sounds like a lot until you look at what flash models actually charge. Older published figures put them around $0.27 per million input tokens and $1.10 per million output tokens, but current pricing has shifted and I could not reconfirm those exact numbers.

The math: 2 billion tokens at an average of $0.50 per million equals roughly $1,000 per month, but both the average rate and the token volume are estimates from my own run. For fifteen agents running daily, doing real work, that is cheaper than one junior developer’s salary.

The context compression helped. Headroom-ai with kompress-v2-base (ONNX, CPU) reduced token usage by 60-95% on long conversations in my runs. Without it, the burn would have been three times higher.

## How agents get lost

The system ran, and it still lost time. Reading the run logs as a systems engineer rather than an AI enthusiast, the failures sorted themselves into a familiar taxonomy. Fifteen agents, a shared repository, a credential store, and a platform API are nodes in a small distributed system that coordinate through files and HTTP, and almost none of the failures were the model reasoning badly. They were staleness, partial failure, and inconsistency, which are the standard failure classes of any distributed coordination, appearing here in a new setting.

**Stale hand-offs, the most common failure.** An agent would be told to work on something that had been renamed, moved, or reassigned since the instruction was written. It went looking, found nothing, and burned a full work cycle anyway. This is cache invalidation with no expiry: the instruction was written against a version of the world that had since changed, and nothing told the agent to re-read it.

**Dirty reads.** Sometimes the failure was inherited. The previous agent on a task had left changes half-made and never checked them in, so the next agent opened work that did not match what the spec described. It had to reverse-engineer intent from the workspace state and often guessed wrong. In database terms it performed a dirty read: it consumed another worker’s uncommitted state as though it were final, and the corruption propagated downstream. **Blocking on access.** Several tasks stalled because an agent needed a credential or a permission it could not reach, and there was no one it could ask. It set the task aside, wrote up exactly what was needed, and waited. From the outside the system looked busy. From the inside nothing was moving. Distributed systems have an old name for this class of problem: a process blocked on a resource it cannot acquire, with no failure detector to escalate the wait. Autonomy grinds to a halt on the administration of access, not on hard problems.

**The unmet dependency.** Close cousin to the locked door. An agent would confirm that a key or a decision existed, but the value never reached its own environment, so it refused to pretend the work was done. That is the correct behavior, and the stall is real either way: the task sits blocked until a human places the missing piece where the agent can reach it. A dependency declared but not provisioned is indistinguishable, from the inside, from one that does not exist.

**Reasoning from stale state.** An agent sometimes decided an API did not exist when it actually did, because it was reasoning from outdated information rather than a fresh observation. When an autonomous worker’s model of the world drifts from reality, it makes confident calls on wrong premises. This is the closest entry on the list to a pure reasoning failure, and even it reduces to an input problem: the reasoning was sound given what it was told, and what it was told was stale. **Misrouting.** A task meant for the frontend codebase landed in a backend library. The agent caught it, said the work could not be done there, and escalated. The routing slip cost a full work cycle. The message was durable and correctly delivered; the cost was a lost working window, not data.

**Environment mismatch.** One release script used a Mac-only command and failed on the Linux machine it ran on, so the agent did that step by hand. Trivial in isolation, and a recurring cost of running the same tooling on more than one platform: the environment is part of the contract, and half the fleet did not honor it.

**Lost to the infrastructure itself.** Once the orchestration platform’s own API went down mid-run. The work was done and the tests passed, but the agent could not record the result, so the task was effectively finished yet officially stuck until someone fixed the bookkeeping by hand. Anyone who has run a distributed transaction knows the shape: the commit succeeded on the worker, the acknowledgement never reached the coordinator, and the system is left in an in-doubt state that only a human can resolve.

None of these are bugs in Paperclip. They are the standing failure modes of any distributed system that coordinates through shared state, and they share one root cause: the agent acted on a belief about the world that the world had since revised. The systems-engineering canon has spent four decades on exactly this problem, and its answers, fresh reads before acting, transactional hand-offs, idempotent retries, health checks that escalate, translate directly to agent orchestration. Autonomy breaks at the boundaries, and the boundaries are where the engineering is.

## The bigger picture

The month of run logs points to one conclusion: the model was the most reliable component in the system. The hardware held, the models reasoned soundly on the information they had, and every failure I traced sat in the seams between components. This is worth internalizing now, while the industry concentrates its investment on scaling the component that already works. What limits a fleet of autonomous agents is the coordination substrate around it: how fresh its view of the world is, how cleanly work passes between workers, how access gets provisioned, how failures are detected and retried.

The system is still running. Paperclip backs up its database every hour (15.5MB compressed), the agents still wake on heartbeats, and the NUC still carries the load without upgrades. That a machine costing a few hundred dollars can host a working company of fifteen agents says that the constraint on this style of work is organizational rather than computational.

If you build AI systems and have never run the infrastructure yourself, spend a month doing it. A cheap box and an open-source platform will teach the lesson faster than any managed service: reliability in agentic systems is a coordination problem, and coordination problems yield to the unglamorous machinery that distributed systems engineering has spent four decades building.

## Further reading

The failure modes in “How agents get lost” track what the research literature calls [ReAct](https://arxiv.org/abs/2210.03629), the approach that interleaves an agent’s reasoning with its actions against a tool or environment. Re-observing the world at each step is precisely the mechanism that keeps an agent from acting on stale state, and it is what my agents were missing.

For the other half, the company-of-agents structure, [CAMEL](https://arxiv.org/abs/2303.17760) is the canonical study of communicative agents that role-play in a society of models, cooperating on tasks through instruction-following.

---

*Paperclip is an open-source orchestration platform. The CloudXM company instance runs on an Intel NUC at paperclip.alisson.au, exposed via Cloudflare Tunnel. The agent stack uses DeepSeek v4 Flash via OpenCode adapter.*