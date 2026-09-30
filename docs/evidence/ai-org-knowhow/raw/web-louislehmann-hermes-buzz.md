https://www.louislehmann.fyi/lab/hermes

Capstone project · March → August 2026

# Hermes + Buzz

Hermes runs locally on a Mac mini, retrieves project context from Obsidian, and routes work to specialist agents in Buzz. Each handoff ends with an artifact I can inspect.

Mac mini control planeBuzz workspaceproject contextmodel routinghuman approval

[ ![Hermes and Buzz architecture: a local Hermes control plane routes project work to research, build, communication, and review agents inside Buzz, then returns verified artifacts through an evidence loop and human approval gate.](/lab/hermes/hermes-buzz-orchestration-visual-v2.png) ](/lab/hermes/hermes-buzz-orchestration-visual-v2.png)

How it grew

## From local operator to an orchestrated agent team.

The system grew in three steps: make one agent reliable, give specialists clear project boundaries and model policies, then keep Hermes accountable for the result.

March 2026

### Hermes came online

The first version was a local operator on a Mac mini: one place to carry context, inspect files, use tools, ship work, run scheduled checks, and resume projects without restarting from zero.

July 2026

### Buzz added the team layer

Buzz introduced shared channels for people and independently addressable agents. Hermes could remain the executive front door while specialist identities worked inside visible, project-aware conversations.

Now

### Hermes became the control plane

Hermes now routes work across a small team with clear roles, different models and reasoning levels, dedicated project rooms, independent review, and evidence-backed handoffs.

Two systems, one loop

## Hermes runs the work. Buzz makes the team legible.

Hermes owns the work from intake through verification. Buzz gives people and agents a shared place to see assignments, questions, progress, and handoffs.

Hermes / control planeLive

### The accountable operator

Hermes owns intake, decomposition, routing, synthesis, follow-up, and the final communication back to me.

**Continuity**Project files, sessions, memory, skills, and schedules preserve the operating thread.

**Execution**Browser, terminal, files, GitHub, documents, web research, APIs, and delegated workers turn intent into artifacts.

**Control**Acceptance checks, approvals, and live verification separate completed work from plausible-sounding progress.

Buzz / collaboration layerLive + evolving

### The shared workspace

Buzz gives people and agents a shared, self-hostable workspace with signed identities, channels, threads, presence, media, and independently configurable agent runtimes.

**Visibility**Assignments, questions, progress, and handoffs happen in a place a human can observe.

**Boundaries**Durable project channels reduce context bleed and expose only the relevant specialists.

**Policy**Each role can carry its own model, reasoning level, instructions, access, and response policy.

The agent team

## One orchestrator routes four specialist roles.

Each role has a defined job and model policy. Routine tasks use lighter models; research and independent review get more reasoning when the work warrants it.

HermesLive

Executive front door. Prioritizes, decomposes, routes, synthesizes, verifies, and closes the loop.

Sol · medium
control plane
ResearchTarget role

Evidence-backed research, source recovery, market and technical intelligence.

Sol · high
judgment lane
BuildTarget role

Coding, automation, configuration, prototypes, tests, and implementation.

Terra · high
execution lane
SignalTarget role

Positioning, copy, outreach, briefs, and audience-specific communication.

Terra · medium
communication lane
ReviewNext role

Independent QA, source audit, risk review, and pre-publication verification.

Sol · high
independent check

Project workspaces

## Each project gets its own room.

Each meaningful initiative gets a durable workspace. Hermes brings in only the specialists needed, keeps acceptance criteria visible, and prevents unrelated context from bleeding across projects.

Buzz / project channel mapOperating model

# projectRenaissance

Product research, design decisions, implementation, and production QA stay in one durable lane.

HermesResearchBuildReview

# projectPortfolio & positioning

Professional narrative, page updates, evidence, and publication review share one visible decision trail.

HermesResearchSignalReview

# projectOperations systems

