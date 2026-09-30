https://www.reddit.com/r/ClaudeAI/comments/1wu54bp/opus_55_created_me_game_where_you_can_hate_wumpus/
# Opus 5.5 created me game where you can hate Wumpus (Discord Mascot)
author: u/oxmannnn date: 2026-09-30T13:35:08+00:00

It's a Kick the Buddy style ragdoll sandbox. Wumpus stands in a padded room and you get 25 tools: mallet, frying pan, piano drop, knives that stay stuck, a cutter that slices off limbs, chainsaw, bombs, acid that melts him down to the skeleton, and a squeeze tool for his organs. He always gets back up and gives you a teary thumbs up 👍 How Claude built it: - Opus 5.5 was the orchestrator. It wrote a short SPECmd contract: the module APIs plus which worker owns which files. - Sonnet 5.5 workers built it in parallel: the 3D model, the physics engine, blunt + explosive tools, blades, and the gore system. - Every worker wrote its own headless test that plays the game and takes screenshots, then iterated on those shots. - Opus reviewed every screenshot sheet and sent back bugs, e.g. "the camera shows outside the room" or "a severed head turns solid red". - Final check: 180 random tool uses with resets, zero console errors. My part was just feedback: "ears should be inside", "make the skull better", "add acid and a saw". Three.js + Rapier physics, about 15k lines, no build step, and zero asset files. The model, sounds and room are all generated in code. Github Pages: https://winchxyz.github.io/wumpus-torture-simulator/ Open Source repo: https://github.com/winchxyz/wumpus-torture-simulator Happy to answer questions about the workflow! And don't ask about Wumpus, I hate him so much.

## comments (9, top-level only via anonymous feed)

[ClaudeAI-mod-bot] (2026-09-30) You may be interested in joining our new Claude Game Dev subreddit for game devs who use Claude. Check it out here : http://www.reddit.com/r/ClaudeGameDev

[brainExploded99] (2026-09-30) what did wumpus do to you

[RossLDN] (2026-09-30) No.

[DistinctNobody706] (2026-09-30) It has some odd resemblance to Happy Tree Friends.

[Due-Paint-7278] (2026-09-30) this was awful, I feel terribly sick. well done.

[Dojiverse] (2026-09-30) Reminds me of the app “kick the buddy”

[silver_drizzle] (2026-09-30) Did Claude ever protest or refuse regarding the violence?

[kingchessapp] (2026-09-30) wtf is ts 🥀

[Remove_Forward] (2026-09-30) https://preview.redd.it/lipa4764xnsh1.jpeg?width=262&format=pjpg&auto=webp&s=101a3311c7325cf67690af488f0a8c9a91af9e5f Disturbing! But I kinda like it?