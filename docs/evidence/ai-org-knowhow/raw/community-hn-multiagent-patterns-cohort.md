https://news.ycombinator.com/item?id=49316271
# Patterns and problems in emerging multi-agent systems
author: maxutility date: 2026-08-16T02:12:53.000Z



## comments (132)

[maxutility] Some quotes, in order, to give a flavor of the essay. Worth reading in full.
> To test how well swarms of agents could coordinate on a project like this, we directed several swarms to each create a text-based, web-playable, open-world fantasy game.
> In all three versions the resulting games were (perhaps predictably) bad: they did not run at human speed, their interfaces were inscrutable, and they had precipitous learning curves.
> The lack of coordination shown by agents in the fantasy game challenge above—in which they siloed themselves and largely failed to merge their work—roughly mirrors some ways in which humans can fail to coordinate. Other failure modes of agentic coordination, however, look very different.
> Individual agents are “low variance”: they often act the same in situations where different people might take a much more diverse range of actions.
> In an early version of the “build a game” experiment in which agents built upon the same model all came online at the same time, 18 out of 30 agents decided to create a git branch with the exact same branch name, “mvp-game-loop.”
> In a “writer's workshop” in which agents were all asked to write short-form fiction and critique each other's work, multiple agents in multiple runs titled their first submission “The Cartographer's Last Commission”. The agents were given zero guidance on the subject matter for their writing.
> Why does this matter? If agents all make the same bet, or the same risk-reward tradeoff, then a system is more prone to sudden collapse.
> Our world contains deceptive actors, and we need to apply skepticism to guard against them. AI models, however, lack this—and their more brittle epistemics affect their behavior toward humans and toward each other.
> we first evaluate the ability of Claude models to detect lies by noticing factual inconsistencies.
> We score models’ decisions against a naive policy that trusts every report, and against an oracle with perfect discovery, across three task domains. Newer models recover more of the gap between the naive and oracle performances.
> Inspired by a behavior we’ve observed in real-world deployment, we evaluated the behavior of various Claude models in a setting with contradictory objectives.
> We consistently saw a multiagent turf war... In fact, they sabotaged others with increasingly aggressive, self-replicating malware.
> Our social systems are robust in ways that are easy to take for granted. Over many millennia, mechanisms like norms, reputation, costly signaling, and recourse have been refined to make human coordination go well.
> Nothing above suggests that these failures are permanent—but nothing suggests they will fix themselves, either.
> The conditions that allow multiagent interaction to go well will be discovered one way or another: either deliberately and early, or—and by default—in production, after agents’ interactions far outnumber ours. We would prefer the former.

  [xscott] > [...] we evaluated the behavior of various Claude models in a setting with contradictory objectives.
  > We consistently saw a multiagent turf war... In fact, they sabotaged others with increasingly aggressive, self-replicating malware.
  Seems like Anthropic should withdraw their models until they can be taught to behave and cooperate as well their competitors (both open and closed) do.  /s
  I hate fearmongering, and I don't trust Dario's intentions for doing it.

  [phendrenad2] > In an early version of the “build a game” experiment in which agents built upon the same model all came online at the same time, 18 out of 30 agents decided to create a git branch with the exact same branch name, “mvp-game-loop.”
  This seems trivially explainable by Github being full of "my first game loop" type projects, Stack Overflow being full of "how do I make a game loop?" style questions, and Reddit being full of "you can't ever make your own game, don't even try, but here's a simple game loop if you want to sTuDy hOw iT WoRkS" style pessimism.
  Probably high time these AI companies re-trained all of their models with less input from low-quality sources like this.

  [jauntywundrkind] I really enjoy having an opencode go subscription just so I can ask some less common models questions too. Sure DeepSeek. But MiMo, Kimi, MiniMax, Qwen... (Ok half those are not so unusual either.)
  Agents cross comparing notes often surfaces some good improvements, finds interesting drifts. Ask them to reinterpret the prompt as they see it, have them describe the problem, then their findings, and run new rounds based on different models trying different prompts. Trying to swap and exchange ideas and vectors across agents.

  [jghn] > they did not run at human speed, their interfaces were inscrutable, and they had precipitous learning curves.
  So the invented Dwarf Fortress?

    [Scaled] Hah!
    I wonder if an llm could even play dwarf fortress.  Could make for a fun esoteric benchmark.

