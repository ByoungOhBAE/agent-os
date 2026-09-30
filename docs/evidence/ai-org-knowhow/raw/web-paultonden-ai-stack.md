https://paultonden.com/ai-stack.html

Operating Notes

# How I run my work with AI agents.

Two standing agents. Two scheduled runs a week. Nothing publishes without me.

Last revised August 2026

---

## The short answer

I run two scheduled AI agents that do defined jobs on a defined cadence and hand me drafts. They do not act on my behalf. They do not send mail, publish posts, or contact anyone. They read, filter, draft, and stop.

The interesting part of this system is not what it does. It is what I took out of it, twice. Sixteen agents became four in July. In August I decided four was still two too many.

The operating principle

An agent earns its slot by removing a decision I would otherwise have to make, or a search I would otherwise have to run. If it only produces output I never act on, it is not automation. It is noise with a schedule attached.

---

## The two agents

One looks forward. One looks back. That turned out to be the whole job.

01

### Monday Desk

Mondays, 8:00 ET

Names and numbers for the week ahead. Who to contact, what to say to them, and what is at risk if I do not. It reads my task file, both calendars, and my mail, and it is required to end with three specific calls to make that day.

Output: one email that ends in three phone calls. If it cannot name three, it says so rather than padding the list.

02

### Friday Desk

Fridays, 4:00 ET

An honest close on the week. What actually moved, what stalled, and whether it stalled on me or on someone else, because those are different problems. Then a kill list. The kill list is the point: it is instructed to recommend closing things I like, and to tell me when something marked open is already finished.

Output: a short written close, plus direct edits to the task file so the next week starts from something true.

---

## What is deliberately not on a schedule

The distinction that keeps this small is between a **scheduled agent** and a **capability**. A scheduled agent is for work that has to happen on a cadence whether or not I remember it. A capability is something I invoke when I need it, and it costs nothing the rest of the time.

Client research before a walkthrough, proposal drafting, settlement reporting, contract review, CRM cleanup, literature work on the dissertation. All of these are real and all of them run on AI. None of them are on a schedule, because none of them need to fire while I am asleep. Confusing capability with cadence is how four good ideas become thirty-seven runs a week.

The test

Before anything goes on a schedule: would this be worse if I only ran it when I thought of it? If the honest answer is no, it is a capability, not an agent.

---

## What I removed, and why that is the point

I built sixteen of these. At peak they ran roughly thirty-seven times a week. Some of it was genuinely useful. A lot of it was me automating my own anxiety.

37
Scheduled runs per week at peak, across 13 recurring agents

2
Scheduled runs per week now, across 2 agents

95%
Reduction in scheduled compute, with no loss of anything I was acting on

The first audit was simple. For each agent I asked one question: in the last month, what did I actually do differently because this ran? Where the honest answer was nothing, it went. That took sixteen down to four.

Reddit lead scanner · ran 14x/week, could not reach the source

Three separate daily job monitors · all reading the same inbox

Weekly blog engine · drafts outpacing my capacity to publish

Weekly valuation drill · a good idea, wrong season

Monday content planner · built for a growth posture I am not in

Monthly market brief · interesting, never actionable

Friday reputation check · folded into the weekly desk

Direct board sweep · duplicated the daily desk

---

## The second cut, and a better diagnostic

Four agents felt defensible for about three weeks. Then I noticed something I had not thought to measure: nine of their runs were sitting in my sidebar unopened. Six from one agent, three from another.

That is a cleaner signal than the question I had been asking myself, because it does not rely on my memory or my self-image. An agent whose output you never open is not underperforming. It is unwanted, and it is quietly producing debt in the form of things you feel vaguely guilty about not having read.

The diagnostic I use now

Do not ask whether an agent is useful. Ask how many of its last ten runs you opened. What you are not reading, you are not acting on, and what you are not acting on is still costing you money and attention to produce.

All four went. Two came back as one forward-looking desk and one backward-looking desk.

Opportunity Desk · six unread runs. The daily cadence was the tell; opportunity does not arrive daily.

Content Desk · produced drafts faster than I published them, again.

Blue Moon Desk · conditional and well built, but it fired on a business that had no sale on the board.

Dissertation Desk · three unread runs. The honest exception, and the one I would rebuild first.

Two other things surfaced in that cleanup, and both are the kind of problem you only find by running this yourself for a year rather than reading about it.

The agents lived in two different stores · some created in one place, some in another, so no single list showed everything that was running. I could not audit what I could not enumerate.

A scheduled agent inherits the model of the session that created it · and cannot be changed afterward. Several were quietly running on an expensive model because of where I happened to be sitting when I built them. That was a real bill before I caught it.

Two dashboards I built to watch the system · both static, both stale within days, because nothing could update them except me asking for a rebuild. A status page that cannot update itself is a screenshot.

The fix for that last one · the front door is now a plain text file the agents read and edit as a side effect of work they already do.

---

## The design rules I hold these to

- **Draft, never send.** Every agent hands me work. None of them speaks to another human as me.
- **Bounded scope.** Each prompt states explicitly what the agent must not do, because the failure mode of a capable agent is not doing too little.
- **Cheap when idle.** An agent that finds nothing should cost almost nothing to report that. Conditional work beats unconditional work.
- **Hard caps on output.** Three calls, one screen. A cap forces the agent to rank rather than accumulate.
- **Count the unopened.** Unread runs are the earliest honest signal that something has stopped earning its slot.
- **Legible to a stranger.** If I cannot explain what an agent does in one sentence on a call, it is either badly scoped or it should not exist.
What this actually demonstrates

Anyone can stand up sixteen agents. The discipline that matters, and the one most organizations skip, is measuring what came back and being willing to turn off the things that did not earn their place, including the ones you were proud of building. I have now done that twice, and the second cut went deeper than the first. Adoption is not the hard part. Restraint is.

---

Paul Tonden · paul@houseofpraxis.studio · linkedin.com/in/paultonden