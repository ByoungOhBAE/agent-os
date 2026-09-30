https://karavox.org/devlog/agents-as-subcontractors.html

## Intro

Since 2026 I started to develop software with AI agents, mostly for work. I started with one agent, then slowly evolved to more. I tried various approaches, but none really fit my work workflow.

I distrust (frankly, I do not know the correct English word for this – it’s total distrust but with a full of curiosity and kind of expectation of good work) every agent. They make mistakes, I have to guardrail them with tokens, users and VMs. Nevertheless they proven to be useful at my work. My agents run in YOLO mode – no questions asked about editing files, committing, pushing, as they are responsible for their part.

It started to work at work. Our team delivered working solutions. I was able to offload part of my workflow to a tool and focus on what’s important. It really worked…

…and that led me to thinking about my pet project – something around Karaoke. I could code it by hand, but why not to use swarm of agents. With a lot of back and forth and with my low trust I ended up to treat them as **subcontractors**. I could take more risks with my own project.

## Why this shape

I’m a solo developer with several agents working across a small ecosystem: an open-source format and toolkit, closed-source products around it, and the infrastructure that runs them all. The constraint that shapes everything is simple: **I’m the bottleneck, and I’m also the only one with judgment.** Agents can do a lot, but they have zero context about my incident history, my edge cases, or the operational constraints that don’t live in the repository. So the design goal is: agents may do as much as possible without me — but they can never touch anything I haven’t seen.

## Where this comes from

This model didn’t start with me. It started with a post that gave the role a name: Simon Willison’s [vibe engineering](https://simonwillison.net/2025/Oct/7/vibe-engineering/) (2025-10-07) — the disciplined end of AI-assisted development, where a professional stays accountable for the software, against the fast-and-loose end of vibe coding. Willison’s own 2026 update notes the term that won out for this is [Agentic Engineering](https://simonwillison.net/tags/agentic-engineering/). The readings that followed shaped the rest:

- [Embracing the parallel coding agent lifestyle](https://simonwillison.net/2025/Oct/5/parallel-coding-agents/) (Willison, 2025-10-05) — parallel agents with review bandwidth as the bottleneck; research/PoC tasks and carefully-specified work as the safe categories.
- [How I’m using coding agents in September, 2025](https://blog.fsck.com/2025/10/05/how-im-using-coding-agents-in-september-2025/) (Jesse Vincent, 2025-10-05) — an architect/implementer split across isolated git worktrees, with a human playing PM between them.
- [Best practices for using GitHub AI coding agents in production workflows?](https://github.com/orgs/community/discussions/182197) (GitHub Community, 2025-12-17) — “AI agents are powerful teammates, not autonomous committers”: agents propose code, never own it; draft PRs only; a human-in-the-loop merge contract.

## Layer 1 — the tokens: agents can’t write near production

Every agent gets two tokens. A **read-only** token on the production repository, and a **write** token on a separate `-staging` repository. Task branches are cut directly from production’s main branch (read is enough for that) and pushed to the staging repository, which exists purely as a place the write token can reach.

The staging repository’s default branch is a deliberate tombstone, literally named `no-main`, containing only a README: “please use main branch of the original repository.” Nothing ever merges into it. Nothing ever syncs it. It has no history, no mirror, no meaning beyond being the agents’ mailbox.

Why not the standard tools? Because on the plan I’m on, they don’t exist: [GitHub’s docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) make protected branches available in public repositories on the free plan and in private repositories only from Pro up; [forking a private repository into an organization](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/about-forks) also requires GitHub Team, not Free. Token scoping is the only mechanism that physically prevents an agent from touching production — so the design builds the guarantee out of tokens instead of settings.

## Layer 2 — integration: I am the merge bot

When a branch is ready, the agent tells me. I fetch it, review the diff, and incorporate it however fits: cherry-pick, rebase-merge, or apply by hand. No pull request machinery, no merge commits written by agents, no PRs that sit unread while the queue backs up.

This is an old pattern wearing new clothes. Git’s own documentation describes it as the **integration-manager workflow**: contributors without write access submit patches, and a maintainer applies them. That’s exactly what I do — my agents are patch contributors and the staging repository is their mailbox. It’s the model the Linux kernel has used for twenty years, just with branches instead of emailed diffs.


[... middle omitted — see footer ...]

- I only spend attention where it matters — every integration is a review by definition.
- No PR queue to triage, no merge commits written by machines, no ceremony.
- The public repo keeps the contribution norm; the private repos keep the speed.

## Honest limitations

Production main itself is protected only by token scoping plus my discipline — branch protection would be belt-and-braces, but it’s not available on the plan I’m on. And the industry signal is clear: [more than one in five code reviews on GitHub now involves an agent](https://github.blog/ai-and-ml/generative-ai/agent-pull-requests-are-everywhere-heres-how-to-review-them/). Judgment is the bottleneck, and this model is built around that fact rather than pretending the bottleneck doesn’t exist.

**Sources:** GitHub docs — [about protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) and [forks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/about-forks) · Git Pro book — [contributing to a project](https://git-scm.com/book/en/v2/Distributed-Git-Contributing-to-a-Project) · [Claude Code security docs](https://code.claude.com/docs/en/security) · [OpenAI Codex — agent approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security) · [GitHub Agentic Workflows (gh-aw)](https://github.com/github/gh-aw) · [GitHub Community: best practices for AI coding agents](https://github.com/orgs/community/discussions/182197) · [GitHub blog: agent pull requests](https://github.blog/ai-and-ml/generative-ai/agent-pull-requests-are-everywhere-heres-how-to-review-them/).

──────── [TRUNCATED] ────────
Showing 5,205 chars (head) + 1,705 chars (tail) of 10,951 total clean characters.
Full text saved to: C:\Users\tahar\AppData\Local\hermes\cache\web\karavox.org-7d372f4b3e.md
To read the omitted middle: read_file path="C:\Users\tahar\AppData\Local\hermes\cache\web\karavox.org-7d372f4b3e.md" offset=37 limit=200  (the file is the complete page; raise/lower offset to page through it).
─────────────────────────────