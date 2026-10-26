"""Apply R1/R2 review findings to verdicts.json (idempotent). Writes verdicts.json + changes.log.json."""
import json, os, shutil, datetime

home = os.path.expanduser('~').replace('\\', '/')
S = home + '/AppData/Local/hermes/cache/scratch/skillmap'
H = home + '/AppData/Local/hermes/skills'
P = S + '/verdicts.json'
if not os.path.exists(S + '/verdicts.before-reviews.json'):
    shutil.copy(P, S + '/verdicts.before-reviews.json')
V = json.load(open(S + '/verdicts.before-reviews.json', encoding='utf-8'))
usage = json.load(open(H + '/.usage.json', encoding='utf-8'))
log = []


def rows(name, rel=None):
    out = [x for x in V if x['name'] == name and (rel is None or x['rel'] == rel)]
    assert out, name
    return out


def setf(name, fid, rel=None, **kw):
    for x in rows(name, rel):
        for k, val in kw.items():
            if x.get(k) != val:
                log.append({'finding': fid, 'skill': name, 'rel': x['rel'], 'field': k, 'old': x.get(k), 'new': val})
                x[k] = val


def note(name, fid, text, rel=None):
    for x in rows(name, rel):
        x.setdefault('review_notes', [])
        if text not in x['review_notes']:
            x['review_notes'].append(text)
            log.append({'finding': fid, 'skill': name, 'rel': x['rel'], 'field': 'review_notes', 'new': text})


# R2-5 / R1-11: refresh telemetry, add the skill created after the audit
for x in V:
    u = usage.get(x['name'], {})
    if 'computer-use' in x['rel']:
        continue
    for k, uk in (('use', 'use_count'), ('patch', 'patch_count')):
        if u and x.get(k) != u.get(uk, 0):
            log.append({'finding': 'R2-5', 'skill': x['name'], 'field': k, 'old': x.get(k), 'new': u.get(uk, 0)})
            x[k] = u.get(uk, 0)
if not any(x['name'] == 'hermes-skill-library-curation' for x in V):
    u = usage.get('hermes-skill-library-curation', {})
    V.append({
        'name': 'hermes-skill-library-curation', 'rel': 'autonomous-ai-agents/hermes-skill-library-curation/SKILL.md',
        'root': 'hermes', 'prov': 'local', 'use': u.get('use_count', 0), 'patch': u.get('patch_count', 0),
        'last_used': (u.get('last_used_at') or '')[:10], 'category': 'agents-hermes', 'verdict': '유지', 'merge_into': None,
        'method': '스크립트 포함', 'method_detail': 'scripts/index_probe.py(목록 실측)·scripts/verdicts_gate.py(판정 관문) + 절차',
        'capability': '설치된 스킬을 조사·분류·중복 정리하는 절차와 검사 도구를 줍니다.',
        'when': '스킬 정리·스킬 지도·중복 스킬 이야기가 나올 때',
        'overlap_with': ['find-skills', 'omh-skill', 'omh-skill-health', 'hermes-memory-curation'],
        'signals': {'concrete': True, 'missing_refs': [], 'stale_refs': [], 'env_fit': 'ok', 'user_lessons': True},
        'lessons_to_port': [], 'confidence': 'medium', 'audit_lane': 'review', 'reaudit': True, 'action': 'keep',
        'reason': '이번 정리 작업 중 큐레이터가 만든 스킬(10-27 04:08, created_by agent). 경계: find-skills=외부 허브에서 새 스킬 찾기, omh-skill=OMH 팩 관리, hermes-memory-curation=기억 정리 — 이 스킬은 설치된 스킬 목록 자체의 감사·재분류.'})
    log.append({'finding': 'R1-11', 'skill': 'hermes-skill-library-curation', 'field': 'row', 'new': 'added 유지'})

# R1-3 / R2-3: one rule - capability only, route hints never keep a skill
setf('ulw-research', 'R1-3', verdict='끄기', action='disable(skills.disabled)', merge_into=None, port_to='multi-source-research-survey',
     reason='능력 기준: 다중 출처 조사는 multi-source-research-survey(사용 16회, 사장님 교훈 포함)가 맡음. OMH 경로 힌트가 가리킨다는 이유는 판정 근거로 쓰지 않기로 함(R1-3/R2-3). 힌트가 꺼진 스킬을 가리킬 때는 workflow 분류 설명의 안내 한 줄로 대응.')
