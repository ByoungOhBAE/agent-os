https://www.tytarenkoagency.com/blog/four-merge-presses-one-merge-approval-layer

 Fixing the Approval Layer of an AI Agent Fleet | Tytarenko AI Agency 
 Back to Blog 
 I pressed Merge on four pull-request cards in my Telegram bot, one after another. One PR merged. The other three presses vanished: no error toast, no visible failure, nothing on the cards to say the button had already been pressed. The fleet had written the code, reviewed it, survived a cross-vendor skeptic, and then lost three quarters of my approvals at the very last step.
 Nothing was wrong with the code the agents produced that day. The failure lived entirely in the last ten centimetres of the pipeline, the layer where a human says yes. That layer is the part of an agent fleet nobody designs. You spend your effort on prompts, review loops and container isolation, and then the whole system throttles down to whatever your approval surface can actually absorb.
 This is what broke in mine, and what the fixes cost.
 What agent-corp actually is
 agent-corp is my personal autonomous agent fleet. A daemon on a GCP VM polls a GitHub Projects board, picks up a task, and runs it as headless Claude Code inside a Docker container. When the executor is done, a fresh Claude session reviews the diff (a new session, not a continuation of the one that wrote the code), and the executor revises until that reviewer passes. Then an optional cross-vendor skeptic, gpt-5.3-codex run through the Codex CLI, tries to refute the pull request. Codex never writes code in this system. Its only job is to attack a change Claude already approved.
 The last step is me. The daemon sends the ready PR to Telegram, and I press a button.
 Claude builds 
 Claude reviews , in a fresh session
 Codex challenges , cross-vendor, never writing
 I merge , one button in Telegram
 Everything above the last line was working. Both bugs in this article live on that last line.
 Four presses, one merge
 The bot is built on python-telegram-bot, which processes updates strictly one at a time unless you say otherwise. Two defaults stack up to that, both worth knowing by name: the application's update processor is SimpleUpdateProcessor(max_concurrent_updates=1) unless you pass concurrent_updates to the builder, and every handler is registered with block=True unless you pass otherwise (verified in the v22 source; the same holds on v21). My callback handler awaited the entire merge inside the update: gh mergeability checks, the security gate, a deploy-branch decision, board writes. That is minutes, not milliseconds.
 So the first press held the update queue for the whole merge. Presses two, three and four sat behind it. And a callback id does not stay valid for long. Telegram documents no TTL for it, so take this as an observation rather than a spec: a press that waits behind a merge of this length reliably comes back invalid, every time, which puts the window nearer seconds than minutes. By the time the queue reached presses two through four, all three ids were dead.
 That alone would have been survivable. What turned a delay into silent data loss was the order of two lines. The handler answered the callback query, the little toast confirmation, before dispatching the action:
 await query.answer() # raises BadRequest on an expired id
await dispatch(action) # never reached
 An expired id makes query.answer() raise BadRequest: Query is too old and response timeout expired or query id is invalid . That exception escaped to the error handler, and the action behind it never ran. A purely cosmetic failure, a toast that could not be shown, was silently deciding whether a merge happened.
 The fix, and the part that is easy to get wrong
 Three changes, in increasing order of subtlety.
 The ack can never abort the action. The answer is wrapped so that a BadRequest is logged and ignored, and any other exception is logged and ignored too. The rule, written into the docstring so it survives the next refactor: the toast is decoration, the action is not.
 The handler stops holding the queue. Registering the callback handler with block=False makes each press run as its own PTB-tracked task, drained on shutdown, errors still routed to the error handler, instead of a body inside the single update loop. There is a side benefit I did not initially care about and now would not give up: /panic and /pause stay answerable while a merge is running. A frozen kill switch during the one operation you might want to kill is its own bug.
 And then you have to put back the lock you just deleted. This is the part worth stealing. Making a handler non-blocking does not add concurrency. It removes an implicit lock you were relying on without knowing it. The one-at-a-time update queue had been serializing my merges for free. Freed, four presses mean four concurrent merges racing gh, the board and the deploy tracker.
 So the serialization came back explicitly, and only where it actually matters:
 A per-(action, repo, number) claim , so a second press on the same target replies "already running" instead of executing the action twice.
 A fleet-wide merge lock , so concurrent merges queue behind each other rather than racing. A press that has to wait says so on its own card ("queued: another PR is merging right now, I'll get to this one"), because a button that appears to do nothing is exactly the bug I was fixing.
 The claim is released in a finally , always, including on failure. A merge that died on a conflict or a rate limit must stay retryable from the same card.
 The generalizable lesson has nothing to do with Telegram: before you make a handler non-blocking, inventory what the serial path was protecting. In my case it was protecting three external systems from concurrent writes, and I had never written that down anywhere, because nothing had ever made me.
 The other failure: merging one PR breaks the next
 The second problem was structural rather than a bug.
 The fleet's per-PR merge prompts had already been replaced by a daily merge digest : one Telegram message, once a day, listing every PR that is ready to ship (cleanly mergeable, green CI, reviewer-passed) with a single [Merge all N] button and a per-PR hold toggle. The human checkpoint on every diff stays. The per-PR context-switch tax goes.
 A batch button is the obvious place for the lock from the previous section to leak, so to be explicit: it does not. [Merge all] takes the same fleet-wide merge lock a single press takes, once, held for the whole run, and merges its PRs one after another inside it. A per-PR press that lands mid-batch queues behind it and says so on its own card. The batch additionally consumes the digest before its first merge runs, so a second press finds no state and reports a stale card rather than merging the same set twice.
 That works beautifully until two of those PRs touch the same file. Then [Merge all] merges the first one, the second one's base moves under it, and a PR that was green thirty seconds ago is now CONFLICTING. Worse, it is conflicting passively, in a way I only discover later.
 So the digest learned to see the collision before I do.
 At send time, for every repo with two or more eligible PRs, the daemon fetches each PR's changed-file set with one gh pr view agent/ --json files,additions,deletions call per PR, bounded to 100 paths, intersects the sets pairwise within a repo, and annotates the card. The bot speaks Russian. Translated, a line reads:
 ⚠️ #A and #B overlap on 3 files (agent_corp/bot.py, agent_corp/merge_digest.py, tests/…) —