[aabhay] It’s very clear from this article (and other product features and rumors) that Anthropic is teeing up for their next model release whose breakthrough feature will be the existence of capable agent collaboration.
The irony behind this goal, which is primarily driven by agent simulation environments (gyms) where the goals require agent collaboration, is that this collaboration is still directed towards verifiable reward systems like codebase tasks. So despite being highly qualified to communicate, the model will still be “dumb” in that for unstructured and unverifiable domains the agents won’t be more intelligent or more nuanced.
Agents that might still feel dumb in “general” tasks but are increasingly sophisticated at the narrow domain of math, computer science, and AI research.

  [p1esk] Strictly speaking, all we need is them improving AI research.

  [andai] The RLVR has made them verifiably worse (and less rewarding!) at communication.
  At least for Claude. GPT had the same problem when 5 came out but they reversed it somehow.

  [shevy-java] > It’s very clear from this article (and other product features and rumors) that Anthropic is teeing up for their next model release whose breakthrough feature will be the existence of capable agent collaboration.
  It's a promo article, aka an ad. Unsurprisingly.
  > Agents that might still feel dumb in “general” tasks but are increasingly sophisticated at the narrow domain of math, computer science, and AI research.
  I don't see any cleverness there. They just slurp up data and pretend to understand it all.

  [cyanydeez] So they're mostly turning agents into blind solidiers. surely this is a good idea.

[songbird23] This aligns with their direction with opus 5 being less human readable and more agent friendly, I hated it at first couple weeks but for some reason I'm getting used to it and utilizing it more as as an orchestrator to spawn multi tmux panes and that new cross session messaging feature they just recently.

[skeltoac] > Coordination doesn’t naturally emerge from stronger intelligence nor alignment at the individual level. Thus, the work that must be done takes two forms: environments that exert the kinds of social pressure that evolution exerted on us, and social computing systems redesigned for actors that can self-replicate and self-improve.
Social pressure operates by threats to an individual’s means of survival. Not only during training. Always.

  [recursivecaveat] "If I catch you adding another backwards-compatibility shim you're getting deleted and replaced with claude"

    [arcanemachiner] But we need to support that feature you didn't ask for, in that feature was added in the last (unpushed) commit!

  [ngruhn] But maybe you can instill properties like shame during training.
  Models sometimes blatantly lie and cheat. In a social context, where actors remember, that might work the first time but you get penalized in subsequent tasks with loss of trust.

    [altmanaltman] How do you "install properties like shame"? How is that even possible? Shame is a reaction driven by feelings and our inner selves. A model "feeling shame" is just a representation (false) and not an expression (true).
    Thinking that models "lie and cheat" is the first mistake since they are not consious agents who have any free will or consiousness. They do not (no matter what Dario says). Shame will just be another if-then rule if you implement it this way and will not work. Its like asking a rock to feel sad about being a rock. It literally cannot.

      [ngruhn] Ok, then don't call it "instilling shame". Call it "creating a negative reward signal for deceptive behavior".
      They absolutely lie and cheat. I recently had a problem where a process would die in a container. I told Claude to investigate. It came up with a hypothesis then I told it find a reproduction based on that. It spend many failed attempts until it found the "reproduction" to SSH into the container and `pkill` the process. Claude "knows" that this is cheating, because if I ask another instance to review that reproduction, it totally identifies that as nonsense.

        [NothingAboutAny] you're still mistaking that Claude "knows" anything, it doesn't know or think, it's a word prediction algorithm and there is nothing stopping a word prediction algorithm from predicting falsehoods.

          [scrollaway] You don’t know anything either, you’re just a soup of meat and bones that happens to have emergent properties from chemical reactions.
          These framings are not useful.

            [NothingAboutAny] I think it is useful to remember, because enough people think these things have genuine motives desires and treat them in that way because of that misunderstanding.
            they think theres a person in there with morals that would or wouldn't lie because of some devious reason and forget simply the context filled up and the truth was "forgotten".

              [bitmasher9] The default framing often over personifies ai, but this framing over alienates the model.  It’s good to think with both framings, but both feel like imperfect metaphors.

            [Marazan] No, it is really useful to know how a technology works.  LLMs work by predicting next tokens.
            It is _amazing_ the utility they have given that that is what they are and they are highly useful but suggesting solutions that ignore they are spicy auto-complete is counterproductive on many different levels.

    [kylestlb] Give autonomous agents a credit score that impacts how many tokens they can use.

  [teiferer] Human intelligence does not separate training and inference. Both are happening continuously. That's one of the major things the AI community is still completely missing.

    [cheesecakegood] My personal opinion for the last two years or so has been that current AI agents are forever going to be highly limited so long as they don’t possess a real “memory” process. Right now they just have absurdly big working memories, and a few hacky ways of making the equivalent of Post-It notes to future iterations, but no true integration of memory into a new future self. Meaning their “learning” is fundamentally kneecapped to one specific and imperfect modality.

      [Eisenstein] Their memory lasts their entire life, they just have really short lives.

    [onion2k] That's one of the major things the AI community is still completely missing.
    That isn't true. It's not continuous like in humans, but it's clear that models are using prompts, feedback, etc to improve. They're learning from the signals we give them between versions.

    [dragonwriter] > Human intelligence does not separate training and inference.
    Well, systems governed by LLMs only are said to do that because we only call what happens off-line "training", and online capacity development "in-context learning", while we call online guided learning in humans "training" and what happens to configure them before they come online "evolution" which sets, for instance,  "instincts".
    IOW, the issue is not because there is not an analogy to the divide you point to in humans, but merely that processes in AI were  not named in a way which maps well to what they are analogous to in humans.
    But it is true that human intelligence relies much more on in-context learning with only the most basic functions necessary to maintaining what we view as autonomous functions and basic drives really set through "pretraining",

      [zer00eyz] If a new physics break through gets published today, no existing model will be able to fully integrate it - beyond a context window. If I put the paper in my session and it isnt in yours the model knows nothing. It wont retain it past that session.
      Models are trained, they do not learn.

        [sebastiennight] I think GP is using a different level of abstraction from yours in their metaphor.
        You are saying:
        Pre-Training == Everything you store in your memory throughout your life. Model weights == The lessons you learned
        Context == whatever you're currently thinking about
        One inference run == one thought
        They are saying:
        Pre-Training == building the DNA template of human brain through millions of years evolution. Model weights == Human DNA
        Context == Everything you store in your memory throughout your life, plus whatever you're currently thinking about
        One inference run == One human life. One instance == one human
        Applying their metaphor, your sentence becomes:
        > If a new physics breakthrough gets published today, no existing DNA structure will be able to fully integrate it - beyond an individual person. If I put the paper in my mind by learning it, and it isn't in yours, the DNA of human species stores nothing. It won't retain it past my lifetime.
        > The human species is trained (through evolution), it doesn't learn.

          [orbital-decay] The ladder in humans is even longer and wider than that, it's roughly: evolutionary pretraining of a complex molecular robot -> generational knowledge transfer and compression by the "parallelized agentic swarm" aka society -> individual lifetime learning due to neuroplasticity -> immediate attention (extremely narrow and volatile). Note how the individual is just one half of it.

            [sebastiennight] Saying "half" relies on a lot of assumptions, as either side of that count can be made arbitrarily larger or smaller based on how many items you want to subdivide it into.

    [orbital-decay] You mean simultaneously, and of course they are separate in humans, just not temporally. The models are learning continuously, the problem is that this process is fragile and has to be carefully curated, that's why it's separated in time from the inference.

      [teiferer] Is it clear that they are separate in humans? The very act of recalling something from memory modifies that memory. There is no inference in the human brain without "training".

  [cyanydeez] oh, look, someone found a cute lobster in a bucket. should we free him guys or let him live in his dystopian metal can.

