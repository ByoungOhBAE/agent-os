https://newsletter.systemdesign.one/p/claude-code-subagents-vs-agent-teams

# One Claude Is Not Enough. I Spawned an AI Team and Let It Manage Itself

### #180: Part 3 - Claude Code 24/7

- *[Share this letter](https://newsletter.systemdesign.one/p/claude-code-subagents-vs-agent-teams/?action=share) & I’ll send you some rewards for the referrals.*
You paste your prompt into Claude Code and wait for the answer.

i.e., one agent gets one task & you wait for it to finish.

But what if your task is more complicated than this?

Let’s say you’re building a feature that needs both backend & frontend code, connected to each other.

*Did you know you can assign multiple agents with different instructions & have them work in parallel?*

Let’s get started with the fundamentals…

#### **§**

### **[[Webinar] How to stop babysitting your agents (Partner)](https://getunblocked.com/events/how-to-stop-babysitting-your-agents-sep-23/?utm_source=systemdesign&utm_medium=email&utm_campaign=primary)**

Agents can generate code. Getting it right for your system, team conventions, and past decisions is the hard part. You end up wasting time and tokens in correction loops.

More MCPs give agents access to information but not understanding. The teams pulling ahead use a context layer to give agents exactly what they need.

**[Join live on Sep 23 (FREE)](https://getunblocked.com/events/how-to-stop-babysitting-your-agents-sep-23/?utm_source=systemdesign&utm_medium=email&utm_campaign=primary)** to see:

- Where teams get stuck on the AI maturity curve
- How a context layer solves for quality, efficiency, and cost
- Live demo: the same coding task with and without a context layer
*(Thanks to [Unblocked](https://getunblocked.com/events/how-to-stop-babysitting-your-agents-sep-23/?utm_source=systemdesign&utm_medium=email&utm_campaign=primary) for partnering on this newsletter.)*

#### **§**

I want to introduce **[Gencay](https://www.learnwithmeai.com/welcome)** as the guest author.

He has been building with AI since ChatGPT first shipped in 2022.

For years, he built for clients on Upwork: 7,300+ hours of it.

Now he builds in the open and shares every piece of it on **[LearnAIWithMe](https://www.learnwithmeai.com/welcome)**, every Monday, Wednesday & Friday.

Not just theory for its own sake. One real build at a time, from idea to running system.

#### **§**

*Here’s what you’ll find inside this newsletter:*

- **The two ways to run more than one Claude at once.** Subagents and agent teams, and why they solve different kinds of problems.
- **What a subagent actually gives you.** An isolated worker with its own context window, plus the report-back model that keeps your main session clean and your token cost low.
- **Why agent teams cost more, and when that’s worth it.** The tradeoffs around token usage, coordination, and when tasks with real handoffs justify a full team instead of parallel subagents.
- **What changes when agents need to share the same repo.** Git worktrees, a shared CLAUDE.md as the coordination layer, and the enforcement that keeps three agents from stepping on each other’s files.
- **Where hooks and the Writer/Reviewer pattern fit in.** What they catch, when they fire, and how they compare with relying on CLAUDE.md alone when you need work validated automatically.

#### **§**

## Subagents, isolated workers

A subagent1 is a second Claude, with its own context window, its own limits, and its own set of instructions2.

It works independently & returns the results. You can create it when you have a side task and/or when you want more than one specified Claude working in parallel.

Let’s say you’ll test your website, and you want to check two different things at once. One subagent tests *“AI Labs,”* and another tests *“AI Academy”* Page.

They run in parallel, each in its own window, and you read two short reports instead of one long mess.

Let me show you my website; I improve its pages often.

So after every change, I assign two agents, one to each page, using this prompt.

After pasting the prompt, it assigns two agents that run in parallel.

They're testing websites as we speak.

They took screenshots, found issues, and solved them.

Here is the final report:

I approved the fixes.

But what if I want these agents to work in sequence and pass their work to one another? Then I should use *agent orchestration*…

#### **§**

## Agent Orchestration

Agent orchestration3 turns separate Claudes into a team.

It turns your Claude into the team, spawns teammates, hands out tasks, and collects the results. And here teammates talk to each other, share tasks, and pass work.

Agent teams4 are experimental and off by default.

So if you have not enabled them yet, just tell Claude:

After you paste the prompt, Claude asks for your approval to change the file; once you approve it, you can use Claude agent orchestration.

Let’s create one, and a fun one:

Boids5 is the classic flocking algorithm, where three simple rules make hundreds of dots move like a flock of birds. One teammate researches the rules, the second verifies every claim, and the third builds only from what survives.

Paste this prompt:

Now, Claude assigns the researcher agent first.

After approving it, I clicked *“Research boids algorithm,”* and it opened a side tab showing this agent’s instructions.

If you click on *“Browsed the web, used a tool”,* it’ll show you the progress.

Step 1 is finished, and the research file is being created.

And next, the verifier starts working…

Now the builder starts building the app…

Here is the full version of this website, visualizing the boids flocking algorithm:

#### **§**

***Reminder: this is a teaser of the subscriber-only newsletter, exclusive to my golden members.***

When you upgrade, you’ll get:

- **A complete Claude Code setup, from your first session to a fully automated one.**
- Deep dives into how MCP, subagents, agent orchestration & hooks actually work inside Claude Code.
- **How real Claude Code projects handle context, scale & running without you.**
(If this newsletter has helped you become a better software engineer, consider subscribing to support my work.)

#### **§**

## Subagents vs orchestration

## Keep reading with a 7-day free trial