setf('omh-executor-runtime-readiness', 'R1-3', verdict='끄기', action='disable(skills.disabled)',
     reason='본문이 OMH 공통 틀이고 사용 0회. 코딩 위임은 claude-code·codex 스킬이 실제 명령으로 맡음. OMH 경로 힌트가 가리킨다는 이유는 판정 근거로 쓰지 않기로 함(R1-3/R2-3).')
# R1-12
setf('omh-capability-toggle', 'R1-12', verdict='끄기', action='disable(skills.disabled)',
     reason='정리는 skills.disabled로 하므로 실행 수단이 아님. 남겨 두면 OMH 기능군을 통째로 끌 위험(retain_knowledge를 끄면 memory.provider=omh 기억 공급자가 꺼짐). 봇 프로필도 같은 OMH 폴더를 씀.')

# R1-1: kept OMH skills -> local copy in the new category folder (shadows the OMH original for the default profile only)
for x in V:
    if x['prov'] == 'omh' and x['verdict'] == '유지':
        setf(x['name'], 'R1-1', action='local-copy(shadow OMH original; OMH files untouched)')

# R1-5: academy-code-audit stays in academy
setf('academy-code-audit', 'R1-5', verdict='유지', merge_into=None, action='keep-thin',
     reason='학원 사이트 전용 점검이라 academy 분류에 남겨야 함(분류만 보고 고르기). 겹치는 1~7단계 절차만 지우고 "delegated-code-audit 절차를 따른다" 한 줄로 바꾼 뒤 학원 교훈 줄은 그대로 둠. 사용 11회.')

# R1-6: category fixes
setf('baoyu-diagram', 'R1-6', category='visual-content')
setf('document-to-action-items', 'R1-6', category='documents')
for n in ('omh-cancel', 'omh-doctor', 'omh-skill', 'omh-agent-ops-review', 'omh-routing'):
    setf(n, 'R1-6', category='agents-hermes/omh')
for n in ('claude-code', 'codex', 'opencode', 'ulw-maestro'):
    setf(n, 'R1-6', category='agents-hermes')
setf('maps', 'R1-6', category='research')
for x in V:
    if x['verdict'] == '유지' and (x['name'].startswith('agentos-') or x['name'] == 'multi-agent-control-plane'):
        setf(x['name'], 'R1-6', category='agents-hermes/agentos')

# R1-4: every non-kept row with lessons gets port_to; fill lessons that lived only in reason
PORT = {
    'design-taste-frontend': ('frontend-design', [
        "작업 전 '이 화면은 ○○를 위한 ○○ 분위기' 한 줄 선언 (design-taste-frontend:25-26)",
        '개편 때 사용자 승인 없이 주소(URL)·메뉴 이름·폼 항목 이름·로고·법적 문구를 바꾸지 말 것 (design-taste-frontend:825-831)',
        '전체 높이 화면은 h-screen 대신 min-h-[100dvh] (design-taste-frontend:153)']),
    'requesting-code-review': ('omh-code-review', [
        "커밋 전 리뷰는 diff만 주고 fail-closed JSON(통과/실패+이유)으로 판정받는다 (requesting-code-review:139-175)"]),
    'meeting-action-items': ('document-to-action-items', ['회의록도 문서로 취급한다(같은 절차로 할 일·담당·기한을 뽑음)']),
    'omh-agent-debug': ('agent-pipeline-diagnosis', None),
    'omh-design-quality-gate': ('frontend-design', None),
    'omh-frontend': ('frontend-design', None),
    'omh-visual-qa': ('live-web-change-verification', None),
    'omh-accessibility-audit': ('web-accessibility-wcag', None),
    'omh-verification-gate': ('unlazy', None),
    'competitor-profiling': ('multi-source-research-survey', None),
    'omh-idea-to-deploy': (None, []),
}
for n, (tgt, ltp) in PORT.items():
    kw = {'port_to': tgt}
    if ltp is not None:
        kw['lessons_to_port'] = ltp
    setf(n, 'R1-4', **kw)
for x in V:  # merges port into their merge target
    if x['verdict'] == '병합':
        setf(x['name'], 'R1-4', port_to=x['merge_into'])

# R2-1: missing owner lessons
r = rows('academy-content-truth-audit')[0]
extra = ['SKILL.md:13 Only the owner knows what is true. Never guess-delete, and pre-select a recommended value for every item.',
         'SKILL.md:15 Treat "we don\'t run X" as a site-wide purge of X across code, data, the chatbot and the banner-studio examples; keep the owner\'s personal credentials unless told otherwise, and ask about them explicitly.',
         'SKILL.md:40 Before asking what to change, ask per claim group in ONE clarify form (bullet 전체를 옮김)',
         'SKILL.md:45 Repo docs/** work files that other sessions feed into copy (facts.json strengths, channels.json, check_copy.py) — bullet 전체',
         'SKILL.md:47 ChatLog assistant rows (role=assistant only) to see what the bot actually said and when — bullet 전체 (:48 RSC payload는 accuracy:102와 합칠 때 함께 봄)']
