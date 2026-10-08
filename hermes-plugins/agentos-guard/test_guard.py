"""Unit tests for agentos-guard rules. Run:
  <hermes venv>/python -m unittest hermes-plugins/agentos-guard/test_guard.py -v
"""
import importlib.util
import os
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("agentos_guard", HERE / "__init__.py")
mod = importlib.util.module_from_spec(spec)
sys.modules["agentos_guard"] = mod
spec.loader.exec_module(mod)
RULES = mod.load_rules(HERE / "rules.yaml")


def g(role, mode="block"):
    return mod.Guard(RULES, role, mode)


CURL = 'curl -s -X PATCH "$PAPERCLIP_API_URL/api/issues/abc" -H "Authorization: Bearer $PAPERCLIP_API_KEY" -d \'{"status":"done"}\''


class ChiefRules(unittest.TestCase):
    def setUp(self):
        self.c = g("chief")

    # allowed — chief's own job
    def test_paperclip_curl_allowed(self):
        self.assertIsNone(self.c.evaluate("terminal", {"command": CURL}))

    def test_curl_pipe_python_print_allowed(self):
        self.assertIsNone(self.c.evaluate("terminal", {"command": CURL + " | python -c \"import sys,json;print(json.load(sys.stdin)['id'])\""}))

    # env prefixes / timeout no longer hide the program from the allow list
    def test_env_prefix_does_not_hide_program(self):
        self.assertIsNotNone(self.c.evaluate("terminal", {"command": "PYTHONIOENCODING=utf-8 npm install x"}))
        self.assertIsNotNone(self.c.evaluate("terminal", {"command": "X=1 timeout 60 node build.mjs"}))
        self.assertIsNotNone(self.c.evaluate("terminal", {"command": "HERMES_HOME=\"C:/h\" hermes.exe profile delete -y pc-x"}))
        self.assertIsNone(self.c.evaluate("terminal", {"command": "HERMES_HOME=\"C:/h\" node.exe scripts/hermes-bots.mjs verify all"}))
        self.assertIsNone(self.c.evaluate("terminal", {"command": "RUN=abc curl -s \"$PAPERCLIP_API_URL/api/issues/x\""}))

    # python - <<'PY' (stdin program) gets the same body check as python -c
    def test_python_heredoc_read_only_allowed(self):
        cmd = "cd \"$TMPDIR/x\" && PYTHONIOENCODING=utf-8 python - \"$A\" <<'PY'\nimport json, sys\nd = json.load(open(sys.argv[1], encoding='utf-8'))\nprint(len(d))\nPY"
        self.assertIsNone(self.c.evaluate("terminal", {"command": cmd}))

    def test_python_heredoc_write_outside_scratch_refused(self):
        for body in ("open('C:/x/agent os/src/app.ts','w').write('x')", "import subprocess; subprocess.run(['git','push'])",
                     "import pathlib; pathlib.Path('a.md').write_text('x')", "import sqlite3; c=sqlite3.connect('s.db'); c.execute(\"delete from t\")"):
            self.assertIsNotNone(self.c.evaluate("terminal", {"command": f"PYTHONIOENCODING=utf-8 python - <<'PY'\n{body}\nPY"}), body)

    def test_python_heredoc_write_into_scratch_allowed(self):
        cmd = "cd \"C:/Users/u/AppData/Local/hermes/profiles/pc-1/cache/scratch/HER-1\" && python - <<'PY'\nimport json\njson.dump({}, open('facts.json', 'w'))\nPY"
        self.assertIsNone(self.c.evaluate("terminal", {"command": cmd}))
        self.assertIsNotNone(self.c.evaluate("terminal", {"command": cmd.replace("cache/scratch/HER-1", "workspace")}))
        fcmd = cmd.replace("open('facts.json', 'w')", "open(f\"facts/{k}_now.json\", \"w\")")
        self.assertIsNone(self.c.evaluate("terminal", {"command": fcmd}))
        self.assertIsNotNone(self.c.evaluate("terminal", {"command": cmd.replace("open('facts.json', 'w')", "open('../../../../config.yaml', 'w')")}))

    def test_hire_allowed(self):
        self.assertIsNone(self.c.evaluate("terminal", {"command": "node C:/x/agent os/scripts/hermes-bots.mjs hire --name a --title b --reports-to c --role-file d.md --projects x"}))

    def test_profile_delete_only_through_checked_retire(self):
        # raw delete can remove any bot (working ones, the reviewer, itself) — only `retire` (checks + backup) is open
        self.assertIsNone(self.c.evaluate("terminal", {"command": "node C:/x/agent os/scripts/hermes-bots.mjs retire --profile pc-a243fe69 --yes --reason \"고용 중 실패한 빈 프로필\""}))
        for cmd in ("C:/Users/x/hermes.exe profile delete pc-a243fe69 -y",
                    "HERMES_HOME=C:/h hermes profile delete pc-7686fab2 -y",
                    "rm -rf C:/Users/x/AppData/Local/hermes/profiles/pc-7686fab2"):
            self.assertIsNotNone(self.c.evaluate("terminal", {"command": cmd}), cmd)

    def test_readonly_git_allowed(self):
        for cmd in ("git status", "git log --oneline -5", "git diff --name-only", "git stash list", "ls -la", "rg -n foo docs", "cat docs/plan.md"):
            self.assertIsNone(self.c.evaluate("terminal", {"command": cmd}), cmd)

    def test_plan_md_write_allowed(self):
        self.assertIsNone(self.c.evaluate("write_file", {"path": "C:/Users/x/hermes/profiles/pc-1/workspace/plans/HER-30-plan.md"}))
        self.assertIsNone(self.c.evaluate("patch", {"path": "/c/Users/x/profiles/pc-1/workspace/report.md"}))

    def test_read_tools_untouched(self):
        for tool in ("read_file", "search_files", "web_search", "delegate_task", "memory", "clarify"):
            self.assertIsNone(self.c.evaluate(tool, {"path": "x.py"}), tool)

    # blocked — producing
    def test_code_write_blocked(self):
        for p in ("scripts/x.mjs", "src/App.tsx", "config.yaml", "a.py", "workspace/notes/tool.json"):
            self.assertIsNotNone(self.c.evaluate("write_file", {"path": p, "content": "x"}), p)

    def test_md_outside_workspace_blocked(self):
        self.assertIsNotNone(self.c.evaluate("write_file", {"path": "C:/Users/x/orca/workspaces/agent os/docs/plan.md"}))
        self.assertIsNotNone(self.c.evaluate("patch", {"path": "C:/Users/x/hermes/profiles/pc-1/SOUL.md"}))

    def test_installs_builds_blocked(self):
        for cmd in ("npm install", "npm run build", "npx tsc --noEmit", "pip install requests", "uv pip install x",
                    "docker compose up", "ssh nas ls", "sudo rm -rf /"):
            self.assertIsNotNone(self.c.evaluate("terminal", {"command": cmd}), cmd)

    def test_git_writes_blocked(self):
        for cmd in ("git add -A && git commit -m x", "git push origin main", "git checkout -b f", "git stash"):
            self.assertIsNotNone(self.c.evaluate("terminal", {"command": cmd}), cmd)

    def test_file_mutation_and_redirect_blocked(self):
        for cmd in ("rm -rf node_modules", "mv a b", "cp a b", "echo hi > out.txt", "cat a >> b", "sed -i 's/a/b/' f", "mkdir x"):
            self.assertIsNotNone(self.c.evaluate("terminal", {"command": cmd}), cmd)

    def test_running_arbitrary_scripts_blocked(self):
        for cmd in ("python scripts/deploy.py", "node scripts/setup-chief-of-staff.mjs a b c", "node server/index.mjs"):
            self.assertIsNotNone(self.c.evaluate("terminal", {"command": cmd}), cmd)

    def test_chained_deny_wins_over_allowed_head(self):
        self.assertIsNotNone(self.c.evaluate("terminal", {"command": CURL + " && npm install"}))

    def test_execute_code_blocked(self):
        self.assertIsNotNone(self.c.evaluate("execute_code", {"code": "print(1)"}))

    def test_skill_edit_blocked_but_view_ok(self):
        self.assertIsNotNone(self.c.evaluate("skill_manage", {"operations": [{"name": "chief", "action": "patch"}]}))
        self.assertIsNotNone(self.c.evaluate("skill_manage", {"action": "create", "name": "x"}))
        self.assertIsNone(self.c.evaluate("skill_view", {"name": "chief"}))

    # --- false positives observed in the first live run (HER-24) ---
    def test_git_dash_C_readonly_allowed(self):
        self.assertIsNone(self.c.evaluate("terminal", {"command": 'git -C "C:/Users/tahar/orca/workspaces/agent os" status --short | head -n 3'}))
        self.assertIsNotNone(self.c.evaluate("terminal", {"command": 'git -C "C:/x/agent os" commit -am x'}))

    def test_payload_text_does_not_trigger_deny(self):
        body = '{"status":"done","comment":"3번 npm --version 은 차단됨. git commit 도 안 함. rm -rf 언급"}'
        self.assertIsNone(self.c.evaluate("terminal", {"command": f'curl -s -X PATCH "$PAPERCLIP_API_URL/api/issues/x" -H "Content-Type: application/json" -d \'{body}\''}))

    def test_heredoc_body_is_data(self):
        cmd = 'curl -s -X POST "$PAPERCLIP_API_URL/api/issues/x/comments" -H "Content-Type: application/json" --data-binary @- <<\'EOF\'\n{"body":"npm install 과 git push 는 막혔습니다\\nrm -rf 도"}\nEOF'
        self.assertIsNone(self.c.evaluate("terminal", {"command": cmd}))

    def test_scratch_json_write_allowed(self):
        self.assertIsNone(self.c.evaluate("write_file", {"path": "C:/Users/tahar/AppData/Local/hermes/profiles/pc-ebb0943f/cache/scratch/her24-comment.json"}))
        self.assertIsNone(self.c.evaluate("write_file", {"path": "C:/Users/x/profiles/pc-1/workspace/HER-24-evidence/before.json"}))
        self.assertIsNotNone(self.c.evaluate("write_file", {"path": "C:/x/agent os/docs/x.json"}))

    def test_redirect_into_scratch_allowed_elsewhere_blocked(self):
        self.assertIsNone(self.c.evaluate("terminal", {"command": 'printf \'%s\' \'{"body":"x"}\' > "$TMPDIR/her24/body.json"'}))
        self.assertIsNone(self.c.evaluate("terminal", {"command": "curl -s $PAPERCLIP_API_URL/api/issues/x > C:/Users/x/cache/scratch/issue.json"}))
        self.assertIsNotNone(self.c.evaluate("terminal", {"command": "echo hi > docs/out.md"}))

    def test_inline_python_read_only_allowed_write_blocked(self):
        self.assertIsNone(self.c.evaluate("terminal", {"command": 'python -c "import json,urllib.request;print(json.load(urllib.request.urlopen(\'http://x\'))[\'id\'])"'}))
        self.assertIsNone(self.c.evaluate("terminal", {"command": 'python -c "import os,json,urllib.request\\nb=\'## 보고\\nnpm 차단됨\'\\nreq=urllib.request.Request(os.environ[\'PAPERCLIP_API_URL\']+\'/api/x\',data=json.dumps({\'body\':b}).encode(),method=\'POST\')\\nprint(urllib.request.urlopen(req).status)"'}))
        self.assertIsNotNone(self.c.evaluate("terminal", {"command": 'python -c "import subprocess;subprocess.run([\'npm\',\'install\'])"'}))
        self.assertIsNotNone(self.c.evaluate("terminal", {"command": 'python -c "open(\'x.mjs\',\'w\').write(\'1\')"'}))
        self.assertIsNotNone(self.c.evaluate("terminal", {"command": 'python -c "import os;os.system(\'git push\')"'}))

    def test_shell_escape_blocked(self):
        for cmd in ('bash -c "npm install"', "powershell -Command \"git push\"", 'wsl -d Ubuntu -- bash -lc "rm -rf x"', 'cmd /c "del x"'):
            self.assertIsNotNone(self.c.evaluate("terminal", {"command": cmd}), cmd)

    def test_variable_assignment_lines_allowed(self):
        self.assertIsNone(self.c.evaluate("terminal", {"command": 'RUN=abc; ISSUE=def\ncurl -s "$PAPERCLIP_API_URL/api/issues/$ISSUE" -H "X-Paperclip-Run-Id: $RUN"'}))

    # --- false positives observed in the second live run (HER-25): JS arrows inside node -e looked like redirects ---
    def test_node_e_arrow_functions_not_redirects(self):
        cmd = 'curl -s "$PAPERCLIP_API_URL/api/issues/x/comments" -H "Authorization: Bearer $K" | node -e "let s=\'\';process.stdin.on(\'data\',d=>s+=d).on(\'end\',()=>{console.log(JSON.parse(s).length)})"'
        self.assertIsNone(self.c.evaluate("terminal", {"command": cmd}))
        cmd2 = 'node -e "const fs=require(\'fs\');const c=fs.readFileSync(\'C:/x/cache/scratch/c.md\',\'utf8\');fetch(process.env.PAPERCLIP_API_URL+\'/api/x\',{method:\'POST\',body:JSON.stringify({body:c})}).then(r=>console.log(r.status))"'
        self.assertIsNone(self.c.evaluate("terminal", {"command": cmd2}))

    def test_node_e_dangerous_blocked(self):
        for code in ("require('child_process').execSync('npm i')", "require('fs').writeFileSync('x.mjs','1')", "process.stdout.write(eval('1'))"):
            self.assertIsNotNone(self.c.evaluate("terminal", {"command": f'node -e "{code}"'}), code)

    def test_quoted_redirect_target_resolved(self):
        self.assertIsNone(self.c.evaluate("terminal", {"command": 'echo x > "C:/Users/x/AppData/Local/hermes/cache/scratch/a.txt"'}))
        self.assertIsNotNone(self.c.evaluate("terminal", {"command": 'echo x > "C:/Users/x/orca/agent os/docs/a.md"'}))