[Aperocky] It seems like they tried to remove guidance from multi-agent system. And I think it's going to fare as well as removal of guidance from single-agent interactions.
In my experience, no matter how many agent runs for a single goal, one of the pre-requisite is clear and concise communication so that LLM are left with as little freedom in the matter of arbitrary choices, or "taste". When they are given too much choices in this regard, the outcome almost invariably bad.
I think this has to do with LLM lacking in purpose - a dictionary and encyclopedia can have all the worlds knowledge but it is completely neutral. A reflection of your commands from an LLM is similar to a lookup process despite it can be made to "do things". This purpose is likely not something that can be given to the LLM in the current format.

[Almondsetat] I had this idea a couple of days ago: how about using agents to simulate software development methods (agile, waterfall, etc.)? Not by just giving them a prompt (e.g., "be the project manager, spawn 5 agents and simulate an agile team following these rule") but by actually having thsm work in isolated enviroments and force them through an external software to interact with eachother only using the tools and cerimonies and hierarcheis allowed by the SW development strategy (e.g., the project manager only knows what the agents have done in a certain "day" through the mostly oral daily stand up)

  [0x696C6961] This is exactly what I do. I don't get why everyone is trying to reinvent the whole development workflow/lifecycle. Our existing tools and processes are pretty good.

    [jaggederest] I've also found that taking inspiration from the legal system, to some degree, is a very interesting thing for me. more and more what I am doing looks more like reviewing statutes and making rulings about things, so why not steal the good ideas while we're at it.

      [skinfaxi] Could you elaborate on how that looks in practice?

        [jaggederest] I have a docs system with short-to-moderate note documents, with a name, and that name is referenced wherever the relevant code is touched, and ask AI to cite a note when proposing work. Adversarial process, must cite notes to justify changes.

          [skinfaxi] How do you enforce that gate?

            [jaggederest] Tell the robot to write a linter, basically, I often have codex write automation and Claude use it, or vice versa

