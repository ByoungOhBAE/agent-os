https://github.com/sethdford/claude-agent-os

# Claude Agent OS

A self-improving operating system for [Claude Code](https://claude.com/claude-code): skills, agents, hooks, rules, and an RL-style telemetry loop that make an agentic coding setup *measurably* better over time — not just busier.

Built and battle-tested across 60+ real sprints. Every rule in this repo exists because skipping it cost real engineering time; most cite the incident that created them.

## The five operating principles

1. **Plan before you build.** Plan mode for anything non-trivial.
2. **Hooks are guarantees, CLAUDE.md is suggestions.** Determinism belongs in the harness, not the prompt.
3. **Verify, don't assert.** No "the fix is in" without a verifier agent running the code and capturing evidence.
4. **Measure before tuning.** No rule changes without an eval scenario; no prompt patches without an A/B win.
5. **Skills, agents, hooks — one job each.**

## The loop

```
PLAN  →  BUILD  →  /verify  →  CRITIC REVIEW  →  REFLEXION  →  REPEAT
                       ↑              ↑                ↑
                  runs the code   cross-family    A/B-gated prompt
                  (evidence)      confirmation    patches
```

- **`/verify`** spawns a verifier agent that *runs* the work and reports `RESULT_verifier=PASS|FAIL|INCONCLUSIVE`. Reading code is not verification.
- **The critic** finds half-fixes, missing edge cases, and cross-agent regressions — and confirms its CRITICAL/HIGH findings with a **cross-family judge** (Gemini via Vertex AI), because same-family verification rubber-stamps ([arXiv 2512.02304](https://arxiv.org/abs/2512.02304)).
- **Reflexion patches** to agent prompts are staged as candidates and land only after winning `/ab-test` (>1 stderr, n≥10) — reflexion-style patching has no published validation, so the gate *is* the validation.
- **Verifier gain** (`rl/verifier_gain.py`) tracks whether your verifiers actually add signal beyond the solver's base rate. Ours was **−12.6%** before the cross-family change. Measure yours.

## What's inside

| Directory | Contents |
|---|---|
| `skills/` | 18 skills: `/verify`, `/caretaker`, `/eval`, `/ab-test`, `/aspect-panel`, `/best-of-n`, `/exec-grounded`, `/scrum`, `/spec`, `/team`, `/mine-transcripts`, `/tune-agent`, `/rl-status`, `/cache-report`, `/diagnose-ci-queue`, and more |
| `agents/` | 26 agent definitions: verifier, critic, agent-tuner, product-owner, scrum-master, tech-lead, sprint-auditor, security-reviewer, regression-hunter, flake-detector, … |
| `hooks/` | 24 lifecycle hooks: auto-verify on task completion, auto-critic on commit, constitutional gate on destructive bash, cache-stats telemetry, correction detection |
| `rules/` | 14 evidence-backed rules (each documents the failure that created it) |
| `rl/` | The measurement loop: reward emission, verifier gain, A/B testing, aspect panels, best-of-N, execution-grounded rollouts |
| `workflows/` | Deterministic multi-agent orchestration scripts (deep-explore, tier01-review) |
| `sandbox/` | `sandbox_run.py` — sandbox-exec/bwrap wrapper for verifying untrusted code |
| `evals/` | Scenario runner + example scenarios (verifier, diagnose-ci-queue) |
| `templates/CLAUDE.md` | The global operating instructions, ready to adapt |
| `constitution.md` | The destructive-operation gate the constitutional hook enforces |
| `examples/settings.hooks.json` | The `settings.json` hook wiring, ready to merge |

## Install

**As a plugin (recommended):**

```
/plugin marketplace add sethdford/claude-agent-os
/plugin install agent-os@claude-agent-os
```

Skills, agents, and hook wiring load automatically (hooks run from the plugin
via `${CLAUDE_PLUGIN_ROOT}`). Updates arrive with `/plugin marketplace update`.

**Or dotfiles-style** (if you want the files editable in `~/.claude`):

```bash
git clone https://github.com/sethdford/claude-agent-os
cd claude-agent-os
./install.sh              # copies into ~/.claude, backs up anything it would overwrite
./install.sh --settings   # additionally merges hook wiring into ~/.claude/settings.json (with backup)
```

Use one mode or the other, not both (both wire the same hooks — running them
twice double-fires every event).

Then in any Claude Code session: `/verify`, `/eval`, `/rl-status`, `/aspect-panel <target>` …

**Optional — cross-family verification:** the critic's Gemini judge needs `gcloud` auth (`gcloud auth login` + a project with Vertex AI enabled). Without it the judge step skips silently; everything else works.

## Token discipline (why this doesn't bankrupt you)

The design follows three findings from a mid-2026 research pass, adversarially verified before adoption:

- **Fan out for coverage, never for confidence.** At equal token budget, a single agent matches or beats multi-agent redundancy on sequential reasoning ([arXiv 2604.02460](https://arxiv.org/abs/2604.02460)). Panels are reserved for genuinely independent dimensions.
- **Refinement is ~86% of agentic token cost** ([arXiv 2601.14470](https://arxiv.org/html/2601.14470v1)) — so review loops are hard-capped at 2 rounds, and one high-effort review pass replaces N medium ones.
- **Cross-family disagreement adds information; same-family votes add cost** ([arXiv 2512.02304](https://arxiv.org/abs/2512.02304)) — one Gemini confirmation call replaces stacked Claude voters.

## Self-improvement, gated

```
transcripts → /mine-transcripts → lessons + rule candidates (human-reviewed)
failures    → /tune-agent       → harness changes first, prompt candidates last
                                   → /ab-test → promote only on win
telemetry   → /rl-status        → verifier gain, reward trends, tuning candidates
every change → prediction ledger → scored against outcomes when due
```

Nothing self-modifies without either a human review or a measured win — and every landed change records a **falsifiable prediction** (`rl/prediction_ledger.py`) that `/rl-status` scores when due, so the system learns whether its own improvements work (decision observability, [arXiv 2604.25850](https://arxiv.org/abs/2604.25850)). A prediction that scores WRONG auto-files tuning evidence — the system notices its own failed improvements. The tuner targets **tools, hooks, and memory before prompts** — the layers where closed-loop gains actually come from. That's the difference between a self-improving system and a self-mutating one.

## Always-on autonomy (the nervous-system layers)

**Full setup guide: [docs/AUTONOMY.md](docs/AUTONOMY.md)** — sensors via `sensorctl`, the wake framework, the `/caretaker` skill, and the graduated-autonomy safety model.

"Always watching" does not mean an LLM is always running. The architecture is
**deterministic sensors 24/7 → event-gated LLM wake → bounded autonomous action**:

- **Sensors** (`scripts/sensor-wake.sh` + `examples/sensor-launchd.plist.example`):
  cheap deterministic scripts on launchd timers with the LOOP contract (exit 0 =
  silence). On anomaly: macOS notification always; ONE cooldown-gated,
  budget-capped headless Claude triage session (read-only + notify, never mutates).
- **Micro-mining** (`hooks/micro-mine-on-end.py`, SessionEnd): every session's
  detected corrections land in `~/.claude/lessons-inbox.md` deterministically —
  no correction waits for the weekly mining run to be noticed.
- **Caretaker** (`scripts/caretaker-daily.sh` + a daily scheduled task): gathers
  predictions/verifier-gain/reward-health/sensor/drift state deterministically;
  the LLM session triages only what's flagged, under a hard authority boundary —
  it **files work, it never ships changes** (no edits to rules/agents/code, no
  promotions, no restarts, ~20 tool calls max).

Graduated-autonomy principle: an action class gets automated only where its
verification is deterministic. Everything else produces a proposal.

## Requirements

- Claude Code ≥ 2.x, `python3`, `bash`, `jq`
- Optional: `gcloud` (cross-family judge), `gh` (CI-triage skills)

## License

MIT — see [LICENSE](LICENSE).