merge order matters. First #A (files ⊂ other), then #B.
 The suggested order is a two-rule heuristic. If one PR's file set is a strict subset of the other's, the subset merges first: the superset will have to absorb the change either way, and it is the one better placed to do it. Otherwise the smaller diff goes first (additions plus deletions, falling back to file count when both line totals are zero), because rebasing a small change onto a big one is cheaper than the reverse. Ties break on the lower issue number, purely so the output is stable.
 What this is not
 It is worth being precise about the scope, because the tempting description of this feature is a much grander one.
 It does not gate task admission. It does not pause the queue, reorder work, or decide that a task should wait because another agent is already in that file. It runs at digest time, which is to say after both PRs exist, after both agents have burned their cycles. It buys a better merge order and an early warning, not fewer wasted agent runs.
 I considered the grander version and did not build it. Real admission control would have to predict which files a task will touch before the code is written, which is either a guess or a whole planning stage of its own. The cheap version captures most of the value at the point where the information is already free and exact: the diffs exist, so just read them.
 The boring part that took the most review cycles
 The overlap logic itself is a set intersection. What actually consumed the review cycles was bounding the output , and that is the part I would have skipped if I had merged my own first draft.
 The annotation count is quadratic in pending PRs per repo. Telegram caps a message at 4096 characters. And a too-long digest does not degrade gracefully: the entire send fails , PR list, buttons, footer and all. An unbounded advisory feature could take down the whole daily digest it was decorating.
 The bounds that ended up shipping:
 Annotation lines capped at 10.
 The rendered overlap section capped at 2000 characters, because a line cap alone is not a character cap. Git paths run hundreds of characters and HTML escaping expands them further, so ten lines of three long paths still overrun the limit.
 Each named path shortened to 48 characters, keeping the tail , since the basename is the informative end.
 Shortening happens on the raw path, before escaping. Cutting already-escaped text can slice an & in half and break Telegram's HTML parse mode, a truncation bug that manifests as a failed send three abstraction layers from the string that caused it.
 Whatever either rule dropped is reported in one summary line, so a truncated digest still sends.
 Every gh read fails open : an error drops that PR from overlap detection rather than dropping the digest. A flaky files read must never cost me the day's merge card.
 Notes are computed once, at send time, and stored with the card, so re-rendering after a hold toggle stays pure and never re-hits gh.
 Three of those bounds came from the cross-vendor skeptic across successive review cycles, not from the first implementation. Whether that kind of finding is signal or noise is worth counting before trusting — small-sample review metrics are how a tripwire stops crying wolf. This is exactly the class of defect an adversarial pass is worth paying for: nothing here is a logic error, every one of them works perfectly on the inputs the author had in mind, and each fails on a real repo with long paths and a busy day.
 What the two bugs have in common
 Neither was a model-quality problem. The executor wrote fine code, the reviewer caught real defects, the skeptic refuted real assumptions. Both failures were in the seam between the fleet and the human, and both had the same shape: an action that appeared to have been taken, but wasn't. 
 A press that produced a card with no change on it. A merge that would quietly break the next PR in the list. In an autonomous system, that shape is the dangerous one, far more dangerous than a loud crash, because the operator's mental model keeps updating as if the action succeeded. You do not go looking for the failure, because from where you sit there wasn't one.
 The corollary is that the approval layer deserves the same engineering seriousness as the execution layer. Mine is a chat bot, which invites treating it as a notification channel with buttons glued on. It isn't. It is the control plane, the only place where fleet output becomes repository state. Every property you would demand of a deploy pipeline applies to it in full: actions are idempotent, concurrent operations are serialized where they touch shared state, failures are visible, and cosmetic errors cannot cancel real work.
 Takeaways
 A cosmetic call must never sit upstream of a real one. Acks, toasts, logging, telemetry: if it can throw, it either goes after the action or gets swallowed. Ordering these two lines wrong cost me three merges.
 Making a handler non-blocking removes a lock. Write down what the serial path was implicitly protecting before you free it, then re-add that protection explicitly and narrowly.
 A double press should say "already running" on the same surface that received it. Silence reads as a dropped input, and the operator's next move is to press again.
 Detect collisions where the information is free. Changed-file sets between open PRs are exact and already computed. Predicting them before the code exists is a research project. Take the cheap 90%.
 Bound anything advisory that rides on a limited channel. An optional annotation that can fail an entire message is not optional. It is a new failure mode for the thing it was decorating.
 Fail open on decoration, fail loud on state. A flaky metadata read should cost you an annotation, never the card.
 FAQ
 Does the file-overlap check stop conflicting tasks from starting?
 No. It runs when the daily merge digest is assembled, so both PRs already exist and both agents have already run. It tells me which order to merge in and which pairs to look at, nothing more. Preventing the collision earlier would require predicting a task's file set before the code is written, which I judged not worth the machinery.
 Why does Claude review code that Claude wrote?
 Because it is a fresh session, not a continuation. The writing session has normalized every decision it made along the way. A new session reads the diff without that history and reliably catches things the writer had stopped seeing. The cross-vendor skeptic then attacks what survives: a different vendor, different training, different blind spots.
 What does gpt-5.3-codex do in this system?
 It is the final adversarial reviewer only, run through the Codex CLI after Claude has approved a PR, and it tries to refute the change. It does not write code here. The bounds on the overlap annotations in this article are a concrete example of what that pass earns: three separate limits, none of them a logic bug, all of them real failures on real inputs.
 Why run the approval layer through Telegram at all?
 Because the alternative is a dashboard I have to remember to open. The merge decision is the one place I genuinely want a human, and a phone notification with a button is the lowest-friction surface that still forces a deliberate act. The lesson of this article is that "lowest friction" does not mean "least engineering". The bot needed a lock, a claim table and an ack discipline before it was trustworthy.
 What would I build first if I were starting an agent fleet today?
 The approval surface, and I would build it as infrastructure. Execution isolation and review separation are well understood and mostly a matter of wiring existing tools together. The layer where you say yes is bespoke to your workflow, it is where every automated stage cashes out, and it is the one nobody warns you about until it eats three of your four button presses.
 Related reading
 Optimizing Agent Role Prompts Offline: What SkillOpt Automates, and the Manual Loop My Fleet Already Runs 
 Hardening Docker CLI Shell-Outs for a More Resilient Autonomous AI Agent Fleet 
 Don't Install GitHub Spec Kit — Steal These Three Ideas Instead 
 Two Green Pull Requests, One Red Main: The Stale Merge Ref 
 our showcase of shipped work 
 the Tic-Tac-Toe Unity build in our showcase 
 Tags 
 # ai agents # agent-corp # telegram bot # concurrency # code review # git # devops # automation 
 M
 Maksym Tytarenko
 AI & SaaS Development Expert at Tytarenko AI Agency
 Related Articles
 Automation The Sweep Ran Every Hour. Fifty Closed Tasks Still Weren't Done.
 My agent fleet's task board had an hourly sweep that moved closed issues to Done, and 50 closed issues still weren't Done. One board read showed why: every stuck card sat in a status the sweep never checked. The fix widened one list, cut the sweep's API cost by 99%, and taught it which cards it must report instead of touching.
 9 min read Automation Two Runner Listeners, One Work Directory: A Self-Hosted CI Post-Mortem
 My agent fleet's CI started failing 3 to 18 seconds into every job. The cause was two GitHub Actions runner listeners sharing one work directory, left behind by a runner self-update and KillMode=process. The diagnosis, and the ExecStartPre fix.
 11 min read Automation Flagging Tests That Assert Nothing, When All You Can See Is the Diff
 My merge-card scanner caught assertions being removed but never noticed a new test that had none. Closing that gap meant giving up on syntax trees, teaching the scanner to know when it is looking at a cropped view of a file, and measuring the false-positive rate on thirty merged pull requests before the line ever reached a human.
 10 min read 
 Ready to Build Your AI-Powered Solution?
 Let's discuss how we can help you leverage AI to transform your business.
 Get in Touch 
 