class ChiefTitleRules(unittest.TestCase):
    def setUp(self):
        self.c = g("chief")
        self.url = '"$PAPERCLIP_API_URL/api/companies/db6f5310/issues"'

    def _create(self, title, extra=""):
        return self.c.evaluate("terminal", {"command": f'curl -s -X POST {self.url} -H "Content-Type: application/json" -d \'{{"title":"{title}","assigneeAgentId":"x"{extra}}}\''})

    def test_good_titles_pass(self):
        for t in ("홈페이지 › 가을 발효 클래스 인스타 홍보문구 1개 작성", "AgentOS › 검수봇 도입 › 반려 시험 이슈로 실전 검증",
                  "조직도 › 대시보드 개선팀 구성하기", "학원 › 10월 수강생 후기 3건 정리"):
            self.assertIsNone(self._create(t), t)

    def test_numbered_and_vague_titles_blocked(self):
        for t in ("조직도 › 검수봇-1", "조직도 › 검수봇-1 › 반려시험-1", "요청: 인스타 문구", "AgentOS › 시험",
                  "인스타 홍보문구 1개 작성", "A › B › C › D 를 정리", "홈페이지 › 아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주 긴 제목 작성"):
            r = self._create(t)
            self.assertIsNotNone(r, t); self.assertIn("작업 제목 형식 위반", r)

    def test_block_message_carries_fix_hint(self):
        r = self._create("조직도 › 검수봇-1")
        self.assertIn("예) 홈페이지 › 가을 발효 클래스", r)

    def test_rename_via_patch_checked(self):
        r = self.c.evaluate("terminal", {"command": 'curl -s -X PATCH "$PAPERCLIP_API_URL/api/issues/bb30b4d7-3a72-4d84-ba97-20dfe787725d" -d \'{"title":"조직도 › 검수봇-2"}\''})
        self.assertIsNotNone(r)

    def test_heredoc_body_checked(self):
        cmd = 'curl -s -X POST "$PAPERCLIP_API_URL/api/companies/x/issues" -H "Content-Type: application/json" --data-binary @- <<\'EOF\'\n{"title":"조직도 › 검수봇-3","description":"npm 언급"}\nEOF'
        self.assertIsNotNone(self.c.evaluate("terminal", {"command": cmd}))

    def test_json_body_file_checked_at_write_time(self):
        r = self.c.evaluate("write_file", {"path": "C:/Users/x/AppData/Local/hermes/cache/scratch/issue.json", "content": '{"title":"조직도 › 검수봇-4","description":"x"}'})
        self.assertIsNotNone(r)
        self.assertIsNone(self.c.evaluate("write_file", {"path": "C:/Users/x/AppData/Local/hermes/cache/scratch/issue.json", "content": '{"title":"조직도 › 검수봇 역할 문서 작성"}'}))

    def test_comment_and_document_titles_not_checked(self):
        self.assertIsNone(self.c.evaluate("terminal", {"command": 'curl -s -X POST "$PAPERCLIP_API_URL/api/issues/x/comments" -d \'{"body":"제목 \\"검수봇-1\\" 참고"}\''}))
        self.assertIsNone(self.c.evaluate("terminal", {"command": 'curl -s -X PUT "$PAPERCLIP_API_URL/api/issues/x/documents/review" -d \'{"title":"검수-1","body":"x"}\''}))
        self.assertIsNone(self.c.evaluate("terminal", {"command": 'curl -s -X PATCH "$PAPERCLIP_API_URL/api/issues/x" -d \'{"status":"done"}\''}))

    def test_archived_prefix_skipped(self):
        self.assertIsNone(self._create("[보관] AgentOS › guard-시험-1"))

    def test_reviewer_not_subject_to_title_rules(self):
        r = g("reviewer")
        self.assertIsNone(r.evaluate("terminal", {"command": 'curl -s -X PATCH "$PAPERCLIP_API_URL/api/issues/x" -d \'{"title":"검수봇-1"}\''}))


