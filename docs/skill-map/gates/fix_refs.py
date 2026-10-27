"""A7 fixes: repoint references to archived/merged/disabled skills. Exact substring replacements, each must hit."""
import os, sys

SK = os.path.expanduser('~').replace('\\', '/') + '/AppData/Local/hermes/skills'
OMH_LOOP = 'C:/Users/tahar/.omh/skills/ultrawork/ulw-loop/references/goal-constraint-discipline.md'
FIX = {
    'academy/academy-competitor-discount-survey/SKILL.md': [
        ", `competitor-profiling` (profile template only; its SEO stack does not apply)", ", `multi-source-research-survey` (competitor dossier shape)"],
    'academy/academy-competitor-discount-survey/references/discount-promo-set.md': [
        "`hero-studio-figma-export` writes Figma files", "`academy-hero-studio` (references/figma-export.md) writes Figma files",
        "(`hero-studio-figma-export` + `figma-mcp-design`)", "(`academy-hero-studio` figma-export reference + `figma-mcp-design`)"],
    'academy/academy-school-partnership/SKILL.md': ["(naver-blog-photo-sourcing skill)", "(naver-blog-photo-harvest skill)"],
    'agents-hermes/agentos/agentos-bot-profile-config/SKILL.md': [
        "(planner's `multi-bot-orchestration` room pitfalls, 'room report' steps)", "(the planner bot's own room-orchestration skill pitfalls, 'room report' steps)"],
    'agents-hermes/agentos/multi-agent-control-plane/SKILL.md': [
        "For Hermes-only bot teams use `multi-bot-orchestration`", "For Hermes-only bot teams use `agentos-bot-profile-config`"],
    'agents-hermes/hermes-memory-curation/SKILL.md': [
        "agentos-ops-hardening, omh-memory-sync]", "agentos-ops-hardening]",
        "`omh-memory-sync` only prepares a diff; this skill is the applied workflow.", "This skill is the applied memory-review workflow (the OMH memory-sync workflow is off in the default profile)."],
    'agents-hermes/hermes-skill-library-curation/SKILL.md': ["omh-plan, omh-skill-health]", "omh-plan, omh-skill]"],
    'coding/github/SKILL.md': ["[codebase-inspection, requesting-code-review]", "[codebase-inspection, omh-code-review]"],
    'coding/github/references/issue-to-pr.md': ["use `requesting-code-review` on the diff", "use `omh-code-review` on the diff"],
    'coding/simplify-code/SKILL.md': [
        "[requesting-code-review, test-driven-development]", "[omh-code-review, test-driven-development]",
        "that's what `requesting-code-review` is for.", "that's what `omh-code-review` is for.",
        "`requesting-code-review` for the pre-commit", "`omh-code-review` for the pre-commit"],
    'design/claude-design/SKILL.md': [
        "[design-md, popular-web-designs, excalidraw, architecture-diagram]", "[design-md, frontend-design, ui-ux-pro-max, baoyu-diagram]",
        "check for other web-design skills like `popular-web-designs` (ready-to-paste design systems for Stripe, Linear, Vercel, Notion, etc.) and `design-md`",
        "check for other web-design skills like `ui-ux-pro-max` (palettes and font pairings by industry) and `design-md`",
        " If the user wants a known brand's look, load `popular-web-designs` alongside this one and let it supply the visual vocabulary.", "",
        "## When To Use This Skill vs `popular-web-designs` vs `design-md`", "## When To Use This Skill vs `design-md`",
        "use `popular-web-designs` for the visual vocabulary, `claude-design`", "use `ui-ux-pro-max` for palettes and fonts, `claude-design`"],
    'design/design-md/SKILL.md': [
        "[popular-web-designs, claude-design, excalidraw, architecture-diagram]", "[claude-design, frontend-design, ui-ux-pro-max]",
        "For purely visual inspiration or layout examples, use `popular-web-designs`", "For palettes and font pairings, use `ui-ux-pro-max`"],
    'marketing/ads/SKILL.md': ["**customer-research / competitor-profiling / positioning**", "**customer-research / multi-source-research-survey / positioning**"],
    'marketing/ads/references/creative-research-automation.md': [
        "[competitor-profiling](../../competitor-profiling/SKILL.md)", "`multi-source-research-survey`"],
    'pc-ops/local-file-cleanup/SKILL.md': ["related_skills: [omh-files]", "related_skills: [nas-docker-deployment]"],
    'research/grounded-citations/SKILL.md': ["for conference papers use the `arxiv` skill, which this skill", "for conference papers search arxiv.org directly, which this skill"],
    'research/grounded-citations/references/citation-formats.md': ["## Wiki / multi-page output (`llm-wiki`, Obsidian)", "## Wiki / multi-page output (wiki pages, Obsidian)"],
    'research/rss-feeds/SKILL.md': [
        "[reddit-reading, competitor-news-monitor, grounded-citations, youtube-content, blogwatcher]", "[reddit-reading, grounded-citations, youtube-content]"],
    'visual-content/chatgpt-desktop-image-gen/SKILL.md': ["(`naver-blog-photo-sourcing`;", "(`naver-blog-photo-harvest`;"],
    'workflow/ulw-work/SKILL.md': [
        "load `ulw-loop/references/goal-constraint-discipline.md` for the method.", f"read `{OMH_LOOP}` for the method (the loop workflow itself is off in this profile)."],
    'research/naver-blog-photo-harvest/SKILL.md': [
        "description: Use when harvesting verified photos from Naver blogs.", "description: Use when harvesting verified photos from Naver blogs (요리 사진 원본 찾기 포함)."],
}
CLAUDE_DROP_LINES = ('| **popular-web-designs** |', '- **Match a known brand\'s look** → popular-web-designs')
errs = []
for rel, pairs in FIX.items():
    p = f'{SK}/{rel}'
    raw = open(p, 'rb').read()
    crlf = b'\r\n' in raw
    t = raw.decode('utf-8').replace('\r\n', '\n')
    for old, new in zip(pairs[::2], pairs[1::2]):
        n = t.count(old)
        if n == 0:
            errs.append(f'{rel}: not found: {old[:60]}')
        t = t.replace(old, new)
    if rel == 'design/claude-design/SKILL.md':
        t = '\n'.join(l for l in t.split('\n') if not l.startswith(CLAUDE_DROP_LINES))
    open(p, 'wb').write((t.replace('\n', '\r\n') if crlf else t).encode('utf-8'))
for e in errs:
    print('MISS', e)
print('files', len(FIX), 'misses', len(errs))
sys.exit(1 if errs else 0)
