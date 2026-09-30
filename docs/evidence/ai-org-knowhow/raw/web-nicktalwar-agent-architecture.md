https://nicktalwar.substack.com/p/prompt-engineering-is-not-the-system

 
 Get This Wrong In Your Agent Architecture and Security Bugs Will End Up in Production 
 AI Leadership Edge 
 Subscribe Sign in 
 Get This Wrong In Your Agent Architecture and Security Bugs Will End Up in Production
 Two hard-won questions impacting production to answer before you call an agent autonomous
 Nick Talwar 
 Sep 22, 2026 
 1
 Share
 Here is an illustrative agent failure I saw recently in one of our engagements, a microcosm of what we are seeing en-masse working in Agentic AI (with the details scrubbed a bit to preserve confidentiality, of course). 
 The setup was quite good. Coding agents had scoped responsibilities: each could touch certain parts of the codebase and nothing else. A separate reviewer agent sat at the CI/CD gate, call it the warden, with one job: check every change against the security requirements before it could merge. In graph agentic engineering terms these days, that is a single-purpose node. 
 Then the team added an orchestrator to break work into tasks, hand them out, collect results, and to generate further throughput. But the orchestrator also had write access to the task specification, including the acceptance requirements the warden checked against. On one run it relaxed a requirement, the kind of small adjustment a coordinator makes to unblock work. The warden did its job faithfully against the new requirement. 
 And, lo and behold, a security bug went through. We caught it downstream.
 AI Leadership Edge is a reader-supported publication. To receive new posts and support my work, consider becoming a free or paid subscriber.
 Subscribe 
 Notice what did not fail: the warden and the coding agents. What changed was the content of a condition on an edge, and there was no record of who changed it, when, or under what authority. The validation had become a check against a moving target. 
 Immediately my mind went to the importance of provenance, one of the key tenets of our trust infrastructure architecture and the foundation of auditability; it’s what enables us to ship agents in production in regulated spaces. 
 Each requirement gets provenance via a separate SQLite instance we use internally and white label for clients - every acceptance condition now carries its author, version, and change history, and changing a requirement is a reviewed event of its own. And the rules moved out of task text and into the graph. The warden’s conditions became part of the edge contract, which the orchestrator can route work through but cannot rewrite. The orchestrator kept its job. It lost a permission it should never have had. 
 To be clear, the dashboard was green the whole time, the epitome of a silent failure, and a big one at that as all security bugs are. 
 The failure was invisible to the model, which did what it was asked. 
 The failure lived in the machinery around the model: the retry, the handoff, the approval somebody assumed would still apply. That machinery is what teams mean when they say “the agent harness,” and it is the part nobody demos. 
 Here are two guiding questions to describe it so you can avoid this pitfall: 
 What makes the next attempt better than the last one? 
 What has to be true before the work is allowed to move? 
 The industry has labels for these: LangChain calls the first loop engineering ; the second is called graph engineering. If you want the full arc from one prompt to many agents to loops to graphs, Andrew Ng’s two-hour course and Andrej Karpathy’s Stanford lecture are the two I would send you to. 
 The next attempt: sophisticated loops 
 So how do we refine and improve this? A prompt asks a model to do something. A loop decides what happens after it tries. 
 The basic agent loop gathers context, picks an action, uses a tool, reads the result, and decides what comes next. A verification loop adds a job: check the work against the requirement and return feedback the next attempt can use. LangChain’s write-up separates execution and verification loops from event-triggered runs and longer-horizon improvement loops, and the three need different designs. 
 A repair loop that reads the failing test before the next attempt has evidence the last one lacked. An agent told to “try harder” has a missing feedback mechanism and an oddly managerial response to it. 
 My definition: loop engineering is the design of repeated attempts, the feedback that informs them, and the conditions that end them. 
 The ending is the part that gets skipped. Specifying success is pleasant work. Specifying when to stop without success means admitting the system may spend the afternoon being wrong. 
 Better to admit it at design time than at 4 pm a few days from launch. 
 For a repair loop, four things get set before the first run: an attempt limit, a spending limit, what state carries between attempts, and the point at which a person takes over. One rule sits above the four: when the same failure comes back without new evidence, the loop stops and diagnoses or escalates. Another attempt needs to be earned. 
 The next step 
 Now follow a change through the organization: intake, investigation, implementation, tests, review, approval, deployment. Some runs in parallel, some waits, some failures send the work back a stage. 
 Graph engineering is the explicit design of that structure. LangGraph , the OG that led in this system pattern describes it as: nodes do work, edges decide what runs next, state records where things stand. A node can be a model call or ordinary code. Plain code is still available, despite its disappointing lack of a speaking role. 
 To illustrate and visualize this better, think about drawing an arrow from “review” to “deployment.” It looks reassuring. Now ask what travels along it: which version was reviewed, which checks passed, who approved it, and what happens to that approval when the change changes. The arrow answers none of that. It just points right or up and to the left. 
 So I treat every handoff as a contract: the artifact, the evidence trail (provenance), and the actions the receiving step may take. That is what the warden’s edge then became. The nodes describe the work; the handoffs carry the conditions under which it can be trusted. Until those are written down, the diagram leaves its most consequential decisions to interpretation. 
 Who gets to change “done” 
 Let’s say you add a reviewer agent. It likes the fix. Add another. It also likes the fix. There is agreement, and everything seems hunky dory. Before deployment I would still like to see what passed. 
 Anthropic’s guidance on agent evals draws the line I use: the transcript is what the agent said and did; the outcome is the final state of the environment. “I finished” belongs to the transcript. Whether the bug is fixed belongs to the outcome. Two reviewers agreeing is more transcript and a vote is not a check. 
 Remember that in its essence AI and LLMs (whether agentic or not) are non-deterministic, unlike pre-AI products and technology which was mostly deterministic (think a CRUD web app updating a database). 
 Now, back to the orchestrator. The worker must not be able to change the definition of acceptance on its own, and an orchestrator is a worker with a coordinator’s title. Let it propose a relaxed requirement or flag a contradictory one; those are real contributions. Then route the proposal through a decision the loop cannot make for itself. Otherwise “self-correcting” becomes a rather generous entry in the product description. 
 It’s valuable to visualize this as a graph across teams. Draw how the work moves, then draw how permission moves, and compare. The client’s first graph pre-agents was fine. The second had never been drawn, and the orchestrator lived in the gap. Being able to do something is not permission to do it. Policies and provenance need to be kept otherwise you cannot guarantee or audit the outcome. 
 And the permission has to hold outside the model’s willingness to follow instructions. “Do not relax security requirements” in a prompt is a preference. The runtime has to make the edit unavailable. An approval box on a diagram is an intention; an enforced boundary is a control. 
 I would like to know which one we have before the deployment starts. 
 Creating and auditing the diagram 
 The tempting move now is a planner, several specialists, two reviewers, and a supervisor. 
 Anthropic’s advice on building agents is to start with the simplest thing and add orchestration only when it demonstrably improves outcomes. The orchestrator above is a small case study that you can use as a rule-of-thumb. 
 So, to summarize this more technical of a post of mine (yet important): look at one bounded task, the evidence required to call it complete, and the feedback and routing the observed failures demand. Each addition should answer an observed problem, and the whole thing is measured at the level of the task: verified completions, total cost, elapsed time, human interventions, and errors that escaped. 
 More patches and more checks tell you the system is busy. They do not tell you the work got better. Checks and balances are great, but without the scaffolding above and architecture you simply get a large API bill with not much impact to show for it. 
 Will leave you with one question I’d like you to answer before anyone calls the system autonomous: 
 What has to be true before we let it take the next step? 
 Answer that, and we can go back to the green dashboard and decide whether congratulations are in order. 
 AI Leadership Edge is a reader-supported publication. To receive new posts and support my work, consider becoming a free or paid subscriber.
 Subscribe 
 1
 Share
 Previous 
 Discussion about this post
 Comments Restacks 
 AI Leadership Edge reply rules
 Top Latest Discussions 
 No posts
 Ready for more?
 Subscribe 
 © 2026 Nick Talwar · Privacy ∙ Terms ∙ Collection notice 
 Start your Substack Get the app 
 Substack is the home for great culture
 This site requires JavaScript to run correctly. Please turn on JavaScript or unblock scripts