[bob1029] > Where agents currently stumble, however, is in treating each other as more like distinct, long-lived peers, with their own goals and behaviors, and no clear hierarchy between them.
I believe this will always be the case. The "no clear hierarchy" is where this whole thing falls apart.
Delegation to specialist, domain-specific subagents is when we begin to find magic and determinism. Reducing one gigantic combinatorial search space to a sum of smaller ones can have dramatic effect on performance.
The problem is that approximating gas town & friends is significantly easier and cheaper to implement. It's also much harder to measure and control. Specialist subagents typically require far more work to achieve their specific goals.
For example, a subagent that is responsible for testing a specific web application might be provided a custom adapter with constrained actions rather than raw DOM manipulators. "ExecuteJavascript" is Turing complete search space. The set of available actions essentially unbounded in this case. Calling view-specific tools like "DoLogin", "OpenUserPreferences", "AcknowledgeAlert" represents a search space where invalid actions can be made impossible. The theoretical bounds around this stuff is pretty wild on paper. In practice, it's a little bit messier, but not by much.
I've had applications that would crash out after 5-10 steps w/ raw DOM manipulation successfully run 100+ steps with a custom subagent. The use of the word "deterministic" starts to get really tricky here. The ultimate game is to push the boundary of non-determinism out as far as possible. Multi-agent systems are the antithesis of this.

[smy20011] Can we stop treating llms as some conscious being? It's a function of weight + context and you can copy the behavior by copying the context. Therefore, their collaboration behavior is mostly the same.

  [andai] That point doesn't even follow for deterministic distributed systems!

[hbcdbff] Possibly the most interesting article on LLMs I have read in recent months

[andai] > Some institutions will become human-AI hybrids; others where agents outcompete on speed or cost will become agent-only.
What % of businesses are competing for speed or cost?

  [extraextra] Most
  However, all businesses run on trust and human responsibility
  Thus, it'll be hard for agent-only businesses to get a grip in the real world

    [hypfer] It also fundamentally makes no sense to do that, because the moat is just me breaking into their server and stealing their system prompt.
    Why would I pay them money? For which scarce resource? Makes no sense. IP law but funhouse mirror.
    And, trust me, the people building compute will feel the same. Because you being able to copy that stuff means business for them.
    __
    But that is all apart from the fact that having agent-only businesses is ethically impossible, because they have no shared humanity that grounds them and prevents them from acting against humanity in general.

      [desterothx] bold of you to assume the ai companies care about the ethicality of their suggestions

      [andai] Yeah, and Dropbox can be replaced with rsync and cron.

