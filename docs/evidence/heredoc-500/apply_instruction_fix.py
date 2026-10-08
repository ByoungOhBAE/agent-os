"""Instruction fix (owner decision 2026-10-08, '다'): bodies containing a backslash go via a file.
Edits two SOURCES only: scripts/hermes-bots.mjs soulFor() header (-> sync-soul) and registry c-run-env (+ ko.json re-key).
Backslashes are built with chr(92) so no shell can alter them."""
import hashlib, json, pathlib, re
B = chr(92)
REPO = pathlib.Path(__file__).resolve().parents[3]

# 1) SOUL header (JS template literal: a literal backslash must be written as two in the source)
hb = REPO / "scripts" / "hermes-bots.mjs"
src = hb.read_text(encoding="utf-8")
anchor = "한글 본문은 (2)나 (3)이 안전합니다(명령에 직접 넣으면 글자가 깨질 수 있음).\n"
assert src.count(anchor) == 1, src.count(anchor)
js_bs = B + B  # one backslash inside a JS template literal
line = ("  본문에 역슬래시(" + js_bs + ")가 하나라도 있으면(윈도 경로 C:" + js_bs + "Users, 정규식 " + js_bs + "d, 표 칸 " + js_bs + "| 등) (1)·(2) 대신 "
        "**(3) 파일**로 보냅니다 — 파일은 write_file 도구로 만듭니다. 이 PC 터미널은 명령 속 역슬래시 두 개를 하나로 줄여 JSON이 깨지고 500이 날 수 있습니다.\n")
if line not in src:
    src = src.replace(anchor, anchor + line)
    hb.write_text(src, encoding="utf-8", newline="")
print("hermes-bots.mjs: line present =", line in hb.read_text(encoding="utf-8"))

# 2) registry c-run-env + ko.json re-key
def entry_hash(text):  # knowledge/lib.mjs entryHash: sha256(trim + whitespace runs -> one space)[:12]
    return hashlib.sha256(re.sub(r"\s+", " ", text.strip()).encode("utf-8")).hexdigest()[:12]
rp = REPO / "knowledge" / "data" / "registry.json"
kp = REPO / "knowledge" / "data" / "ko.json"
reg = json.loads(rp.read_text(encoding="utf-8"))
ko = json.loads(kp.read_text(encoding="utf-8"))
e = next(x for x in reg["entries"] if x["id"] == "c-run-env")
add_en = (" If the body contains any backslash (a Windows path like C:" + B + "Users, a regex like " + B + "d, a table cell " + B + "|), "
          "do not send it inline or as a heredoc: write the JSON with the write_file tool, then send it with --data-binary @<absolute path> "
          "(this PC's terminal can turn two backslashes into one inside a command, which breaks the JSON and returns HTTP 500).")
add_ko = (" 본문에 역슬래시가 하나라도 있으면(윈도 경로 C:" + B + "Users, 정규식 " + B + "d, 표 칸 " + B + "| 등) 명령에 직접 넣거나 heredoc으로 보내지 말고, "
          "write_file 도구로 JSON 파일을 만든 뒤 --data-binary @<절대 경로>로 보내세요(이 PC 터미널은 명령 속 역슬래시 두 개를 하나로 줄일 수 있어 JSON이 깨지고 HTTP 500이 납니다).")
old_hash = entry_hash(e["en"])
if add_en.strip() not in e["en"]:
    old_item = ko["items"].get(old_hash)
    assert old_item, "ko item for old hash missing"
    e["en"] = e["en"].rstrip() + add_en
    new_hash = entry_hash(e["en"])
    ko["items"].pop(old_hash)
    ko["items"][new_hash] = {**old_item, "ko": old_item["ko"].rstrip() + add_ko, "en": e["en"]}
    rp.write_text(json.dumps(reg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="")
    kp.write_text(json.dumps(ko, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="")
    print("registry: c-run-env", old_hash, "->", new_hash)
else:
    print("registry: already updated")
