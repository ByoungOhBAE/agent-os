https://dev.to/hiroki-ii-ai/four-chat-sessions-are-not-an-openclaw-team-2kp9

 
 Four Chat Sessions Are Not an OpenClaw Team - DEV Community 
 Add reaction
 Like
 Unicorn
 Exploding Head
 Raised Hands
 Fire
 Jump to Comments
 Save
 Boost
 Pick as gem 
 Copy link 
 Copied to Clipboard
 Share to X
 Share to LinkedIn
 Share to Facebook
 Share to Mastodon
 Share Post via... 
 Report Abuse 
 You already have an agent that does useful work. OpenClaw v2026.9.5 can add one specialist, or a small team: a chief of staff, a researcher, a writer, and a reviewer. In the web UI, New agent waits for your approval before it creates them. Release notes · Multi-agent routing 
 Four names are not a reason to leave the agent you already use. Split the work only when a research brief, a draft, and a review can come back as three checkable artifacts. Four sessions in the sidebar are not a division of labor.
 The team is added beside main
 openclaw agents team create has one bundled preset, team . It creates coordinator , researcher , writer , and reviewer , each with its own workspace and a completed identity. A new role workspace skips the identity ceremony and does not create BOOTSTRAP.md . Existing files stay. The bundled roles do not change your skills. CLI Agents 
 This does not replace the agent you already run. If any resulting id exists, the command adds nobody. An existing main stays. Team creation points the system agent at the coordinator only when agents.defaults.systemAgent.agentId is still unset.
 The chief of staff is the only point of contact. The three specialists have an empty allowAgents list. Their operating programs tell them to return the result, not to delegate again and not to contact one another. The coordinator's delegationMode is prefer . That setting is prompt guidance. It does not enforce delegation, and it does not change tool policy. Sub-agent tool reference 
 The delegation wiring currently lives in config. The docs say the role packages will carry it only after separate Claw profile support lands.
 The web path and the CLI path are not the same door. Control UI waits for approval. --non-interactive takes the direct path, and the official examples use that flag. "Created only after approval" describes the web path, not every entry point.
 This team is also not four agents talking in one room. v2026.9.5 has a separate, experimental room-team feature for a limited discussion. Extra rounds spend more runs, and the active budget does not survive a restart. A specialist team is accepted by the files it returns.
 Try it on one real decision
 After a product update, you need to decide whether the publishing checklist changes. Do not drop that sentence into four sessions. Ask the chief of staff to split it into three artifacts, with one owner each.
 The researcher returns a cited brief. The program says to prefer primary sources, separate observation, inference, and unknowns, and never present an unread source as read. The return includes a path or the full brief, source links, the conclusion, the checks performed, and the remaining uncertainty. Researcher contract 
 The writer turns that brief into a draft. Clarity belongs to the writer. Publication belongs to you. Missing evidence stays marked. Quotes, numbers, and approvals are not invented. Work that is still waiting for you is labeled a draft. Writer contract 
 The reviewer checks the draft against the requirements and the evidence. Review authority does not authorize editing the artifact. Each finding names a location, the requirement it breaks, the evidence or a repeatable check, and a concrete repair. An unrun check is not reported as passed. Reviewer contract 
 Run those assignments in parallel only when their inputs and outputs do not collide. Do not let the writer hunt for a second set of facts before the brief exists. The official lane guidance is blunt: a coordinator without lane contracts just coordinates chaos. Parallel specialist lanes 
 Every task from the chief of staff needs an objective, inputs, an artifact location, a verification method, limits, and a stop condition. A promise that the work is done is not a result. Chief of staff contract These programs live in AGENTS.md , so they still apply in a spawned session that does not load SOUL.md or IDENTITY.md .
 What counts as a real split
 All four have to be true.
 The assignment names where the artifact goes, how to verify it, and when to stop.
 The specialist returns a path or the complete artifact, sources, checks, and uncertainty. Spoken completion does not count.
 The review names the requirement, the evidence, and the repair. The draft is still the draft. The reviewer does not lower the bar until the piece happens to pass.
 The specialists do not loop on each other. Follow-ups go back through the chief of staff.
 prefer is not a substitute for those files.
 Leave a live debugging thread, an unsaved half-finished edit, and any task that depends on private main-session memory on the single agent. The role programs say personal memory stays in the human's main session. A delegated task receives only the context it needs and must not read that private memory. If you only want four personalities in a conversation, this preset is the wrong tool.
 Creating the team and allowing an external action are different approvals. The role programs require human approval, for that action and that scope, before an outside message, publication, purchase, deletion, or production change. A brief handed back inside the team is not permission to publish.
 If you already have one agent, do not switch because the version number changed. Keep main . Try one job that can become a brief, a draft, and a review. The split holds when those three files line up.
 Create template
 Templates let you quickly answer FAQs or store snippets for re-use.
 Submit 
 Preview 
 Dismiss 
 Are you sure you want to hide this comment? It will become hidden in your post, but will still be visible via the comment's permalink .
 Hide child comments as well
 Confirm
 For further actions, you may consider blocking this person and/or reporting abuse 
 HIROKI II
 Follow 
 Joined
 Apr 23, 2026 
 OpenAI's Dots Take Over Your Desktop, Anthropic's $2T IPO Math, and AMD's $8.2B World-Model Bet
 # ai 
 # agents 
 # business 
 # hardware 
 Maker vs Checker: Keep Your OpenClaw Setup Lean with a Single Reviewer
 # ai 
 # devtools 
 # architecture 
 # programming 
 OpenAI Halts Frontier Training Again, Nvidia's $235B Buyback, and MiniMax's Mystery Model
 # ai 
 # agents 
 # security 
 # robotics 
 We're a place where coders share, stay up-to-date and grow their careers.
 Log in
 Create account