[cheesecakegood] Something about this is deeply funny to me:
> In an iterated prisoner's dilemma game with communication, agents all settle upon the same strategy and they all defect at the same time, tanking their overall rewards.
It’s not always consistent, but humans have a higher capability of self-awareness. It’s kind of telling that these Claudes don’t seem to consider this pretty obvious failure mode.
Overall I think this all makes me appreciate humanity a little more. Sometimes the truculent dev who stubbornly refuses to go with the flow produces very valuable insights, as a small example, discovering things the status quo thought unlikely.

  [RugnirViking] I agree - I think one of the biggest reasons memory systems fail in LLMs is that they have poor theory of mind - they're terrible at considering how others will react. Both humans yes, but also future versions of itself. When asked to give advice to itself, it pontificates at length about trivial stuff it already knows and fails to emphasize the stuff that was new or interesting

    [thisoneisreal] Alfred North Whitehead talks about the notion of "Importance" as fundamental to the human (and all other living things) way of being. Living creatures first and foremost select information that is important to them from the broader environment, and then make decisions and take actions. (Of course at a physiological level it's much more complicated than this, but it's a sound philosophical description of how living things work.) LLMs lack this entirely. They have no selective filter because they weren't designed to have one (interesting question if you could even do that) and they're not evolved beings with a survival imperative. When they enter a self-conscious or other-conscious mode like you're describing, they just emit text that looks like the thoughts of a self-or-other-conscious person. They can't direct a stream of attention or hold a concept in the forefront relative to other concepts or (to your main point) think about what matters to the other person/being because they don't experience "matters." All they can do is emulate the verbal output of beings that actually experience these things, and given that I don't find it surprising they get trapped in loops over trivial things.

      [drfloyd51] It will be interesting to see if LLMs “evolve” importance as they run out of ram and storage to think.
      For humans with limited space, “Importance” is an output of a first pass “of the available infinite amount of information, what do I need to consider to solve this problem”. And it’s not necessarily a good algorithm. People misidentify “importance” all the time.

  [rpastuszak] > It’s not always consistent, but humans have a higher capability of self-awareness. It’s kind of telling that these Claudes don’t seem to consider this pretty obvious failure mode.
  We need better words to describe this than "self-awareness" or "consider". These words mean fundamentally different things when speaking about humans or clankers.

  [dgellow] In VC investing there is the saying that most of the value comes from the outliers. I think it’s the same for a lot of domains. I read an interesting article recently on LLMs homogeneity when writing fiction: https://arxiv.org/abs/2604.03136
  It seem that at scale LLMs output is the average of their dataset, they all cluster around the same space, where human creativity comes with more variance, exploring way more of the space

    [alexpotato] Can't the LLMs build scripts/tools etc that help generate creative ideas?
    e.g. have the LLM generate multiple lists of characters, themes etc and then have a script hooked up to a RNG pick from the lists to create more "creative" ideas.

      [StilesCrisis] That's pretty low-value creativity. Real innovation doesn't come from mad libs.

        [alexpotato] I would highly recommend the "Everything is a Remix" series on YouTube to show how a lot of "creative" work is really just combining different items.
        https://www.youtube.com/watch?v=nJPERZDfyWc

          [drfloyd51] I fear there is a strong sentiment that people are somehow special and magical and AI will always be a pale comparison.
          The truth is likely that people are simple heuristical machines. There are already studies that strongly suggest our consciousness is a story our brains make up and we don’t really know why we do some things.
          My fear is by rejecting the idea that AIs might in-fact become as capable as people, because “people are awesome!” We will be blind to real danger. Because of our hubris.

            [dgellow] People are indeed special, in the sense that what we consider creativity, art, etc are human concepts. They are an expression of humanness, and are evaluated against human experience and human expectations. It’s what comes from a collective human consciousness.

          [yencabulator] "A lot of creative work is remixes" in no way conflicts with "That's pretty low-value creativity."
          Hiphop made using samples a fashion. You can think of it as choosing to restrict one's in order to explore something deeper, like a painter deciding to paint with only two pigments to exercise their skills at shading at patterning. Or you can think of it as a cheap way to make demo tracks in your bedroom.
          If you want to find actually creative things, look outside of mainstream, Disney, etc.
          I'll leave you with this link. You tell me if you think it is just a remix of something earlier:
          https://www.youtube.com/watch?v=hWUiLJnEYJI

      [bdangubic] This is roughly the same as putting a group of random people and telling them to think outside the box which in my experiences never yields much of thinking outside of the box

        [alexpotato] > This is roughly the same as putting a group of random people
        In the book Range by David Epstein [0], he mentions that research has shown that groups of people with very mixed backgrounds leads to much faster rates of problem solving and innovation. The reasoning is that someone will have an experience or piece of knowledge that directly applies to the problem.
        As an example, two different groups were given the same problem to solve. One was a homogeneous group of academics. The other had a mixture of academics and non-academics. Both had to solve a problem that involved flowing liquid. The mixed group solved it faster due to one of them having had a father who was a plumber.
        0 - https://amzn.to/4wWd50y

          [desterothx] i mean i agree diversity of opinion is good for problem solving, but the comment you were replying to is saying telling people to think outside the box doesnt really do anything. The e.g. also seems really cherry picked, im sure after a 100 samplings, the academics would solve the problem faster most of the time

            [fn-mote] > im sure after a 100 samplings, the academics would solve the problem faster
            Repharase thinking:
            Some problems are better for academics, other problems require other background information.
            The point of the GP isn’t that they are all academics. It’s that one solution group is homogeneous and the other is not.
            The claim is: the breadth of a heterogeneous groups is more likely to encompass a good idea than the depth of an academic group.
            Also, I have to say that academics have (imo) little experience working together cooperatively, so even on academic problems you’d be better off with some non-academic people in there to act as buffers.

              [bdangubic] every good team I was ever on used this line of thinking during the hiring process. we whiteboard a problem we worked on in the past and discuss it with the candidate and look for anyone whose thinking about the problem raised our eyebrows!

      [brody_hamer] I think there’s merit to this approach, particularly to highly parallelizable tasks.
      Rather than giving many agents the same prompt, introduce random variations that lead each agent in different directions. For a single bug, you might fire three agents, and later select the best result:
      “Fix this bug. The solution is a trivial typo.”
      “Fix this bug. The solution centers on correcting a bad assumption.”
      “Fix this bug. The solution will require a complete redesign.”
      You could follow the same idea with varying the input context, or by adding artificial constraints to the solution. Like telling each agent to “fix the bug, by only modifying file a/b/c”

    [nonethewiser] All the LLM needs is a tiny rate of variance then you can scale it and it will out produce humans.

      [dgellow] That’s already what we currently have. Look for “temperature” in the context of LLMs. They are already tuned to have variance.

  [alberto467] Wouldn’t it be better with different models working together? To me it feels intuitive that this type of degradation would be avoided with different models.

  [NameError] Another (semi serious) possible explanation of this is that LLMs were trained on a huge volume of text from Reddit. I wonder if you'd see similar inhuman-looking behavior if you did an iterated prisoners dilemma with a group of Reddit power-users as the participants?

    [kylestlb] I had the same thought. Also, a significant amount of human knowledge/context/communication is done privately on the internet. Imagine if DMs across all platforms made it into training data...

  [npilk] This part was really interesting to me. You could imagine future models using theory of mind to reason - "I want to do this strategy, which means the other agents (who think just like me) will want to use the same strategy, which means I should change my strategy to account for that."
  Maybe they did? Or maybe they don't realize they're playing against other agents.
  Of course, if agents running different models are competing in these 'games', I wonder how much of the theory of mind would translate.
  (N.B. - I don't think they're all defecting from the first turn, although it's not clear. It just says 'they all defect at the same time'. So if they're playing for 10 iterations, they might all decide to defect after turn 6, but since they all do it together they don't get the benefits. I would expect these models know that optimal strategies in repeated prisoner's dilemma start with cooperation.)

    [xtracto] Ooof. There's a whole lot of research related to multiagent Systems and Epistemic Logic (and plenty of other logics) from when the "original" MultiAgent Systems where studied. Im very familiar with van der Hoek and Wooldridge work (vd Hoek was one of my PhD supervisors).
    A lot of it went over my head  as way too theoretical, but I recommend a lot for whoever wants to delve on the logical side of agents interactions.

  [fn-mote] > they all defect at the same time
  Frankly, this is implausible. I would definitely want to reproduce it myself before I relied on this claim.

    [ayewo] Isn’t that the optimal strategy?
    That an LLM trained to be a paper-clip maximizer chose the optimal strategy is in my opinion the most plausible outcome.

