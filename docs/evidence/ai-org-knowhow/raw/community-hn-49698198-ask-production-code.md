https://news.ycombinator.com/item?id=49698198
# Ask HN: Developers – Do you let agents write production code?
author: smurf9852 date: 2026-09-14T15:07:00.000Z

I know 2 good developers, let's call them Bob and Bill.
Bob does not write code anymore, he orchestrates agents. Says it makes him faster. That the level of slop is the same as with humans. He swears by it.
Bill only uses agents to write tests and do code review. He says even a Fable 5.1 will create 1,000 line slop instead of his 10 line fix. He swears by it.
Both Bob & Bill are both credible developers that have lots of experience at building real things, including at Google.
Do agents still produce slop?
Does the 10x engineer really exist?
What is your position?

## comments (11)

[smurf9852] Curious to hear if you let an LLM write production code!
I know smart people that do, and smart people that don't.
What's your view?

[rvz] Never unattended without a human reading the output. It does not matter about what company they have been to.
The skill of reviewing requires experience and competency in the technology. It will require critically thinking around why the agent chose a technology over another and what the "definition of fixed" not workarounds means by the experienced human.
Whether if it is a big name company or a lesser named company is irrelevant.
> Do agents still produce slop?
Yes.
> Does the 10x engineer really exist?
Yes. They do not care about what company they join. They might even build their own company rather than join anyone else and they do not care about titles. (Which is all made up).

[dgarciaf18] Production code should never depend on the attention of "the oldest guy in the office". We used to have methods not to break stuff: extensive automated testing, monitoring, QA, canary deployments, A/B testing. And, ultimately, a rollback plan. Building production-grade application should not be a one-man (or one-agent) job. Back in the pre-AI era software also used to break when you did not have proper testing and release processes.

[rajay99] Automated testing, but yes it writes production code all the time. I review all the code.

[codegeek] 10x code is mostly overrated. The first goal of any code is to solve a problem for the customer/business and solve it fast enough. The second goal is to make it efficient/repeatable etc as needed. But if you never meet the first goal, the 2nd goal is moot. So, based on how real world works, Bob is going to be a lot more valuable to any company unless you are building something that is very core to the machine (like an OS etc). Then, may be Bill.

  [eMpHaSe] Absolutely. But in the end the senior dev has to understand the code, review the code and publish it as "his/her" code. So, that is the level of commitment I would see...

[taklimakan] I let AI write unit tests, PR summaries, documentation, UIs for internal use, and some production code. I review the code that goes in production, mostly to refactor and simplify, or just to make sure the code is understandable at a glance by a human.
My goal is to avoid tech debt, and to actually own the code. If you don’t review, you don’t own the code, and this eventually can come back and bite you in the rear.

[huurtehoog] Fun fact, the original paper about "10x" developers found that some programmers had an order of magnitude better performing code, not 10x the amount of code or features.
The 2 metrics used were CPU time in executing the software they wrote for the paper, and debugging time.
The original concept of 10x developer is one who writes code that performs 10x better and is 10x easier to maintain.

[FirstClassTree] we're building ShapelessAI, an agent that makes and publishes social content, almost entirely with Claude Code and Codex. One failure worth separating from code quality: agents claiming they verified something they didn't. A test result and an agent's summary of a test result are different evidence; delegating the code doesn't make that distinction go away.

[albertfranquesa] Writing code with agents only scales to a certain extent. You need to govern your agents, otherwise you are creating a problem for yourself. We are using several tools to efficiently scale our agents

[worklifepanda] In my experience it depends a lot on what you give the agent: agents that work on a project well structured, well documented and the agent is given very good context (that documentation, project structure and a clear pattern/style to reuse) then yes, it can be very productive and provide good quality code, especially if the ask is well contained, explained, has clear goals. If you give no boundaries, no good context, references, pattern and style then yes, they write a huge amount of useless code.