setf('academy-content-truth-audit', 'R2-1', lessons_to_port=list(r['lessons_to_port']) + [e for e in extra if e not in r['lessons_to_port']])

# R1-9 / R2-2: Orca copies of computer-use
setf('computer-use', 'R2-2', rel='computer-use/SKILL.md', prov='orca', use=None,
     action='manual: move real folder to hermes/backups/skill-map-<date>/orca-computer-use (no curator; name is bundled)')
setf('computer-use', 'R2-2', rel='computer-use.rollback-broken/SKILL.md', prov='orca', use=None,
     action='manual: rm the symlink only (no -r, no trailing slash); never touch ~/.agents/skills/computer-use')
setf('orchestration', 'R1-10', prov='orca')
note('orchestration', 'R1-10', '지도 꺼진 것 표: Orca 다중 에이전트 조율이 필요하면 다시 켜기. 링크 검사의 알려진 예외.')
note('computer-use', 'R2-2', '번들판 경로 키 사용 기록: patch 3 (autonomous-ai-agents/computer-use).', rel='autonomous-ai-agents/computer-use/SKILL.md')

# R1-13
note('sdlc-review', 'R1-13', '칸반 리뷰(review_dispatch)를 쓰게 되면 다시 켤 것.')
note('requesting-code-review', 'R1-13', '칸반 여러 작업자 검증을 쓰게 되면 다시 켤 것.')
# R1-14: attached files
note('review-animations', 'R1-14', '딸린 파일 STANDARDS.md → design-motion-principles/references/review-animations-standards.md 로 옮김')
note('multi-bot-orchestration', 'R1-14', '딸린 파일 references/orchestrator-soul-template.md → agentos-bot-profile-config/references/ 로 옮김')
# R2-4
setf('web-perf', 'R2-4', reason=rows('web-perf')[0]['reason'].replace('preconnect', 'preconnect(web-quality-audit:56엔 추가 권장만 있고 쓰지 않는 preconnect 제거 규칙은 없음)', 1))
s = dict(rows('web-perf')[0]['signals'])
s['missing_refs'] = sorted(set((s.get('missing_refs') or []) + ['references/MEASUREMENT.md', 'references/RUM.md']))
setf('web-perf', 'R2-4', signals=s)
# R2-6 / R2-7
note('product-price-monitor', 'R2-6', '사용 1회는 10-26 감사 중 열람으로 추정(기준선 0회).')
note('multi-bot-orchestration', 'R2-7', '패치 1회(생성 당일) — 사유 문구의 "패치 0회"는 오기.')
# R2-8
setf('union-alpha-worker', 'R2-8', port_to='opencode', lessons_to_port=[
    'union-alpha-worker:30 가벼운 질문은 %LOCALAPPDATA%/Temp/union-chat 을 --cwd로(실제 저장소 금지)',
    'union-alpha-worker:49 고정 질문(1+1 결과는?)으로 워커가 실제로 도는지 확인'])
# R2-9
for n in ('omh-voice-input', 'omh-people-ops'):
    note(n, 'R2-9', '끄기 근거 = 내용 없는 OMH 공통 틀(매니페스트 sha256 동일, 사용자 수정 없음) — 판정 기준 5장에 "공통 틀" 규칙 추가.')


# R1-6 follow-up: academy has 21 kept skills in 6 tiny sub-folders -> one academy category line is clearer
for x in V:
    if x['verdict'] == '유지' and (x.get('category') or '').startswith('academy/'):
        log.append({'finding': 'R1-6', 'skill': x['name'], 'field': 'category', 'old': x['category'], 'new': 'academy'})
        x['category'] = 'academy'

# R1-2: pin every kept non-bundled skill (curator must not archive what the map keeps)
for x in V:
    want = x['verdict'] == '유지' and x['prov'] in ('local', 'hub', 'omh')
    if bool(x.get('pin')) != want:
        x['pin'] = want
log.append({'finding': 'R1-2', 'field': 'pin', 'new': sum(1 for x in V if x.get('pin'))})

json.dump(V, open(P, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(log, open(S + '/changes.log.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('rows', len(V), 'changes', len(log), 'at', datetime.datetime.now().isoformat(timespec='seconds'))