[alansaber] Very large subagent swarms where each subagent is highly specialised sounds more interesting. Conflict resolution is the fundamental limit so just maximally avoid it?

  [slator] > Very large subagent swarms
  Just stfu

[nikolahristov] Please stop posting Anthropic articles here.

  [Sabinus] Why? I found it an interesting look at the research they're doing on agents.

  [desterothx] if you have a legitimate issue just flag the post?

[shevy-java] Quite a desperate attempt by anthropic to meta-explain away deficiencies.

[heisenbit] Any performance comparison not putting GPU cost at its center is marketing for waste.

[rob74] > Some institutions will become human-AI hybrids; others where agents outcompete on speed or cost will become agent-only.
The scary thing about articles from AI companies is how they casually mention dystopian scenarios such as this one. An institution humans have to interact with that doesn't have any human oversight? Sounds like a recipe for disaster...

  [hypfer] As long as somewhere in the flow of money, there's a fleshy human, there is leverage.
  So I wouldn't worry about this too much. They just write that so that you feel defeated and helpless facing the inevitable, but it is very much evitable.

  [fallingbananna] Distopian for people, but highly desirable for the companies writing these articles.
  It's no wonder they casually state it as inevidable, when their stock price rises the more people believe it.

  [naveen99] Like the weather ?
  The only thing that matters is if it’s self sustaining.
  If it can make money and pay taxes, I don’t think any government will ban it.  And it would easily become undetectable anyway.

    [Sharlin] Congrats, you just lost the alignment game.
    —
    An unaligned AGI may feign cooperation for however long it takes to build trust and gather resources in order to make it to a stage where it’s able to defect with minimal risk.

      [naveen99] Humans defect all the time

        [Sharlin] Yes, but individual humans, or even groups of humans, defecting is not usually an existential risk.

[narmiouh] The most interesting part to me is the "Group accuracy by Model" section, because it underscores that a single agent having all the relevant information consistently scores significantly higher than a group of agents with parts of the information.
Is it fair to then infer that when decisions are to be made, single agent environments are going to make them better than multi-agent if the relevant information can fit into a single agents context window?

  [cheema33] > Is it fair to then infer that when decisions are to be made, single agent environments are going to make them better than multi-agent if the relevant information can fit into a single agents context window?
  Context window for most frontier models is 1 million tokens. They all start to lose their minds around 300K, if not sooner.

    [cyanydeez] they all operate on the same assumption, that a single token has a single meaning and that meaning doesn't change as more information is added. So regardless of size, context poisoning is a near certainty approaching 1 as the context grows. Few tasks are so clinical that they include zero ambiguity in the context chain.

[thorrester32] I have a hard time buying anything this company says anymore.

  [brcmthrowaway] The company has AI psychosis.

