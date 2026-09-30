https://www.reddit.com/r/ClaudeAI/comments/1wn44ii/claude_seems_both_stupider_and_more_expensive/
# Claude seems both stupider and more expensive than before
author: u/nickjohnson date: 2026-09-22T08:55:29+00:00

Yesterday I was using my usual workflow of a Fable orchestrator spinning up Opus or Sonnet subagents to do the work. I forbid the orchestrator from writing code itself, but instruct it to review and merge subagent PRs as they come through. Leaving it overnight, it went through my entire weekly fable quota and 75% of my total weekly quota going through ninteen different rounds of revisions with a subagent, fixing and refixing the same bugs in a single PR. I'm certain it was never this dumb in the past - first of all, the Opus subagent would have gotten things right faster, and second the Fable orchestrator would have noticed it wasn't getting anywhere and changed its approach or stopped and asked a human for directions. Further, I'm pretty sure I couldn't have gotten through my quota in ~12 hours with just 3 agents (1 fable) working before.

## comments (20, top-level only via anonymous feed)

[ClaudeAI-mod-bot] (2026-09-22) We are allowing this through to the feed for those who are not yet familiar with the Megathread. To see the latest discussions about this topic, please visit the relevant Megathread here: https://www.reddit.com/r/ClaudeAI/comments/1vt5drr/list_of_latest_discussion_hubs_on_rclaudeai/

[Exciting_Macaroon_64] (2026-09-22) nerfed before 5.5 launch

[ONI-ENJOYER-420] (2026-09-22) I wanna throw up just looking at the way it's writing, i fuckin hate my job jesus

[TriggerHydrant] (2026-09-22) Yeah it fucked up my entire IAP flow and astra fixed it right away, it was almost saying to Claude ‘duh!’ I love it for very specific work but overarching architectures it seems to lose the plot quickly even with my manual work behind it.

[daemon-electricity] (2026-09-22) Astra seems to get shit done a lot faster in general. I still use Claude and Astra to have deferential sessions on tough problems, but yeah, Astra is clearly better right now at just getting shit done fast and pretty well. Both burn through usage pretty quick though.

[haux_haux] (2026-09-22) It is both

[bored123abc] (2026-09-22) Confirmed.

[taskmeister] (2026-09-22) Yes.

[jasonridesabike] (2026-09-22) Similar workflow ate 76% of my weekly usage on max20 in 1 day. Previously I could get through the week

[jakeolvr] (2026-09-22) I had a pretty similar experience on Monday Tuesday, my usage never consumed this quickly and I’m getting less useful output results for the tokens being put in and model being used 🤦🏽‍♂️

[piekwerk] (2026-09-22) Nineteen rounds on one PR reads less like a dumber model and more like a loop with no exit condition. A reviewer that lists issues and a fixer that fixes them will oscillate forever unless something counts rounds. I cap revision cycles at three per PR, enforced in the script that spawns the subagents rather than in instructions, since instructions are soft context and a cap in code is not. Structured verdicts help too: numbered issues the fix has to reference, so a re-flag after a fix or the same test failing two rounds running is machine-detectable. That is the stop signal. The orchestrator then writes a handoff note, what was tried, what failed, current hypothesis, and pings me instead of starting round twenty. The difference between burning 75% of a weekly quota overnight and waking up to a question was just that counter, for me.

[nickjohnson] (2026-09-22) > A reviewer that lists issues and a fixer that fixes them will oscillate forever unless something counts rounds. I mean, it shouldn't - because the PR author ought to be smart enough not to reintroduce the same issues, and the reviewer ought to be smart enough to catch it if they did.

[FrzrLk] (2026-09-22) pro tip: only vibe code with new model right after its launch. I'll never do things with Claude when it's been released more than 1-2 months. When a new model is arriving, the intelligence of current model just seems to be nerfed.

[eucalyptus-d] (2026-09-22) Can’t wait for the frontier Chinese model.

[sisif_] (2026-09-22) Did you say please? This is getting old, humans unwilling to learn how to use their tools, remembering the good old days of 365 days ago. "I forbid it" is just some text lost in a very likely huge context that you couldn't be bothered to learn about. If you do not want it to edit files, remove the Edit tool from tools, add hooks to prevent it from getting creative (by using Bash commands) for instance. Opus does not do things faster, most of the times it doesn't do it cheaper either. Learn how to use the tools you were given, do not expect miracles. Unless anthropic decided to give me the good fable, they are smarter than ever before.

[nickjohnson] (2026-09-22) What? This comment reads like it was written in response to an entirely different post.

[haux_haux] (2026-09-22) Anthrobot

[piekwerk] (2026-09-22) You've got the right mechanism and it's worth spelling out, because "remove the Edit tool" is where most of the work actually is. My orchestrator role gets Edit and Write in permissions.deny, in its own settings file, not in the prompt. Instructions are context a long conversation can bury, a missing tool is a wall. The trap you only hint at: an agent denied Edit will happily try sed -i or echo > file through Bash. I block that with a PreToolUse hook on Bash that exits 2 on write-shaped commands, exit 2 denies the call and shows the model why. Reviewers are the awkward case, they legitimately need Bash for tests and merges, so that role runs an allowlist instead: git diff, git log, the test command, nothing else. This pairs with the round cap I mentioned upthread: the cap ends the loop, the deny rules stop the redrafting at the source.

[sisif_] (2026-09-22) I only mentioned them briefly, because an inquisitive mind will try to understand what i was talking about, while a lazy one would ignore a full strategy being spelled out anyway.

[sisif_] (2026-09-22) lol, some of the pros on this sub downvoted your message. imagine how clueless that guy is to downvote one of the extremely few comments that actually show some knowledge of how things work.