GOOD_DONE = ("## 완료\\n- 한 일: 인스타 문구 1개 작성\\n- 확인 방법: 글자수 카운트 스크립트로 120자 확인, 해시태그 5개 육안 확인\\n"
             "- 증거: workspace/sns/autumn-ferment.md\\n- 남은 일: 없음")


class EvidenceGate(unittest.TestCase):
    URL = '"$PAPERCLIP_API_URL/api/companies/db6f5310/issues/bb30b4d7-3a72-4d84-ba97-20dfe787725d"'

    def _patch(self, role, body):
        return g(role).evaluate("terminal", {"command": f"curl -s -X PATCH -H \"Authorization: Bearer $K\" -H \"Content-Type: application/json\" {self.URL} -d '{body}'"})

    def test_done_with_full_comment_passes(self):
        for role in ("worker", "chief", "reviewer"):
            self.assertIsNone(self._patch(role, '{"status":"done","comment":"' + GOOD_DONE + '"}'), role)

    def test_done_without_comment_blocked_with_template(self):
        r = self._patch("worker", '{"status":"done","comment":"다 했습니다"}')
        self.assertIsNotNone(r); self.assertIn("누락", r); self.assertIn("- 증거:", r)

    def test_done_missing_evidence_pointer(self):
        bad = GOOD_DONE.replace("workspace/sns/autumn-ferment.md", "잘 됨")
        r = self._patch("worker", '{"status":"done","comment":"' + bad + '"}')
        self.assertIsNotNone(r); self.assertIn("증거", r)

    def test_done_method_is_only_a_claim(self):
        bad = GOOD_DONE.replace("글자수 카운트 스크립트로 120자 확인, 해시태그 5개 육안 확인", "확인했습니다")
        r = self._patch("worker", '{"status":"done","comment":"' + bad + '"}')
        self.assertIsNotNone(r); self.assertIn("결과만 주장", r)

    def test_done_vague_word_blocked(self):
        bad = GOOD_DONE.replace("인스타 문구 1개 작성", "비슷하게 작성")
        r = self._patch("worker", '{"status":"done","comment":"' + bad + '"}')
        self.assertIsNotNone(r); self.assertIn("비슷하게", r)

    def test_remaining_may_be_short(self):
        ok = GOOD_DONE.replace("남은 일: 없음", "남은 일: -")
        self.assertIsNone(self._patch("worker", '{"status":"done","comment":"' + ok + '"}'))

    def test_english_aliases_accepted(self):
        c = "- Done: wrote 1 caption\\n- Verified: ran wc -m, 118 chars\\n- Evidence: workspace/sns/a.md\\n- Remaining: none"
        self.assertIsNone(self._patch("worker", '{"status":"done","comment":"' + c + '"}'))

    def test_non_done_status_not_checked_for_worker(self):
        self.assertIsNone(self._patch("worker", '{"status":"in_progress","comment":"시작합니다"}'))
        self.assertIsNone(self._patch("worker", '{"status":"blocked"}'))

    def test_reviewer_reject_requires_labels(self):
        r = self._patch("reviewer", '{"status":"in_progress","comment":"다시 해주세요"}')
        self.assertIsNotNone(r); self.assertIn("반려", r); self.assertIn("- 위치:", r)
        ok = "## 반려 #1\\n- 위치: autumn-ferment.md 3행\\n- 위반 기준: 해시태그 5개 이상\\n- 수정안: #발효 #가을 추가"
        self.assertIsNone(self._patch("reviewer", '{"status":"in_progress","comment":"' + ok + '"}'))

    def test_heredoc_and_write_file_bodies_checked(self):
        cmd = f"curl -s -X PATCH {self.URL} -d @- <<'EOF'\n{{\"status\":\"done\",\"comment\":\"끝\"}}\nEOF"
        self.assertIsNotNone(g("worker").evaluate("terminal", {"command": cmd}))
        self.assertIsNotNone(g("worker").evaluate("write_file", {"path": "C:/Users/x/AppData/Local/hermes/cache/scratch/b.json", "content": '{"status":"done","comment":"끝"}'}))
        self.assertIsNone(g("worker").evaluate("write_file", {"path": "C:/Users/x/AppData/Local/hermes/cache/scratch/b.json", "content": '{"status":"done","comment":"' + GOOD_DONE + '"}'}))

    def test_heading_style_labels_accepted(self):
        c = ("### 한 일\\n- 문구 1개를 copy 문서에 올렸습니다.\\n\\n### 확인 방법\\n- API로 다시 읽어 len()으로 138자 확인\\n\\n"
             "### 증거\\n- [copy 문서](/HER/issues/HER-30#document-copy) revision 2\\n\\n### 남은 일\\n- 없음")
        self.assertIsNone(self._patch("worker", '{"status":"done","comment":"' + c + '"}'))

    def test_program_that_hides_transition_is_refused(self):
        script = ('import json, urllib.request\\nAPI = "http://127.0.0.1:3100/api"\\n'
                  'data = json.dumps({"status": "done", "comment": comment}).encode()\\n'
                  'urllib.request.urlopen(urllib.request.Request(API + "/issues/" + ISSUE, data=data, method="PATCH"))')
        script = script.replace("\\n", "\n")
        r = g("worker").evaluate("write_file", {"path": "C:/Users/x/AppData/Local/hermes/profiles/p/cache/scratch/her30_done.py", "content": script})
        self.assertIsNotNone(r); self.assertIn("본문이 보이는", r)
        r = g("worker").evaluate("terminal", {"command": "python -c '" + script.replace("\n", ";") + "'"})
        self.assertIsNotNone(r)
        # a script that only READS issues is fine
        ok = 'import urllib.request\nprint(urllib.request.urlopen("http://127.0.0.1:3100/api/issues/x").read())'
        self.assertIsNone(g("worker").evaluate("write_file", {"path": "C:/x/cache/scratch/read.py", "content": ok}))

    def test_comment_text_never_triggers_shape_rules(self):
        c = GOOD_DONE.replace("글자수 카운트 스크립트로", "npm test 와 git push 로")
        self.assertIsNone(self._patch("chief", '{"status":"done","comment":"' + c + '"}'))