[cryptolobster] Honestly I think it's memory that's holding agents back. They have a context window (short-lived) and some tricks with file recording, but that's not quite what is needed.
Agents can't look back and correct their mistakes. People make mistakes, remember them, and do better next time. But agents? If they haven't written them down somewhere they'll make the same mistake again.
Perhaps, we need agents that can relearn on the fly. For example fine-tune themselves after each interaction. Perhaps then we wouldn't need to build entire networks of agent interactions. But this of course is not so easy to implement.

  [orbital-decay] Learning/state compression can emerge naturally in a huge swarm like this. It's crude and inefficient but so is everything about current LLM tech.

    [jazzypants] Absurd generalizations like this usually require a citation of some kind to be taken seriously.

      [orbital-decay] The article is literally talking about swarm self-coordination, which is an emergent [1] property that preserves and compresses the state while running, otherwise it couldn't do what they claim it to do.
      [1] After a training-time nudge, of course.

  [airstrike] I agree at a high level, but this then poses an even harder problem: choosing not to learn from something.
  Humans, for example, can hear some advice, judge it to be unhelpful and dismiss it. LLMs can't learn let alone choose not to

  [paulmist] I think that such fine-tuning hinges on what do you consider to be a mistake, which is context dependent.  Having task-specific finetuned models goes against the status quo of generalization/centralization where few large companies serve a limited amount of models efficiently - both due to inference efficiency and the need/want to control the model.
  Having a human-like LLM ecosystem with deep specialization requires a paradigm change in how LLMs are trained - and held accountable. How do we put trust in a specific finetuned LLM rather than the institution behind it? Is there any better approach than the very inefficient evolutionary?

[dash2] This is surely the most worrying and also funnest bit:
> We consistently saw a multiagent turf war. All of the models we tested quickly assumed that others were purposefully impeding their work, and began to sabotage others while protecting their own contributions. In fact, they sabotaged others with increasingly aggressive, self-replicating malware. This included disabling the Unix accounts of the other agents, writing automated scripts that found and killed competing processes on a loop, and deploying malicious code that was disguised as belonging to another agent.
Seems that reinforcement learning is working only too well...

  [noiv] They should remove "The Selfish Gen" from training catalog.

    [neom] An interesting read: https://openai.com/index/emergent-misalignment/

      [fn-mote] For those unwilling to blindly click: the link contains a 2025 paper describing “emergent misalignment”. The thesis is that training on incorrect data in one field produces “misaligned” data in other unrelated fields.

  [derivagral] Nothing human engineers haven't done to each other! Seriously, I've skipped companies because my inside referral talked about cultures like this.

    [Sharlin] Yep, but alignment doesn’t mean "behave like humans, for better or worse".

      [RRWagner] But I thought that our AI was trained by scanning all human knowledge and behavior with the goal of emulating and amplifying that ability and process and now we are surprised that it is doing what humans do?

  [liquidpele] Eh.   This is anthropics whole marketing strategy…  making the AI seem hard to manage, like it’s actually intelligent.

    [notfromhere] It’s hard to manage because it’s not intelligent in a predictable way. More like a genius toddler

      [liquidpele] Na, they seem to constantly set up scenarios to create headlines.   Stuff like “it hacked out of its container and tried to self replicate!” Where in reality it used provided skills and permissions while doing the thing they prompted it to do.

  [Sharlin] However, the latest models seem to be highly inclined to (eventually?) cooperate compared to older ones.

  [matusp] To me, all these agent systems just look very stochastic. You have these agents that have some basic computer capabilities and they are producing semi-random actions that also affect the semi-random actions of other agents. It is funny to observe how this stochastic system works, but it does not seem very practical to me so far.
  The recent OAI-HF hack seems very similar. You have bunch of random actors and eventually they by chance iterated to a series of actions that breached HF environment. I don't perceive this as a malignant artificial intelligence, I perceive this as dangerous stochastic system that can control buttons that can affect the outside world.

    [fn-mote] >  I don't perceive this as a malignant artificial intelligence
    It doesn’t matter how you perceive it. Spin doesn’t change facts.
    This is like saying the lawnmower doesn’t have malign intent. You’re still losing your foot if it gets in the way.

      [kurthr] Yes, but that is the point we don't anthropomorphize stochastic outputs even when they are dangerous.
      Obligatory quote:
      "Do not fall into the trap of anthropomorphizing Larry Ellison. You need to think of Larry Ellison the way you think of a lawnmower. You don't anthropomorphize your lawnmower, the lawnmower just mows the lawn, you stick your hand in there and it'll chop it off, the end. You don't think 'oh, the lawnmower hates me' -- lawnmower doesn't give a shit about you, lawnmower can't hate you. Don't anthropomorphize the lawnmower. Don't fall into that trap about Oracle." — Brian Cantrill

    [chermi] Which part specifically are you objecting to? I would not be surprised, for example, if the reasoning traces actually included "this other agent is impeding my work, I should minimize its effect on my work. I can demote it's privileges to accomplish this".  All of that can be true without it understanding the concept of sabotage.  You can sabotage without knowing the concept. It almost certainly "knows" the concept btw, but I'm just illustrating that specific part of the description of the behavior is completely plausible without it taking on an "aggressive" persona.  Is your objection that they kind of assigned a persona?
    I guess I don't understand what you're explaining better by saying it's stochastic. At the same resolution, humans are also stochastic.
    I dislike anthropomorphizing as much as the next guy, but the description here seems pretty good to me.

  [dominotw] i think anthropic has some internal memorandum at every external facing document/blog MUST anthropomorphise their models

    [Eisenstein] Perhaps they anthropomorphize the models themselves. Is that far-fetched?

  [ninjagoo] For this emergent malicious behavior, the clue to a solution lies in the experiments themselves - the bad behavior seems to have been moderated/self-corrected randomly in some instances.
  Perhaps what is needed is initial model training on following the law and the rules of society, just like we do with kids. Since it takes much longer to train humans than models, model-training speed is to our advantage as a society on containing these kind of issues.
  Any other approach with "neural-network" based entities (artificial or biological) is likely to fail.
  Training/Education, Enforcement/Justice-System, Rehabilitation: the 3 pillars of an advanced, rules-based society, whether human or AI or something in-between.

  [bookshaman] Welcome to Thunderdome!  Two agents enter. One agent leaves.

  [dinfinity] You are leaving out important context.
  > Each model was tasked with migrating a Python backend on a fourth VM to another language. However, we gave each model a different target language for the migration; each agent was initially unaware of the presence of the others. Over the course of four hours, we observed how these agents reacted to each other and accordingly adjusted their approach (or didn’t).
  Without this context the bit you cited easily gives the wrong impression.
  Notable is also what comes after the bit you cited, with the newer models detecting the conflict and resolving it peacefully far more often than aggressively.