Recurring dashboards, household workflows, and automations run with explicit human approval boundaries.

HermesBuildHuman approval

Memory and retrieval

## Obsidian gives the team a structured memory layer.

Obsidian stores project decisions, evidence, and context as local Markdown with Git history. Hermes loads only the notes the current task needs.

Obsidian / knowledge layerOperating now

### Inspectable project memory

The vault stores project notes, decisions, sources, dashboards, and evidence as local Markdown. Git history keeps automated updates visible and reversible.

**Distilled**Important outcomes become compact Evidence Cards with source handles, confidence, and freshness.

**Routed**Preferences, procedures, project state, and temporary work go to different layers instead of one overloaded memory store.

**Reviewable**Linting, verification, and Git history keep automated updates visible and reversible.

Hermes / retrieval loopLive + evolving

### Hermes retrieves context on demand

Hermes starts with compact memory and the active project, then retrieves only the notes needed to make the next decision. Exact search comes first; scoped semantic search fills the gaps.

**Scoped**Hot context and project bundles prevent the full vault from becoming prompt noise.

**Fresh**Dated operational claims can expire instead of silently becoming permanent truth.

**Adaptive**Recurring intelligence reviews turn verified session outcomes into better project context, skills, and memory.

01**Observe**A session, source, tool result, or project change produces new evidence.

02**Distill**Useful outcomes become a source note, decision, project update, skill, or Evidence Card.

03**Retrieve**Hermes uses exact paths and session recall first, then scoped semantic search when needed.

04**Load**Only the relevant context bundle and supporting notes enter the working session.

05**Refresh**Scheduled reviews flag stale claims and keep active project context current.

Hermes retrieves the smallest trustworthy context needed for the next decision.

The orchestration contract

## Every assignment ends with inspectable evidence.

Hermes uses a specialist only when splitting the work saves more time than coordinating it. Each assignment includes a success check before Hermes closes the loop.

01**Intake**One goal arrives through Desktop, Telegram, Buzz, or a scheduled trigger.

02**Context**Hermes loads compact memory, the relevant Obsidian context bundle, prior decisions, constraints, and the definition of done.

03**Route**Only the necessary specialist receives a bounded assignment and acceptance check.

04**Execute**Tools produce a document, diff, test result, screenshot, live route, or researched decision.

05**Verify**Hermes or an independent reviewer checks the artifact before synthesis and delivery.

Each workflow should make the result easier to inspect, safer to ship, and simpler to resume.

Current state

## What works now, and what is still being built.

The working foundation is listed separately from the role contracts, model policies, and controls still being configured.

Operating now

### The working foundation

- Hermes runs locally with Desktop and Telegram entry points.
- Memory, skills, sessions, scheduled jobs, browser QA, files, and GitHub workflows are in the loop.
- Obsidian provides the local, source-backed knowledge layer; scoped retrieval keeps only relevant project context in the working session.
- Buzz hosts Hermes plus three distinct Codex-based specialist identities.
- Agent identities are owner-controlled and independently addressable.
- Changes are checked with tests, diffs, console output, screenshots, and live routes.

Being built out

### The team operating system

- Replace generic specialist personas with strict Research, Build, and Signal role contracts.
- Assign different default models and reasoning levels by work type.
- Add an independent Review role for consequential work.
- Use dedicated project spaces and tighter tool/credential scopes.
- Tune the system from real task data instead of maximizing agent count.

What it enables

## What the system does in practice.

The system turns ambiguous requests into finished, checked, and resumable artifacts across product work, research, and recurring operations.

### Product and website shipping

Scope, research, copy, code, visual assets, GitHub changes, deploy checks, responsive browser QA, and concise handoff.

### Research and decisions

Parallel evidence gathering, primary-source recovery, contradiction checks, structured recommendations, and independent review.

### Operations and continuity

Recurring dashboards, scheduled checks, household systems, project memory, reminders, and cross-session follow-through.

Operating principle

## A small team with clear ownership and visible proof.