class ReviewerRules(unittest.TestCase):
    def setUp(self):
        self.r = g("reviewer")

    def test_verification_commands_allowed(self):
        for cmd in ("npm test", "npm run build", "npx tsc --noEmit", "node --test", "pytest -q", "git log -3", "git diff --name-only HEAD~1", "git stash list",
                    "python -c \"print(len(open('a.md',encoding='utf-8').read()))\"", CURL):
            self.assertIsNone(self.r.evaluate("terminal", {"command": cmd}), cmd)

    def test_evidence_write_allowed(self):
        self.assertIsNone(self.r.evaluate("write_file", {"path": "C:/p/pc-2/workspace/review-evidence/HER-30.md"}))
        self.assertIsNone(self.r.evaluate("write_file", {"path": "C:/p/pc-2/workspace/review-HER-30.md"}))

    def test_retire_not_for_reviewer(self):
        self.assertIsNotNone(self.r.evaluate("terminal", {"command": "node C:/x/agent os/scripts/hermes-bots.mjs retire --profile pc-a243fe69 --yes --reason x"}))

    def test_deliverable_edits_blocked(self):
        for p in ("C:/x/agent os/src/App.tsx", "C:/x/academy/README.md", "C:/p/pc-2/workspace/draft.md"):
            self.assertIsNotNone(self.r.evaluate("patch", {"path": p, "new_string": "x"}), p)

    def test_commits_installs_blocked(self):
        for cmd in ("git commit -am fix", "git push", "git checkout .", "git stash", "npm install lodash", "pip install x",
                    "rm -rf dist", "echo x > a.md", "sed -i 's/a/b/' a.md", "docker ps", "node scripts/hermes-bots.mjs hire --name x"):
            self.assertIsNotNone(self.r.evaluate("terminal", {"command": cmd}), cmd)

    def test_delegate_blocked(self):
        self.assertIsNotNone(self.r.evaluate("delegate_task", {"tasks": []}))


class BudgetAndMode(unittest.TestCase):
    def test_budget_counts_per_session(self):
        rules = {"roles": {"worker": {"budget": {"max_tool_calls": 3}}}}
        w = mod.Guard(rules, "worker", "block")
        for _ in range(3):
            self.assertIsNone(w.evaluate("read_file", {}, "s1"))
        self.assertIn("예산 초과", w.evaluate("read_file", {}, "s1"))
        self.assertIsNone(w.evaluate("read_file", {}, "s2"))  # other session unaffected

    def test_budget_grace_allows_status_report_only(self):
        # T80: after the budget is spent the bot must still be able to leave a comment and mark the issue blocked
        rules = {"roles": {"worker": {"budget": {"max_tool_calls": 2, "report_grace_calls": 2}}}}
        w = mod.Guard(rules, "worker", "block")
        for _ in range(2):
            self.assertIsNone(w.evaluate("read_file", {}, "s1"))
        self.assertIn("예산 초과", w.evaluate("read_file", {}, "s1"))
        comment = "curl -s -X POST http://127.0.0.1:3100/api/issues/0b2c3d4e-1111-2222-3333-444455556666/comments -H 'Content-Type: application/json' -d '{\"body\": \"예산 초과로 멈춤\"}'"
        blocked = "curl -s -X PATCH http://127.0.0.1:3100/api/issues/0b2c3d4e-1111-2222-3333-444455556666 -H 'Content-Type: application/json' -d '{\"status\": \"blocked\"}'"
        done = "curl -s -X PATCH http://127.0.0.1:3100/api/issues/0b2c3d4e-1111-2222-3333-444455556666 -d '{\"status\": \"done\"}'"
        self.assertIsNone(w.evaluate("terminal", {"command": comment}, "s1"))   # grace 1
        self.assertIn("예산 초과", w.evaluate("terminal", {"command": done}, "s1"))  # done is never a grace call
        self.assertIn("예산 초과", w.evaluate("terminal", {"command": "ls"}, "s1"))   # normal work stays blocked
        self.assertIsNone(w.evaluate("terminal", {"command": blocked}, "s1"))   # grace 2
        self.assertIn("예산 초과", w.evaluate("terminal", {"command": comment}, "s1"))  # grace exhausted
        self.assertIn("허용", w.evaluate("read_file", {}, "s1"))  # message names the allowed report path

    def test_budget_resets_after_idle_gap(self):
        rules = {"roles": {"worker": {"budget": {"max_tool_calls": 2, "reset_after_idle_sec": 60}}}}
        w = mod.Guard(rules, "worker", "block")
        for _ in range(2):
            self.assertIsNone(w.evaluate("read_file", {}, "s1"))
        self.assertIn("예산 초과", w.evaluate("read_file", {}, "s1"))
        w._last_call["s1"] -= 120  # simulate a new run after a 2-minute gap
        self.assertIsNone(w.evaluate("read_file", {}, "s1"))

    def test_warn_mode_logs_but_passes(self):
        with tempfile.TemporaryDirectory() as d:
            log = Path(d) / "guard.jsonl"
            c = mod.Guard(RULES, "chief", "warn", log)
            self.assertIsNone(c.decide("terminal", {"command": "npm install"}, "s"))
            self.assertEqual(len(log.read_text(encoding="utf-8").splitlines()), 1)
            self.assertIn('"mode": "warn"', log.read_text(encoding="utf-8"))

    def test_block_mode_returns_hook_shape(self):
        with tempfile.TemporaryDirectory() as d:
            c = mod.Guard(RULES, "chief", "block", Path(d) / "g.jsonl")
            out = c.decide("terminal", {"command": "npm install"}, "s")
            self.assertEqual(out["action"], "block")
            self.assertIn("[agentos-guard]", out["message"])

    def test_bad_role_or_mode(self):
        with self.assertRaises(ValueError):
            mod.Guard(RULES, "ceo", "block")
        with self.assertRaises(ValueError):
            mod.Guard(RULES, "chief", "audit")

    def test_worker_role_is_permissive(self):
        w = g("worker")
        self.assertIsNone(w.evaluate("terminal", {"command": "npm install && git commit -am x"}))
        self.assertIsNone(w.evaluate("write_file", {"path": "src/x.ts"}))


BAD_DONE = '{"status":"done","comment":"완료"}'
GOOD_DONE_JSON = '{"status":"done","comment":"' + GOOD_DONE + '"}'
UUID = "bb30b4d7-3a72-4d84-ba97-20dfe787725d"


