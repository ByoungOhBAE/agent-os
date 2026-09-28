# AgentOS latency diagnosis — experimental plan

Status: user requested bounded experiments and diagnosis; remediation is DRAFT and NOT approved.

## Goal
Separate model/tool execution, transport/adapter overhead, scheduler waiting, human approval waiting, and chief-of-staff planning/delegation/reporting. Determine whether serial execution is unnecessary or a genuine dependency.

## Non-goals / constraints
- No production code/config changes, gateway restarts, cancellations, profile memory/skill edits, or changes to active issues.
- No substitute model or API-key fallback. Use subscription-backed claude-opus-5-5 only; verify effective model from runtime evidence rather than a self-report.
- Existing chief is executing two unrelated requests; do not add experimental chief work or disturb them.
- Do not commit unrelated working-tree changes or secrets. Save bounded allowlisted evidence only.

## Methods
1. Read current adapter, scheduler settings, task instructions and historical issue/run timelines.
2. Matched transport experiment: same idle test Hermes profile, same prompt/instructions/model/options, new sessions, no tools or memory changes. Compare POST /v1/runs directly with the actual installed Paperclip Hermes adapter against the same gateway. This bypasses the Paperclip scheduler/chief intentionally; it measures the adapter only, not the full user workflow.
3. Alternate direct/adapter order for multiple paired samples where practical. Record cold/warm order, actual model, wall time, model usage, first-output timing if exposed, quality validity and ambient concurrent runs. Do not attribute all wall-time variation to the adapter.
4. Historical full-path audit: parent/child issue creation, run start/end, plan interactions, child completion and final report. Deduplicate shared runs in issue run lists; only charge runs to their actual agent/task context. Separate human approval waiting. Inspect bounded tool event metadata without storing raw commands or private reasoning.
5. Inspect concurrent intervals and explicit dependencies. Parallelize only independent tasks; design-before-implementation can be legitimate. Distinguish configured concurrency from observed overlap.

## Acceptance / verification
- Runtime evidence identifies claude-opus-5-5; failures or model mismatch invalidate a sample.
- Exact prompt/input hash, shared profile and request options recorded. Session IDs differ only for isolation.
- Outputs checked against deterministic expected results; fast wrong answers are not successes.
- Timing computations scripted; missing timing fields explicitly unobserved.
- Conclusions distinguish controlled adapter evidence, historical workflow evidence and unresolved causal claims.
- Report includes prioritized remediation proposals and acceptance gates, without implementing them.

## Assumptions / unresolved tradeoffs
- An idle test profile can be reused with new isolated sessions without changing its files. Verify before dispatch.
- Background provider load/cache state cannot be fully controlled; small samples support diagnosis, not a general speed ratio.
- Reconstructing model-vs-tool time depends on what the stored events expose; gaps are not automatically model computation.
- Automatic approval or removing quality review is not an accepted optimization.

## Stop condition
Produce measured results plus a remediation plan. Stop on unavailable Opus access or inability to preserve bounded isolation rather than replacing the model. Any workflow changes require a separate explicit go-ahead.

OMH CLI runtime record: not_available (`omh` not on PATH). This document is the planning artifact, not evidence of execution.
