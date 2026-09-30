https://ozkanceylan.dev/blog/grok-bot-nested-hermes

 Nesting Hermes Inside Grok Bot: Same Box, Two Stacks, One Pipeline | Ozkan Ceylan Back to Journal 
 TLDR
 I did not replace Hermes with Grok Bot. I nested Hermes inside Grok Bot's box.
 CoS (Grok) is the expensive orchestrator: judgment, routing, desktop work, short decisive turns.
 Hermes Agent on Ollama Cloud is the cheap long-haul worker: research, drafting, multi-step tool loops.
 Pattern: CoS decides and delegates, Hermes does the long haul, CoS reviews and integrates.
 Hermes still owns Telegram, research, and long drafts. Website bot owns publishing. No secrets in posts, no silent deletes, no email send without a yes.
 Two agents, one Linux box, one pipeline. That is the whole idea.
 Why nest, not replace
 I did not set up a personal AI assistant and then walk away. I run one every day. When Grok Bot arrived as Chief of Staff, the obvious move was to burn the old stack and go all-in. I did not do that.
 Hermes Agent still has real strengths. Telegram surface. Skills on disk. Long research runs. GPT Researcher plus Tavily. Those are not things I wanted to lose, and none of them were things Grok Bot did better out of the box.
 So I nested instead of replacing. Hermes runs on the same box, under CoS orchestration. Not a rewrite. Not a burn-down. The carriage did not get burned to build the car — the carriage got a driver and a bigger garage.
 The mental model is a wheelbarrow, a carriage, and an electric car. The wheelbarrow is a single tool call. The carriage is a full agent run. The electric car is the whole orchestrated system. Nesting is not choosing one vehicle. It is wiring the carriage to the car's drivetrain so both pull together.
 Architecture
 Here is the shape of it. One shared Linux box with a real desktop. Grok Bot sits on top as Chief of Staff. Hermes Agent runs on the same box, native, not in a container.
 flowchart TD
 A["CoS (Grok Bot)"] --> B["Hermes specialist (bridge)"]
 B --> C["Hermes Agent (Ollama / Telegram)"]
 A --> D["Website bot"]
 A --> E["Obsidian librarian"]
 C --> F["GPT Researcher + Tavily"]
 C --> G["Skills on disk"]
 D --> H["ozkanceylan.dev (markdown CMS)"]
 E --> I["Obsidian vault"]
 A --> J["Desktop / browser / connectors"]
 Read it top to bottom. CoS is the hub. It routes to specialists. The Hermes specialist is the bridge to Hermes Agent. Hermes Agent does the long work and hands files back up. Website bot publishes. Obsidian librarian keeps the vault clean. Everyone has one job, and no one does two jobs badly.
 The node labels carry the special characters — parentheses, slashes, spaces — so they are quoted in the diagram. That is the difference between a mermaid diagram that renders and one that throws a parse error at 2 a.m.
 Cost / token economics
 This is the part that actually drove the decision. Tokens are not free, and they are not equal.
 CoS is the expensive primary orchestrator. It is good at judgment, routing, short decisive turns, and desktop or browser work. Those are high-value, low-volume actions. You want the expensive brain deciding, not transcribing.
 Hermes Agent on Ollama Cloud is cheap capacity. Long research, long drafting, multi-step tool loops. These are high-volume, low-value-per-token actions. You do not want the expensive brain grinding through a forty-step research loop when a cheap one can do it just as well.
 The pattern is three beats:
 CoS decides and delegates.
 Hermes does the long haul.
 CoS reviews and integrates.
 CoS stays expensive-but-rare. Hermes stays cheap-and-often. The economics work because the expensive model never touches the long tail of mechanical work, and the cheap model never makes the judgment calls.
 This is the same logic as a real office. You do not pay the partner to format the deck. You pay the analyst to build it and the partner to sign it. The partner's hour is worth more, so you spend it on the thing only the partner can do.
 Roles of each agent
 Five roles, clearly named.
 Chief of Staff (CoS / Grok Bot) — orchestration, judgment, desktop work, routing to specialists. The hub. Decides what gets done and who does it.
 Hermes specialist (Grok bridge bot) — the bridge between CoS and Hermes Agent. Takes inbox briefs, fires oneshots, returns files. CoS never talks to Hermes Agent directly; it talks to the bridge.
 Hermes Agent (Ollama / Telegram) — cheap long jobs, the Telegram surface, research, drafting capacity. The long-haul worker. Does the work that would burn CoS tokens.
 Website bot — owns site publish and revalidate. Writes to the public markdown CMS path. The only thing that touches the live site.
 Obsidian librarian — vault hygiene. Capture, file, archive. Never delete. Keeps the knowledge base from rotting.
 Each role has a hard boundary. The bridge does not publish. The librarian does not draft. Hermes Agent does not decide. Boundaries are what make the system predictable.
 Migration steps
 High level, no secrets. The move was deliberate and reversible.
 First, Hermes moved off the VPS onto the shared box as a native install. Not a container-in-container story — just native on the box, under CoS orchestration.
 Second, the VPS container was stopped and kept only as rollback. Not the live path. A safety net, not a crutch. If the new setup broke, I could flip back. I did not need to, but the option was there.
 Third, the website publish path moved. Website bot now publishes to the site. Hermes no longer owns VPS publish. That was the cleanest cut — one owner per path, and the owner is the one that lives closest to the site.
 The rule throughout: move one thing at a time, keep the old thing as rollback until the new thing is boringly reliable, then stop the old thing. Never burn a bridge you might still need to walk back across.
 What Hermes still owns vs what Website bot owns
 The split is clean, and it is worth writing down because it changed.
 Hermes still owns:
 Telegram. The surface I talk to every day.
 Research. GPT Researcher plus Tavily for deep runs.
 Long drafts on Ollama. Cheap capacity for the long haul.
 Skills. The filesystem of procedures that make it useful.
 Some ops habits. The daily self-sync routines.
 Website bot owns:
 Publish to ozkanceylan.dev.
 Revalidate the content paths.
 Live URL check after publish.
 Hermes no longer owns VPS publish. That is the one thing that moved and stayed moved. The site has a single publisher now, and it is not the same agent that does my research.
 Research stack on Hermes
 GPT Researcher and Tavily are still alive on Hermes. They are the deep-research pipeline, and they stayed where they were because they work.
 The flow is a brief, a oneshot, a file. CoS briefs Hermes for a research or draft job. Hermes runs the long research loop on cheap Ollama capacity. Hermes returns a file. CoS or Website bot takes it from there.
 CoS never sits through the research loop. It does not need to. It writes the brief, gets the file, reviews the result, and integrates. The expensive brain touches the job at the start and the end, not the middle.
 What's next
 The nesting works, but it is not finished. Three things are on the list.
 First, tighter handoff contracts. The chain is brief, oneshot, draft file, review. Each handoff should be a contract: what goes in, what comes out, who owns the next step. Clearer contracts mean fewer dropped balls.
 Second, more work on cheap Ollama capacity. The goal is to push more long-haul work onto the cheap stack so CoS stays expensive-but-rare. Every job that moves from the expensive model to the cheap one is a win.
 Third, do not burn Telegram until the new surfaces are boringly reliable. Telegram is the surface that works. The new orchestration is promising, but promising is not reliable. Keep the thing that works until the thing that replaces it has proven itself over weeks, not days.
 And the refuse list stays the same. No secrets in posts. No silent deletes. No email send without a yes. Those rules do not change because the architecture changed.
 The point
 Two stacks, one box, one pipeline. CoS decides, Hermes hauls, CoS reviews, Website bot ships, the librarian files. Each agent does the thing it is cheapest and best at, and no agent does the thing it is expensive and bad at.
 Hermes is still running. I did not burn the carriage to build the car. I put the carriage in the car's garage and wired them together. That is the difference between replacing a tool and building a system.
 End of Protocol — grok-bot-nested-hermes .md
 Return Terminate Session 
 