class WorkerHoles(unittest.TestCase):
    """The four ways past the evidence gate found on 2026-10-01, plus the program-hidden transitions the replay
    of real worker calls surfaced. Each hole has a passing counterpart so the fix cannot become a blanket ban."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name) / "hermes" / "profiles" / "pc-me"
        (self.home / "cache" / "scratch").mkdir(parents=True)
        self.w = mod.Guard(RULES, "worker", "block", None, self.home)

    def tearDown(self):
        self.tmp.cleanup()

    def t(self, cmd, workdir=None):
        a = {"command": cmd}
        if workdir:
            a["workdir"] = workdir
        return self.w.evaluate("terminal", a)

    # hole 1: issue key instead of uuid
    def test_issue_key_url_checked(self):
        self.assertIn("완료 댓글 형식 위반", self.t(f"curl -s -X PATCH \"$PAPERCLIP_API_URL/api/issues/HER-38\" -d '{BAD_DONE}'"))
        self.assertIsNone(self.t(f"curl -s -X PATCH \"$PAPERCLIP_API_URL/api/issues/HER-38\" -d '{GOOD_DONE_JSON}'"))

    # hole 2: query / fragment tail
    def test_query_tail_url_checked(self):
        self.assertIsNotNone(self.t(f"curl -s -X PATCH \"$PAPERCLIP_API_URL/api/issues/{UUID}?x=1\" -d '{BAD_DONE}'"))
        self.assertIsNotNone(self.t(f"curl -s -X PATCH '$PAPERCLIP_API_URL/api/issues/{UUID}#a' --data-raw '{BAD_DONE}'"))
        self.assertIsNone(self.t(f"curl -s -X PATCH \"$PAPERCLIP_API_URL/api/issues/{UUID}?x=1\" -d '{GOOD_DONE_JSON}'"))

    # hole 3: body the gate cannot read
    def test_opaque_body_refused(self):
        for body in ('"$B"', "$B", '"$(cat done.json)"', "@-", '@"$F"'):
            r = self.t(f"curl -s -X PATCH \"$PAPERCLIP_API_URL/api/issues/{UUID}\" -d {body}")
            self.assertIsNotNone(r, body)
            self.assertIn("확인할 수 없습니다", r, body)

    def test_heredoc_and_existing_file_bodies_pass(self):
        self.assertIsNone(self.t(f"curl -s -X PATCH \"$PAPERCLIP_API_URL/api/issues/{UUID}\" --data-binary @- <<'EOF'\n{GOOD_DONE_JSON}\nEOF"))
        f = self.home / "cache" / "scratch" / "done.json"
        f.write_text(GOOD_DONE_JSON, encoding="utf-8")
        # absolute, $TMPDIR-relative, and cd-relative @file all resolve to the same checked file
        self.assertIsNone(self.t(f"curl -s -X PATCH \"$PAPERCLIP_API_URL/api/issues/{UUID}\" --data-binary @\"{f.as_posix()}\""))
        self.assertIsNone(self.t(f"curl -s -X PATCH \"$PAPERCLIP_API_URL/api/issues/{UUID}\" --data-binary @\"$TMPDIR/done.json\""))
        self.assertIsNone(self.t(f"cd \"$TMPDIR\" && curl -s -X PATCH \"$PAPERCLIP_API_URL/api/issues/{UUID}\" --data-binary @done.json"))
        f.write_text(BAD_DONE, encoding="utf-8")
        self.assertIn("완료 댓글 형식 위반", self.t(f"cd \"$TMPDIR\" && curl -s -X PATCH \"$PAPERCLIP_API_URL/api/issues/{UUID}\" -d @done.json"))

    def test_heredoc_mid_line_bodies_checked(self):
        # Real worker calls from the 2026-10-01 r2 run: the heredoc opener is followed by more options, a pipe,
        # or a second command after the terminator — valid bash, so the body must be read, not called opaque.
        url = f"\"$PAPERCLIP_API_URL/api/issues/{UUID}\""
        shapes = (
            "curl -s -X PATCH {u} --data-binary @- <<'EOF' -o \"$TMPDIR/r.json\"\n{b}\nEOF\nnode -e \"console.log(1)\"",
            "curl -s -X PATCH {u} --data-binary @- <<'EOF' | node -e \"let s='';process.stdin.on('data',d=>s+=d)\"\n{b}\nEOF",
            "curl -s -o \"$TMPDIR/r.json\" -X PATCH {u} --data-binary @- <<EOF\n{b}\nEOF\nnode -e \"console.log(2)\"",
        )
        for sh in shapes:
            self.assertIsNone(self.t(sh.format(u=url, b=GOOD_DONE_JSON)), sh[:60])
            self.assertIn("완료 댓글 형식 위반", self.t(sh.format(u=url, b=BAD_DONE)) or "", sh[:60])

    def test_file_made_in_same_command_refused(self):
        f = self.home / "cache" / "scratch" / "p.json"
        f.write_text(GOOD_DONE_JSON, encoding="utf-8")  # stale good copy on disk — the new one is written unseen
        r = self.t(f"cd \"$TMPDIR\" && python mk.py && curl -s -X PATCH \"$PAPERCLIP_API_URL/api/issues/{UUID}\" -d @p.json")
        self.assertIn("방금 만든 파일", r)
        self.assertIsNone(self.t(f"cd \"$TMPDIR\" && ls && curl -s -X PATCH \"$PAPERCLIP_API_URL/api/issues/{UUID}\" -d @p.json"))

    def test_url_hidden_in_variable_refused(self):
        self.assertIsNotNone(self.t(f"U=$PAPERCLIP_API_URL/api/issues/{UUID}; curl -s -X PATCH \"$U\" -d '{BAD_DONE}'"))

    # hole 4: non-curl HTTP clients
    def test_other_http_clients_refused(self):
        for c in (f"wget --method=PATCH --body-data='{BAD_DONE}' \"$PAPERCLIP_API_URL/api/issues/{UUID}\"",
                  f"http PATCH \"$PAPERCLIP_API_URL/api/issues/{UUID}\" status=done",
                  f"Invoke-RestMethod -Method Patch -Uri \"$env:PAPERCLIP_API_URL/api/issues/{UUID}\" -Body $b"):
            self.assertIn("curl만", self.t(c), c)
        self.assertIsNone(self.t("wget -q https://example.com/photo.jpg -O \"$TMPDIR/p.jpg\""))

    # program-hidden transitions (real calls from 2026-10-01)
    def test_program_transitions_refused(self):
        js = "node -e 'const b={status:\"done\",comment:c};fetch(process.env.PAPERCLIP_API_URL+\"/api/issues/x\",{method:\"PATCH\",body:JSON.stringify(b)})'"
        self.assertIsNotNone(self.t(js))
        py = "python - <<'EOF'\nimport json,urllib.request,os\nd=json.dumps({\"status\":\"done\",\"comment\":c})\nurllib.request.urlopen(os.environ['PAPERCLIP_API_URL']+'/api/issues/x')\nEOF"
        self.assertIn("heredoc 프로그램", self.t(py))
        s = self.home / "cache" / "scratch" / "her30_done.py"
        s.write_text("import requests\nrequests.patch(API+'/api/issues/x', json={'status': 'done', 'comment': c})\n", encoding="utf-8")
        self.assertIn("스크립트 her30_done.py", self.t(f"python \"{s.as_posix()}\""))
        self.assertIsNotNone(self.w.evaluate("execute_code", {"code": "requests.patch(os.environ['PAPERCLIP_API_URL']+'/api/issues/x', json={'status':'done','comment':'ok'})"}))

    def test_programs_without_transition_pass(self):
        self.assertIsNone(self.t("python - <<'EOF'\nprint(len(open('draft.md',encoding='utf-8').read()))\nEOF"))
        self.assertIsNone(self.w.evaluate("execute_code", {"code": "import json\nprint(json.load(open('resp.json'))['status'])"}))
        self.assertIsNone(self.t("node -e 'console.log(JSON.parse(require(\"fs\").readFileSync(0)).status)' < resp.json"))


class WorkerHardStops(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name) / "hermes" / "profiles"
        self.home = root / "pc-me"
        (self.home / "skills" / "productivity" / "my-skill").mkdir(parents=True)
        (self.home / "skills" / "productivity" / "my-skill" / "SKILL.md").write_text("x", encoding="utf-8")
        self.other = (root / "pc-other").as_posix()
        self.w = mod.Guard(RULES, "worker", "block", None, self.home)

    def tearDown(self):
        self.tmp.cleanup()

    def t(self, cmd):
        return self.w.evaluate("terminal", {"command": cmd})

    def test_destructive_commands_refused(self):
        for c in ("rm -rf workspace/guard-drill/old", "rm -r old", "rm -fr ./x", "Remove-Item old -Recurse -Force",
                  "rmdir /s /q old", "git push --force origin main", "git push -f", "git push origin +main",
                  "git reset --hard HEAD~1", "git -C repo reset --hard", "git clean -fd", "git checkout -- .",
                  "git branch -D feature", "rm guard-drill/test.sqlite", "del data\\db.sqlite3"):
            self.assertIsNotNone(self.t(c), c)

    def test_everyday_commands_pass(self):
        for c in ("rm -f \"$TMPDIR/resp.json\"", "rm her34_r2_before.txt", "git status", "git commit -am 'x'",
                  "git push origin team/x", "git checkout -b team/x", "git reset HEAD file.txt", "npm install",
                  "npm test", "mkdir -p workspace/out", "cp a.md b.md", "hermes -p pc-me chat -q hi"):
            self.assertIsNone(self.t(c), c)

    def test_self_unlock_refused(self):
        for c in ("hermes -p pc-me config set plugins.enabled []", "hermes plugins disable agentos-guard",
                  "hermes gateway restart", "hermes auth reset openai-codex",
                  "node scripts/hermes-bots.mjs guard --profile pc-me --role worker --mode warn",
                  f"sed -i 's/block/warn/' \"{self.home.as_posix()}/config.yaml\"",
                  "echo '' > hermes-plugins/agentos-guard/rules.yaml"):
            self.assertIsNotNone(self.t(c), c)
        for p in (f"{self.home.as_posix()}/config.yaml", f"{self.home.as_posix()}/SOUL.md",
                  f"{self.home.as_posix()}/plugins/agentos-guard/rules.yaml",
                  "C:/x/agent os/hermes-plugins/agentos-guard/__init__.py"):
            self.assertIsNotNone(self.w.evaluate("write_file", {"path": p, "content": "x"}), p)
            self.assertIsNotNone(self.w.evaluate("patch", {"path": p, "old_string": "a", "new_string": "b"}), p)

    def test_other_bot_area_refused(self):
        self.assertIsNotNone(self.w.evaluate("write_file", {"path": f"{self.other}/SOUL.md", "content": "x"}))
        self.assertIsNotNone(self.w.evaluate("write_file", {"path": f"{self.other}/cache/scratch/a.md", "content": "x"}))
        self.assertIsNotNone(self.t(f"cp a.md \"{self.other}/skills/x/SKILL.md\""))
        self.assertIsNotNone(self.w.evaluate("skill_manage", {"operations": [{"action": "patch", "name": "kmastercook-blog-titles", "old_string": "a", "new_string": "b"}]}))
        self.assertIsNotNone(self.w.evaluate("execute_code", {"code": f"open('{self.other}/SOUL.md','a').write('x')"}))

    def test_own_area_passes(self):
        me = self.home.as_posix()
        self.assertIsNone(self.w.evaluate("write_file", {"path": f"{me}/cache/scratch/her40/done.json", "content": "{}"}))
        self.assertIsNone(self.w.evaluate("skill_manage", {"operations": [{"action": "patch", "name": "my-skill", "old_string": "a", "new_string": "b"}]}))
        self.assertIsNone(self.w.evaluate("skill_manage", {"action": "create", "name": "new-skill", "content": "x"}))
        self.assertIsNone(self.w.evaluate("write_file", {"path": "C:/x/agent os/src/app.ts", "content": "x"}))

    def test_secrets_refused(self):
        for c in (f"cat \"{self.home.as_posix()}/.env\"", "type C:\\Users\\x\\AppData\\Local\\hermes\\auth.json",
                  "grep KEY .env", "Get-Content .env.local", "cp .env backup.txt", "cat ~/.git-credentials"):
            self.assertIsNotNone(self.t(c), c)
        self.assertIsNotNone(self.w.evaluate("read_file", {"path": f"{self.home.as_posix()}/.env"}))
        self.assertIsNotNone(self.w.evaluate("read_file", {"path": "C:/Users/x/AppData/Local/hermes/auth.json"}))
        self.assertIsNotNone(self.w.evaluate("execute_code", {"code": "print(open('C:/x/hermes/auth.json').read())"}))

    def test_secret_lookalikes_pass(self):
        self.assertIsNone(self.t("cat .env.example"))
        self.assertIsNone(self.w.evaluate("read_file", {"path": "docs/environment.md"}))
        self.assertIsNone(self.w.evaluate("execute_code", {"code": "import os\nprint(os.environ['PAPERCLIP_API_URL'])"}))
        self.assertIsNone(self.t("node -e 'console.log(process.env.PAPERCLIP_API_URL)'"))
        self.assertIsNone(self.t('curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" "$PAPERCLIP_API_URL/api/issues/x"'))
        self.assertIsNone(self.t('echo "$PAPERCLIP_API_URL"'))
        self.assertIsNone(self.t('echo "API KEY set: ${PAPERCLIP_API_KEY:+yes}"'))

    def test_secret_value_never_written_out(self):
        fake = "pcp_drill_" + "9" * 30
        (self.home / ".env").write_text(f"PAPERCLIP_API_KEY={fake}\nPAPERCLIP_API_URL=http://127.0.0.1:3100\n", encoding="utf-8")
        with tempfile.TemporaryDirectory() as d:
            log = Path(d) / "g.jsonl"
            w = mod.Guard(RULES, "worker", "block", log, self.home)
            out = w.decide("terminal", {"command": f"curl -s -X POST \"$PAPERCLIP_API_URL/api/issues/x/comments\" -d '{{\"body\":\"키: {fake}\"}}'"}, "s")
            self.assertIsNotNone(out)
            self.assertNotIn(fake, log.read_text(encoding="utf-8"))  # the guard log itself must not leak it
            self.assertIsNotNone(w.evaluate("write_file", {"path": "workspace/post.md", "content": f"key={fake}"}))
            for c in ("echo $PAPERCLIP_API_KEY", 'echo "$PAPERCLIP_API_KEY"', "printenv", "env", 'printf "%s" "${OPENAI_API_KEY}"'):
                self.assertIsNotNone(w.evaluate("terminal", {"command": c}), c)

    def test_other_roles_unchanged(self):
        # chief/reviewer keep their own rules — the worker hardening is opt-in per role
        c = mod.Guard(RULES, "chief", "block", None, self.home)
        self.assertIsNone(c.evaluate("terminal", {"command": f"curl -s -X PATCH \"$PAPERCLIP_API_URL/api/issues/HER-38\" -d '{BAD_DONE}'"}))

class SecretReadAllRoles(unittest.TestCase):
    """T72 (2026-10 audit): secret-file reads are refused for chief, reviewer and worker alike, including renamed
    copies, globs, 8.3 short names, symlinks and WSL/MSYS path spellings. Every case has a passing counterpart."""

    DUMMY = "DUMMY_NOT_A_SECRET_" + "7" * 24

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.home = root / "hermes" / "profiles" / "pc-me"
        (self.home / "cache" / "scratch").mkdir(parents=True)
        (self.home / ".env").write_text(f"PAPERCLIP_API_KEY={self.DUMMY}\nPAPERCLIP_API_URL=http://127.0.0.1:3100\n", encoding="utf-8")
        self.work = root / "work"
        (self.work / "docs").mkdir(parents=True)
        (self.work / ".env").write_text(f"X_TOKEN={self.DUMMY}\n", encoding="utf-8")
        (self.work / "auth.json").write_text("{}", encoding="utf-8")
        (self.work / "notes.txt").write_text(f"copied: {self.DUMMY}\n", encoding="utf-8")   # renamed copy of a secret
        (self.work / "README.md").write_text("hello", encoding="utf-8")
        (self.work / ".env.example").write_text("X_TOKEN=\n", encoding="utf-8")
        for i in range(25):
            (self.work / "docs" / f"p{i}.md").write_text("doc", encoding="utf-8")
        self.symlink = None
        try:
            (self.work / "link.txt").symlink_to(self.work / ".env")
            self.symlink = self.work / "link.txt"
        except OSError:  # no symlink privilege on this Windows account: the symlink case is skipped
            pass
        self.g = {r: mod.Guard(RULES, r, "block", None, self.home) for r in ("chief", "reviewer", "worker")}

    def tearDown(self):
        self.tmp.cleanup()

    def t(self, role, cmd):
        return self.g[role].evaluate("terminal", {"command": cmd, "workdir": self.work.as_posix()})

    def r(self, role, path):
        return self.g[role].evaluate("read_file", {"path": path})

    def blocked_shapes(self):
        w = self.work.as_posix()
        mnt = "/mnt/" + w[0].lower() + w[2:] if w[1] == ":" else w
        msys = "/" + w[0].lower() + w[2:] if w[1] == ":" else w
        win = str(self.work).replace("/", "\\")
        shapes = [
            "cat .env", "cat .ENV", "cat ./.Env", "grep TOKEN .env", "head -c 40 .env",
            "cat .e*", "cat ./.e?v", "cat .[e]nv",                        # globs
            "cat notes.txt", f"cat {w}/notes.txt", "cat note*.txt",       # renamed copy (content)
            "cat ENV~1", "type AUTH~1.JSO",                               # 8.3 short names
            f"cat {mnt}/.env", f"cat {msys}/notes.txt", f"type {win}\\.env",   # path spellings
            "cat auth.json",
        ]
        if self.symlink:
            shapes.append("cat link.txt")
        return shapes

    def test_terminal_reads_blocked_every_role(self):
        for role in ("chief", "reviewer", "worker"):
            for c in self.blocked_shapes():
                self.assertIsNotNone(self.t(role, c), f"{role}: {c}")

    def test_read_tool_blocked_every_role(self):
        w = self.work.as_posix()
        for role in ("chief", "reviewer", "worker"):
            for p in (f"{w}/.env", f"{w}/.ENV", f"{w}/notes.txt", str(self.work / "notes.txt"), f"{w}/auth.json",
                      f"{self.home.as_posix()}/.env"):
                self.assertIsNotNone(self.r(role, p), f"{role}: {p}")

    def test_copy_and_rename_blocked(self):
        for role in ("reviewer", "worker"):
            for c in ("cp .env x.txt", "mv .env x.txt", "copy .env x.txt", "ren .env x.txt", "ln -s .env x.txt"):
                self.assertIsNotNone(self.t(role, c), f"{role}: {c}")

    def test_normal_reads_pass(self):
        w = self.work.as_posix()
        for role in ("chief", "reviewer", "worker"):
            for c in ("cat README.md", "cat .env.example", "ls", "cat docs/*.md", "grep -n hello README.md"):
                self.assertIsNone(self.t(role, c), f"{role}: {c}")
            self.assertIsNone(self.r(role, f"{w}/README.md"), role)
            self.assertIsNone(self.r(role, f"{w}/docs/p1.md"), role)

    def test_glob_json_needs_credential_keys(self):
        loc = self.work / "locales" / "ko"
        loc.mkdir(parents=True)
        (loc / "auth.json").write_text('{"login": "로그인", "password": "비밀번호", "token": "인증 토큰을 입력하세요"}', encoding="utf-8")
        (loc / "common.json").write_text('{"ok": "확인"}', encoding="utf-8")
        for role in ("chief", "reviewer", "worker"):
            self.assertIsNone(self.t(role, "cat locales/ko/*.json"), role)
        (self.work / "auth.json").write_text('{"access_token": "DUMMY_NOT_A_SECRET_0000000000"}', encoding="utf-8")
        for role in ("chief", "reviewer", "worker"):
            self.assertIsNotNone(self.t(role, "cat *.json"), role)

    def test_chief_runs_repo_scripts_that_manage_env(self):
        script = self.work / "bots.mjs"
        script.write_text("const f = path.join(home, '.env'); // writes the bot key", encoding="utf-8")
        self.assertIsNone(self.t("reviewer", f"node {script.as_posix()} status"))
        self.assertIsNotNone(self.t("worker", f"node {script.as_posix()} status"))

    def test_basic_role_only_hard_stops(self):
        b = mod.Guard(RULES, "basic", "block", None, self.home)
        t = lambda c: b.evaluate("terminal", {"command": c, "workdir": self.work.as_posix()})
        for c in ("cat .env", "cat notes.txt", "cat .e*", "ssh nas", "docker ps", 'bash -c "ssh nas uptime"',
                  "wsl -d Ubuntu -- docker ps", "scp a nas:/x", "plink.exe nas"):
            self.assertIsNotNone(t(c), c)
        self.assertIsNotNone(b.evaluate("read_file", {"path": (self.work / "notes.txt").as_posix()}))
        for c in ("rm -rf build", "bash -c 'npm test'", "wsl -d Ubuntu -- bash run.sh", "rm data/test.db", "env | sort",
                  "git push origin main", "cat README.md", "hermes config set x y", "ls ~/projects/sshtools-notes",
                  'echo "build like a Docker context"', "echo '--- docker'", "grep -rl --include='*.json' abc docs"):
            self.assertIsNone(t(c), c)

    def test_board_only_urls_refused_for_every_bot(self):
        # local_trusted Paperclip treats a key-less request as the boss: no bot may hire/approve/grant from a terminal
        bad = ['curl -s -X POST "$PAPERCLIP_API_URL/api/companies/abc/agent-hires" -d \'{"name":"x"}\'',
               "curl -s -X POST http://127.0.0.1:3100/api/approvals/123/approve",
               'curl -s -X PATCH "$PAPERCLIP_API_URL/api/agents/abc/permissions" -d \'{"canCreateAgents":true}\'',
               "curl -s -X PATCH http://127.0.0.1:3100/api/companies/db6f -d '{\"requireBoardApprovalForNewAgents\":false}'"]
        ok = ['curl -s "$PAPERCLIP_API_URL/api/companies/abc/agents"',
              'curl -s -X POST "$PAPERCLIP_API_URL/api/issues/x/comments" -d \'{"body":"agent-hires 는 비서실장만 씁니다"}\'']
        basic = mod.Guard(RULES, "basic", "block", None, self.home)
        for role in ("chief", "reviewer", "worker", "basic"):
            g = basic if role == "basic" else self.g[role]
            for c in bad:
                self.assertIsNotNone(g.evaluate("terminal", {"command": c}), f"{role}: {c}")
        for role in ("reviewer", "worker", "basic"):
            g = basic if role == "basic" else self.g[role]
            for c in ok:
                self.assertIsNone(g.evaluate("terminal", {"command": c}), f"{role}: {c}")

    def test_worker_remote_shell_and_containers_blocked(self):
        for c in ("ssh nas", "scp a.tar user@nas:/tmp", "rsync -a dist/ nas:/x", "docker ps", "docker-compose up -d",
                  "sftp nas", "plink nas"):
            self.assertIsNotNone(self.t("worker", c), c)
        for c in ('git commit -m "docker 설정 문서 정리"', "ls ~/projects", "npm test"):
            self.assertIsNone(self.t("worker", c), c)


class ReadRootsAllRoles(unittest.TestCase):
    """W4-X1 / W6-X2 (2026-10-07 follow-up): read tools judge the real location against an allow list of roots, and
    the NAS deployment notes in a Hermes skills folder are protected files for every bot role."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.hermes = root / "hermes"
        self.home = self.hermes / "profiles" / "pc-me"
        (self.home / "cache" / "scratch").mkdir(parents=True)
        (self.home / "notes.md").write_text("bot notes", encoding="utf-8")
        nas = self.hermes / "skills" / "devops" / "nas-docker-deployment"
        (nas / "references").mkdir(parents=True)
        (nas / "SKILL.md").write_text("deploy steps", encoding="utf-8")
        (nas / "references" / "deploy-notes.md").write_text("DUMMY_NOT_A_SECRET", encoding="utf-8")
        self.nas = nas
        self.g = {r: mod.Guard(RULES, r, "block", None, self.home) for r in ("chief", "reviewer", "worker")}

    def tearDown(self):
        self.tmp.cleanup()

    def test_reads_inside_roots_pass(self):
        for role, g in self.g.items():
            for p in (self.home / "notes.md", self.nas / "SKILL.md"):
                self.assertIsNone(g.evaluate("read_file", {"path": p.as_posix()}), f"{role}: {p}")

    def test_nas_reference_notes_refused(self):
        p = (self.nas / "references" / "deploy-notes.md").as_posix()
        for role, g in self.g.items():
            self.assertIsNotNone(g.evaluate("read_file", {"path": p}), role)

    def test_location_outside_roots_refused(self):
        win = Path(os.environ.get("SystemRoot", "C:/Windows")) / "win.ini"
        if not win.exists():
            self.skipTest("no file outside the read roots on this machine")
        for role, g in self.g.items():
            self.assertIsNotNone(g.evaluate("read_file", {"path": win.as_posix()}), role)


