# -*- coding: utf-8 -*-
"""보고서 관문 검사. python check_report.py [report.html] [--self-test]
G1 구조 G2 외부자원 G3 근거경로 G4 숫자 재계산 G5 막대 좌표 G6 쉬운말 G7 PDF
--self-test: 일부러 망가뜨린 사본 4개가 각각 실패해야 통과."""
import re, sys, json, os
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOTS = {
    "hermes": Path(os.environ.get("LOCALAPPDATA", "C:/Users/tahar/AppData/Local")) / "hermes",
    "ws": Path("C:/Users/tahar/orca/workspaces"),
    "desk": Path("C:/Users/tahar/OneDrive/바탕 화면"),
}
BANNED = ["BFF", "cron", "JSON", "OAuth", "SDK", "Vite", "React", "TypeScript", "endpoint", "프리즈마", "prisma", "워커", "엔드포인트"]
ALLOWED_EXTERNAL = ["https://www.youtube.com/watch?v=3Me5BJgsG7E", "http://www.w3.org/2000/svg"]

def check(html, pdf=None):
    fails = []
    ids = re.findall(r'<section id="([^"]+)"', html)
    need = [f"s{i}" for i in range(1, 10)] + ["appendix"]
    if ids != need: fails.append(f"G1 섹션 순서 {ids}")
    figs = re.findall(r"<figure\b.*?</figure>", html, re.S)
    if len(figs) < 10: fails.append(f"G1 그림 {len(figs)}<10")
    for f in figs:
        if "<figcaption>" not in f or "<svg" not in f: fails.append("G1 캡션/그림 없는 figure")
    # G2 외부 자원
    for m in re.findall(r'(?:src|href)="([^"]+)"|url\(([^)]+)\)|@import\s+([^;]+)', html):
        u = next(x for x in m if x)
        if re.match(r"https?:|//", u) and u not in ALLOWED_EXTERNAL: fails.append(f"G2 외부 {u}")
    # G3 근거 경로
    mm = json.loads(re.search(r'<script type="application/json" id="model-map">(.*?)</script>', html, re.S).group(1))
    for g, part, st, src in mm["ours"]:
        if st == "있음" and not src: fails.append(f"G3 근거 없는 있음: {part}")
        for key in filter(None, src.split(";")):
            root, rel = key.split(":", 1)
            if not (ROOTS[root] / rel).exists(): fails.append(f"G3 경로 없음 {key}")
    # G4 숫자 재계산(보고서 안 표에서 다시 셈)
    chips = re.findall(r'<span class="chip c-(있음|일부|없음)">', html)
    c = {k: chips.count(k) for k in ["있음", "일부", "없음"]}
    kpi = re.search(r"<b>(\d+) · (\d+) · (\d+)</b><span>우리 상태", html)
    if not kpi or tuple(map(int, kpi.groups())) != (c["있음"], c["일부"], c["없음"]): fails.append(f"G4 상태 숫자 표지≠표 {c}")
    if len(chips) != len(mm["ours"]): fails.append("G4 표 줄 수≠부품 수")
    total = sum(v for _, v in mm["brain_counts"])
    if f"{total:,}" not in html.split('class="kpis"')[1][:900]: fails.append("G4 브레인 합계 표지 불일치")
    if total != 4937 + 2942 + 708 + 439 + 316 + 141 + 72 + 14: fails.append("G4 브레인 합계 원본 불일치")
    # G5 막대 좌표: 비율 다시 계산
    sc = re.search(r'data-scale="0,(\d+),(\d+),(\d+)"', html)
    v1, p0, p1 = map(int, sc.groups())
    for k, v, at in re.findall(r'data-k="([^"]+)" data-v="(\d+)" data-at="([\d.]+)"', html):
        exp = (p1 - p0) * int(v) / v1
        if abs(exp - float(at)) > 0.5: fails.append(f"G5 막대 {k} {at}≠{exp:.2f}")
        w = re.search(rf'data-k="{re.escape(k)}" data-v="{v}" data-at="{at}" x="\d+" y="\d+" width="([\d.]+)"', html)
        if not w or abs(float(w.group(1)) - exp) > 0.5: fails.append(f"G5 막대 폭 {k}")
    # G6 쉬운말(부록 전까지, svg 글자·aria-label 포함)
    body = html.split('<section id="appendix"')[0]
    body = re.sub(r"<style>.*?</style>", "", body, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", body) + " ".join(re.findall(r'aria-label="([^"]+)"', body))
    for w in BANNED:
        if re.search(rf"(?<![A-Za-z]){re.escape(w)}(?![A-Za-z])", text): fails.append(f"G6 어려운 말 '{w}'")
    # G7 PDF
    if pdf is not None:
        raw = Path(pdf).read_bytes()
        pages = len(re.findall(rb"/Type\s*/Page[^s]", raw))
        if pages < 6: fails.append(f"G7 PDF 쪽 {pages}<6")
        for mb in re.findall(rb"/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]", raw)[:3]:
            if abs(float(mb[0]) - 595.28) > 2 or abs(float(mb[1]) - 841.89) > 2: fails.append(f"G7 A4 아님 {mb}")
    return fails

def main():
    path = HERE / "report.html"
    html = path.read_text(encoding="utf-8")
    pdf = HERE / "report.pdf"
    fails = check(html, pdf if pdf.exists() else None)
    print("본 보고서:", "통과" if not fails else fails)
    ok = not fails
    if "--self-test" in sys.argv:
        tam = {
            "막대 5px 이동": re.sub(r'(data-k="재무" data-v="72" data-at="[\d.]+" x="\d+" y="\d+" width=")([\d.]+)', lambda m: m.group(1) + f"{float(m.group(2))+5:.2f}", html),
            "상태 하나 바꿈": html.replace('<span class="chip c-없음">', '<span class="chip c-있음">', 1),
            "어려운 말 넣기": html.replace("<h2><span class=\"no\">1</span>한 장 요약", "<h2><span class=\"no\">1</span>한 장 요약 BFF"),
            "외부 그림": html.replace("<main>", '<main><img src="https://example.com/a.png">'),
            "근거 경로 깨기": html.replace("agentos-hermes/src/galaxy.ts", "agentos-hermes/src/galaxy-x.ts"),
        }
        for name, t in tam.items():
            f = check(t)
            print(f"  자체시험[{name}]:", "실패함(정상)" if f else "통과해버림(문제)")
            ok &= bool(f)
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