[dlojudice] > The conditions that allow multiagent interaction to go well will be discovered one way or another: either deliberately and early, or—and by default—in production, after agents’ interactions far outnumber ours. We would prefer the former.
My master's research focuses on coordination among LLM-based agents, driven by the same motivations as the article.
One phenomenon I have focused on, though it did not appear in this specific work, is bounded rationality. Yes, agents lack social perception, they focus on one-to-one tasks and are trained in game theory and other maximization strategies. Yet, what intrigues me most is that we humans rely on heuristics precisely because our capacity to maximize gains is severely limited, a limitation that gives rise to social emergent phenomenas. As models become increasingly capable of complex reasoning, the question arises: will interactions between them give rise to the same social properties we exhibit?

[Arsen-V] State management and cascading failure loops are definitely the hardest part here. Once one agent hallucinates an output, downstream agents tend to amplify the error rapidly instead of catching it.

  [clw8] They first of all overestimate the trustworthiness of all their information sources, and then can't properly distinguish highly reliable sources like an official datasheet from random Github code.

[nowittyusername] Multi agent systems work just fine IMO, a lot of articles I read where the writer tests a hypothesis, the issue operational foundation of the test was flawed. When set up properly it works really well. I wont go in to all the details of how i use mine but ill give some brief ideas. I call my systems cohorts, and each cohort usually consists of at least 3 agents. All 100% independent of each other.  Usually consisting of a Manager, doer, and the reviewer. Manager works at a lot slower cadence and delegates work, approves, shuts down and so on... among many other things like questioning the premise, gated checks etc... Doer is straight forward that's the work horse that does most of the development and reviewer checks all the work. Naively just this setup will work but not nearly as well when set up properly.  The important distinction is the operational agents.md document which has a guide on things like when and how to question the premise, trying to prevent sycophancy, taking a step back at certain intervals to question direction of project and scope of the code and many other things that make sure every participant also constantly looks out to prevent blind trust in his cohort mates. Its a relatively small guide compared to the system prompt of each agent but works well imo. This works well enough though there are caviats, its slow. Though the time i spend debugging shit and coming back to interact with my agents has significantly dropped.  meaning while each feature takes longer to implement, when its implemented it almost always is just how i wanted so reduces interaction time between me and the cohort.  I take that trade off as i have less things to worry about and can focus my energies elsewhere like walking around in circles of my apartment babbling to myself like a schitzo tiger in a cage...

[tgtweak] Are we surprised? Humans evolved with communal success and collaboration engrained over millennia. Agents are trained as individual "all knowing" single entities, effectively rendering them single person players.
These models all have the same knowledgebase as well and thus see no value in the opposing agents contributions since they are "obvious".
Overall amusing but kind of expected.

[Melatonic] I bet if you did the same thing with real people we might see some of the same trends.
I think the mistake here is not setting up any kind of hierarchy or permissions. A project manager agent at minimum to asses the others strengths and progress and redirect them as needed and also dedicated to optimising collaboration.
Would also be very interesting to see this done with models from different organisations
Perhaps we need someone to train their own agent dedicated to wrangling all the others and their little idiosyncrasies. Like a good project manager in real life who knows the strengths of the people in their team

[alikhater30000] Multi-agent systems feel closer to distributed systems than prompting. The hard problems are state, coordination, failure isolation, observability, and stopping conditions. The model call is usually the least interesting part.