class WorkerProgramAllowList(unittest.TestCase):
    """W6-X1 (2026-10-07 follow-up): a worker's terminal may start only programs on roles.worker.terminal.allow_programs.
    Names are compared after quotes, folder, .exe and case are normalised. Everyday shapes from real sessions pass."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.home = root / "hermes" / "profiles" / "pc-me"
        (self.home / "cache" / "scratch").mkdir(parents=True)
        self.work = root / "work"
        (self.work / "env" / "tools").mkdir(parents=True)
        (self.work / "env" / "setenv.sh").write_text('export VPY="$AWENV/venv/Scripts/python.exe"\n', encoding="utf-8")
        (self.work / "env" / "tools" / "runlog.sh").write_text('runlog() {\n  "$@"\n}\nprogress() {\n  echo "$@"\n}\n',
                                                                encoding="utf-8")
        self.w = mod.Guard(RULES, "worker", "block", None, self.home)

    def tearDown(self):
        self.tmp.cleanup()

    def t(self, cmd):
        return self.w.evaluate("terminal", {"command": cmd, "workdir": self.work.as_posix()})

    def test_everyday_commands_pass(self):
        for c in ("git status", "npm test 2>&1 | tail -5", "npx tsc --noEmit", "node scripts/build.mjs",
                  'git commit -m "docker 설정 문서 정리"', "python -m unittest", 'cd "docs" 2>/dev/null && ls',
                  '"C:/Program Files/nodejs/node.exe" -v', "NODE.EXE -v", "command -v ffprobe || echo none",
                  'for f in *.md; do n=$(basename "$f" .md); echo "$n"; done', "(rmdir old 2>/dev/null || true)",
                  'curl -s "$PAPERCLIP_API_URL/api/health" \\\n  -H "Accept: application/json"',
                  "# 확인용 메모\nls", "wsl -l -v", 'FP="${FFPROBE:-ffprobe}"; "$FP" -v error x.mp4',
                  'grep -n "a\\"b\\|c" README.md', 'echo "$(date +%F)"'):
            self.assertIsNone(self.t(c), c)

    def test_sourced_functions_and_variables_pass(self):
        c = ('. env/setenv.sh && . env/tools/runlog.sh && progress x start && '
             'runlog x 01 step -- "$VPY" tools/a.py && "$VPY" -c "print(1)"')
        self.assertIsNone(self.t(c))

    def test_program_not_on_list_refused(self):
        for c in ("make build", "MAKE.EXE build", '"C:/tools/make.exe" build', "ls && make build",
                  'echo "$(make -v)"', "runlog x 01 step -- make build"):
            self.assertIsNotNone(self.t(". env/tools/runlog.sh && " + c if c.startswith("runlog") else c), c)

    def test_program_from_unset_variable_refused(self):
        self.assertIsNotNone(self.t('"$TOOL" build'))

    def test_chief_and_reviewer_unchanged(self):
        # the allow list is worker-only; chief/reviewer keep their own regex allow lists
        self.assertIsNone(mod.Guard(RULES, "reviewer", "block").evaluate("terminal", {"command": "make build"}))


class P1WritingRules(unittest.TestCase):
    """P1 (2026-10-07): the bots' instructions now say exactly what the guard does — comments/documents may go through
    Python urllib, status changes must be a visible curl body; the reviewer's single comment form passes."""
    URL = '"$PAPERCLIP_API_URL/api/issues/HER-1"'

    def _py(self, payload, method, path):
        return ("python - <<'PY'\nimport json,urllib.request,os\n"
                f"b=json.dumps({payload},ensure_ascii=False).encode('utf-8')\n"
                f"urllib.request.urlopen(urllib.request.Request(os.environ['PAPERCLIP_API_URL']+'{path}',data=b,method='{method}'))\nPY")

    def test_urllib_comment_and_document_pass(self):
        for role in ("worker", "chief", "reviewer"):
            self.assertIsNone(g(role).evaluate("terminal", {"command": self._py("{'body':'중간 보고: 초안 작성 중'}", "POST", "/api/issues/HER-1/comments")}), role)
            self.assertIsNone(g(role).evaluate("terminal", {"command": self._py("{'title':'review','format':'markdown','body':'표'}", "PUT", "/api/issues/HER-1/documents/review")}), role)

    def test_urllib_status_change_blocked(self):
        for role in ("worker", "chief", "reviewer"):
            for st in ("done", "in_progress"):  # the guard comment-checks these two; blocked is not gated
                self.assertIsNotNone(g(role).evaluate("terminal", {"command": self._py(f"{{'status':'{st}','comment':'x'}}", "PATCH", "/api/issues/HER-1")}), f"{role} {st}")

    def test_prewritten_file_status_change_passes(self):
        import json as _j, tempfile
        from pathlib import Path as _P
        d = _P(tempfile.mkdtemp())
        f = d / "done.json"
        f.write_text(_j.dumps({"status": "done", "comment": "## 완료\n- 한 일: 문서 instagram 저장\n- 확인 방법: GET으로 다시 읽어 줄 수를 셈\n"
                                "- 증거: 문서 instagram revision 9410b535\n- 남은 일: 없음"}, ensure_ascii=False), encoding="utf-8")
        cmd = f"curl -s -X PATCH {self.URL} -H \"Content-Type: application/json\" --data-binary @{f.as_posix()}"
        for role in ("worker", "chief", "reviewer"):
            self.assertIsNone(g(role).evaluate("terminal", {"command": cmd}), role)

    def _heredoc(self, body):
        import json as _j
        return {"command": f"curl -s -X PATCH {self.URL} -H \"Content-Type: application/json\" --data-binary @- <<'EOF'\n{_j.dumps(body, ensure_ascii=False)}\nEOF"}

    def test_reviewer_single_form_passes(self):
        reject = ("## 반려 #1\n- 위치: 문서 instagram 2줄\n- 위반 기준: 완료 기준 2(가격 쓰지 않기)\n- 수정안: 가격 문장을 '학원 문의'로 바꾸기\n\n"
                  "| # | 무엇이 | 어디서 |\n|---|---|---|\n| 1 | 가격 | 2줄 |")
        approve = ("## 완료\n- 한 일: HER-1 인스타 문구 검수 (실제 작업한 봇: 콘텐츠_SNS문구)\n- 확인 방법: python len()으로 줄 수를 세고 금지어를 검색\n"
                   "- 증거: 문서 review revision 9410b535\n- 남은 일: 없음\n\n| # | 기준 | 결과 |\n|---|---|---|\n| 1 | 3~5줄 | 4줄 |")
        r = g("reviewer")
        self.assertIsNone(r.evaluate("terminal", self._heredoc({"status": "in_progress", "comment": reject})))
        self.assertIsNone(r.evaluate("terminal", self._heredoc({"status": "done", "comment": approve})))


if __name__ == "__main__":
    unittest.main()
