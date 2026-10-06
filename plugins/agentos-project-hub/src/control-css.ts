// 「관제센터」 탭 전용 CSS. 기존 허브 화면은 건드리지 않도록 모든 규칙이 .aph-cc 안에서만 듣는다.
// 색 규칙(HER-111 명세 d158045 정정 + HER-114 비서실장 댓글 4fde4058):
//  - 글자·바탕·테두리: --foreground, --muted-foreground, --border, --card, --accent 다섯 토큰만.
//  - 의미 색 3개는 아이콘·막대·테두리·띠 배경에만: --destructive(나쁨·정지 의심), --agentos-lamp(좋음·실행 중), --agentos-brass(주의·검수 없이 완료).
//    대체값은 고정 색이 아니라 var(--foreground) (밝은 테마에는 lamp·brass 토큰이 없음 → 글자·모양·점선으로 구분).
//  - --ring·--primary·고정 색 값(16진수·rgb) 금지. tests/control.spec.ts 가 이 문자열을 검사한다.
//  - 회색 글자(--muted-foreground)는 --card(또는 페이지) 바탕 위에서만. 강조 바탕·--accent 바탕 위 글자는 --foreground.

export const CC_TEXT_TOKENS = ["--foreground", "--muted-foreground"] as const;
export const CC_ALLOWED_TOKENS = ["--foreground", "--muted-foreground", "--border", "--card", "--accent", "--destructive", "--agentos-lamp", "--agentos-brass"] as const;

const BAD = "var(--destructive,var(--foreground))";
const GOOD = "var(--agentos-lamp,var(--foreground))";
const WARN = "var(--agentos-brass,var(--foreground))";
const ALERT_BG = "color-mix(in oklab,var(--foreground) 10%,var(--card))";
const BAND_BG = `color-mix(in oklab,${BAD} 10%,var(--card))`;
const SOLID = "color-mix(in oklab,var(--foreground) 70%,var(--card))";

export const CONTROL_CSS = `
.aph-cc{container:cc/inline-size;display:flex;flex-direction:column;gap:28px;color:var(--foreground);word-break:keep-all;overflow-wrap:anywhere;text-wrap:pretty}
.aph-cc *{box-sizing:border-box}
.aph-cc .aph-ico{width:16px;height:16px;flex:none}
.aph-cc .tt-path{opacity:1;color:var(--muted-foreground)}
.aph-cc-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px}
.aph-cc-lead{margin:0;font-size:13px;line-height:1.5;color:var(--muted-foreground);min-width:0;flex:1 1 280px}
.aph-cc-fresh{display:flex;align-items:center;gap:8px;flex:none;font-size:12px;color:var(--muted-foreground)}
.aph-cc-fresh time{white-space:nowrap}
.aph-cc-btn{font:inherit;font-size:12px;min-height:32px;padding:6px 12px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--foreground);cursor:pointer;white-space:nowrap}
.aph-cc-btn:hover{border-color:var(--foreground)}
.aph-cc-btn:focus-visible,.aph-cc-tog:focus-visible,.aph-cc-h2:focus-visible,.aph-cc-link:focus-visible{outline:2px solid var(--foreground);outline-offset:2px}
.aph-cc-btn[disabled]{cursor:default}
.aph-cc-live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.aph-cc-sec{display:flex;flex-direction:column;gap:12px;min-width:0}
.aph-cc-h2{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 8px;margin:0;font-size:15px;font-weight:650;line-height:1.4}
.aph-cc-h2 small{font-size:13px;font-weight:500;color:var(--muted-foreground);white-space:nowrap}
.aph-cc-note{margin:0;font-size:12px;line-height:1.5;color:var(--muted-foreground)}
.aph-cc-list{list-style:none;margin:0;padding:0;display:grid;gap:12px;min-width:0}
.aph-cc-card{position:relative;display:flex;flex-direction:column;gap:6px;min-width:0;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--card);color:var(--foreground)}
.aph-cc-card:hover{border-color:color-mix(in oklab,var(--foreground) 45%,var(--card))}
.aph-cc-card:has(.aph-cc-hit:focus-visible){outline:2px solid var(--foreground);outline-offset:2px}
.aph-cc-card h3{margin:0;font-size:13px;font-weight:550;line-height:1.4;min-width:0}
.aph-cc-hit{all:unset;display:block;min-width:0;cursor:pointer;color:var(--foreground);font:inherit;font-size:13px;font-weight:550;line-height:1.4}
.aph-cc-hit::after{content:"";position:absolute;inset:0;border-radius:inherit}
.aph-cc-hit:focus-visible{outline:none}
.aph-cc-card[data-level="alert"]{border:2px solid ${BAD};background:${ALERT_BG}}
/* 강조 바탕(경보·읽을 수 없음) 위의 글자는 회색 없이 모두 --foreground (설계 5-3 규칙 2: 밝은 테마에서 회색은 이 바탕 위 3.7:1 로 미달). 아이콘(svg)만 제외 */
.aph-cc-card[data-level="alert"] :not(svg):not(svg *),.aph-cc-card[data-level="unread"] :not(svg):not(svg *),.aph-cc-state[data-unread] :not(svg):not(svg *){color:var(--foreground)}
.aph-cc-card[data-level="warn"]{border:2px dashed ${WARN}}
.aph-cc-card[data-level="good"]{box-shadow:inset 3px 0 0 ${GOOD}}
.aph-cc-card[data-level="paused"]{border-style:dashed}
.aph-cc-card[data-level="unread"]{border:2px solid var(--foreground);background:${ALERT_BG}}
.aph-cc-muted{color:var(--muted-foreground)}
.aph-cc-nowrap{white-space:nowrap}
.aph-cc-num{font-size:24px;font-weight:700;line-height:1.2;font-variant-numeric:tabular-nums;white-space:nowrap}
.aph-cc-num[data-unread]{font-size:15px;font-weight:550;color:var(--muted-foreground)}
.aph-cc-card[data-level="alert"] .aph-cc-num[data-unread]{color:var(--foreground)}
.aph-cc-row1{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;min-width:0}
.aph-cc-method{margin:0;font-size:12px;line-height:1.45;color:var(--muted-foreground)}
.aph-cc-delta{display:inline-flex;align-items:baseline;gap:4px;flex-wrap:wrap;font-size:12px;font-variant-numeric:tabular-nums;min-width:0}
.aph-cc-delta b{white-space:nowrap;font-weight:550;color:var(--foreground)}
.aph-cc-delta b{display:inline-flex;align-items:baseline;gap:4px}
/* 나빠짐: 강조 바탕은 글자 부분에만(빨간 ▲▼ 기호는 카드 바탕 위에 두어 밝은 테마에서도 4.5:1 이상) */
.aph-cc-delta[data-tone="bad"] .aph-cc-dtext{font-weight:700;padding:0 4px;border-radius:4px;background:${ALERT_BG};color:var(--foreground)}
.aph-cc-delta[data-tone="none"] b,.aph-cc-delta[data-tone="same"] b{color:var(--muted-foreground);font-weight:500}
.aph-cc-arrow{font-style:normal}
.aph-cc-delta[data-tone="good"] .aph-cc-arrow{color:${GOOD}}
.aph-cc-delta[data-tone="bad"] .aph-cc-arrow{color:${BAD}}
.aph-cc-delta small{font-size:11px;color:var(--muted-foreground);white-space:nowrap}
.aph-cc-flag{display:inline-flex;align-items:center;gap:4px;flex:none;font-size:12px;font-weight:600;white-space:nowrap;color:var(--foreground);padding:1px 8px;border-radius:999px;border:2px dashed ${WARN}}
.aph-cc-flag .aph-ico{width:14px;height:14px;color:${WARN}}
.aph-cc-pill{display:inline-flex;align-items:center;gap:6px;flex:none;align-self:flex-start;font-size:12px;font-weight:600;line-height:1.4;white-space:nowrap;color:var(--foreground);padding:2px 8px;border-radius:999px;border:1px solid var(--border)}
.aph-cc-pill[data-state="idle"],.aph-cc-pill[data-state="paused"],.aph-cc-pill[data-state="unknown"]{color:var(--muted-foreground)}
.aph-cc-pill[data-state="running"] .aph-ico{color:${GOOD}}
.aph-cc-pill[data-state="error"]{border:2px solid ${BAD}}
.aph-cc-pill[data-state="error"] .aph-ico{color:${BAD}}
.aph-cc-pill[data-state="paused"]{border-style:dashed}
.aph-cc-kind{display:inline-flex;align-items:center;gap:6px;flex:none;font-size:12px;font-weight:600;white-space:nowrap;color:var(--foreground);padding:2px 8px;border-radius:6px;border:1px solid var(--border)}
.aph-cc-kind[data-kind="gateway"]{border:2px solid ${BAD}}
.aph-cc-kind[data-kind="gateway"] .aph-ico{color:${BAD}}
.aph-cc-meta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;min-width:0;font-size:12px;color:var(--muted-foreground)}
.aph-cc-meta>*{white-space:nowrap}
.aph-cc-meta .aph-cc-who{color:var(--foreground);font-weight:500;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.aph-cc-id{font-family:var(--font-mono,ui-monospace,monospace);font-size:11px}
.aph-cc-why{margin:0;font-size:12px;line-height:1.5;color:var(--muted-foreground)}
.aph-cc-clamp2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.aph-cc-clamp1{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
/* 한눈 요약 */
.aph-cc-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
/* ① 할 일 */
.aph-cc-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.aph-cc-tog{font:inherit;font-size:13px;display:inline-flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;padding:6px 12px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--foreground);cursor:pointer;text-align:left;min-width:0}
.aph-cc-tog span{font-size:13px;min-width:0}
.aph-cc-tog b{font-size:16px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.aph-cc-tog[aria-pressed="true"]{border:2px solid var(--foreground);background:var(--accent);color:var(--foreground)}
.aph-cc-tog[data-zero] b{font-weight:500;color:var(--muted-foreground)}
.aph-cc-tog[aria-pressed="true"][data-zero] b{color:var(--foreground)}
.aph-cc-todo .aph-cc-top{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;min-width:0}
.aph-cc-calm{display:flex;gap:12px;align-items:flex-start;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--card)}
.aph-cc-calm .aph-ico{width:20px;height:20px;color:var(--foreground)}
.aph-cc-calm p{margin:0;font-size:13px}
.aph-cc-calm p+p{margin-top:4px;color:var(--muted-foreground);font-size:12px}
/* ② 봇 */
.aph-cc-band{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--card);font-size:13px;line-height:1.5;color:var(--foreground);min-width:0}
.aph-cc-band .aph-ico{margin-top:2px}
.aph-cc-band[data-suspect]{position:relative;border:2px solid ${BAD};background:${BAND_BG};box-shadow:inset 4px 0 0 ${BAD}}
.aph-cc-band[data-suspect] .aph-ico{color:${BAD}}
.aph-cc-band[data-suspect] *{color:var(--foreground)}
.aph-cc-band[data-suspect] .aph-ico{color:${BAD}}
.aph-cc-band b{font-weight:700}
.aph-cc-band p{margin:0}
.aph-cc-states{display:flex;flex-wrap:wrap;gap:8px}
.aph-cc-states .aph-cc-tog{min-height:36px;justify-content:flex-start}
.aph-cc-states .aph-cc-tog .aph-ico{flex:none}
.aph-cc-states .aph-cc-tog[data-state="running"] .aph-ico{color:${GOOD}}
.aph-cc-states .aph-cc-tog[data-state="error"] .aph-ico{color:${BAD}}
.aph-cc-bots{grid-template-columns:minmax(0,1fr)}
.aph-cc-bot .aph-cc-top{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.aph-cc-bot h3{flex:1 1 auto;min-width:0}
.aph-cc-bot h3 .aph-cc-hit{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aph-cc-line{margin:0;font-size:12px;line-height:1.5;color:var(--muted-foreground);min-width:0}
.aph-cc-line b{font-weight:500;color:var(--foreground)}
/* ③ 사용량 · ④ 검수 */
.aph-cc-period{display:flex;gap:8px;flex-wrap:wrap}
.aph-cc-period .aph-cc-tog{min-height:36px;justify-content:center}
.aph-cc-sum3{grid-template-columns:minmax(0,1fr)}
.aph-cc-h3{margin:4px 0 0;font-size:13px;font-weight:650}
.aph-cc-legend{display:flex;flex-wrap:wrap;gap:4px 16px;margin:0;font-size:12px;color:var(--muted-foreground)}
.aph-cc-legend span{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.aph-cc-sw{display:inline-block;width:14px;height:10px;border-radius:2px;border:1px solid var(--muted-foreground)}
.aph-cc-sw[data-k="in"],.aph-cc-sw[data-k="passed"],.aph-cc-seg[data-k="in"],.aph-cc-seg[data-k="passed"]{background:${SOLID}}
.aph-cc-sw[data-k="out"],.aph-cc-seg[data-k="out"]{background:repeating-linear-gradient(135deg,var(--muted-foreground) 0 2px,transparent 2px 5px)}
.aph-cc-sw[data-k="rework"],.aph-cc-seg[data-k="rework"]{background:repeating-linear-gradient(0deg,var(--muted-foreground) 0 2px,transparent 2px 4px)}
.aph-cc-sw[data-k="none"],.aph-cc-seg[data-k="none"]{background:repeating-linear-gradient(45deg,${WARN} 0 3px,transparent 3px 6px)}
.aph-cc-sw[data-k="none"]{border:1px dashed ${WARN}}
.aph-cc-sw[data-k="unknown"],.aph-cc-seg[data-k="unknown"]{background:var(--accent);box-shadow:inset 0 0 0 1px var(--muted-foreground)}
.aph-cc-rows{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;min-width:0}
.aph-cc-bar-row{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"name total" "bar bar" "delta delta";gap:6px 10px;align-items:center}
.aph-cc-bar-row .aph-cc-hit{grid-area:name;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aph-cc-bar-row .aph-cc-total{grid-area:total;font-size:13px;font-weight:650;font-variant-numeric:tabular-nums;white-space:nowrap}
.aph-cc-bar-row .aph-cc-track{grid-area:bar}
.aph-cc-bar-row .aph-cc-delta{grid-area:delta}
.aph-cc-bar-row .aph-cc-io{display:none}
.aph-cc-track{display:flex;height:12px;min-width:0;border-radius:3px;background:transparent;overflow:hidden}
.aph-cc-seg{height:100%;min-width:0}
.aph-cc-seg[data-k="out"]{border:1px solid var(--muted-foreground)}
.aph-cc-stack{display:flex;height:14px;border-radius:3px;overflow:hidden;border:1px solid var(--border);min-width:0}
.aph-cc-top5 .aph-cc-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto;grid-template-areas:"rank who total" "title title title" "meta meta meta";gap:4px 10px;align-items:center}
.aph-cc-top5 .aph-cc-rank{grid-area:rank;font-size:12px;font-weight:650;white-space:nowrap}
.aph-cc-top5 .aph-cc-who{grid-area:who;font-size:12px;font-weight:500}
.aph-cc-top5 .aph-cc-hit{grid-area:title;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aph-cc-top5 .aph-cc-total{grid-area:total;font-size:13px;font-weight:650;white-space:nowrap;font-variant-numeric:tabular-nums}
.aph-cc-top5 .aph-cc-meta{grid-area:meta}
.aph-cc-review .aph-cc-top{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 10px}
.aph-cc-review .aph-cc-top>span{font-size:12px}
.aph-cc-counts{display:flex;flex-wrap:wrap;gap:2px 12px;margin:0;font-size:12px;color:var(--muted-foreground)}
.aph-cc-counts span{white-space:nowrap}
.aph-cc-counts b{color:var(--foreground);font-weight:600}
/* 상세 팝업: 기존 계획 팝업과 같은 배치, 색만 다섯 토큰 */
.aph-cc-dialog{position:fixed;inset:0;margin:auto;height:fit-content;max-height:min(86vh,760px);width:min(640px,calc(100vw - 32px));overflow:auto;
  padding:0;border:1px solid var(--border);border-radius:14px;background:var(--card);color:var(--foreground);word-break:keep-all;overflow-wrap:anywhere}
.aph-cc-dialog::backdrop{background:color-mix(in oklab,var(--card) 85%,transparent)}
.aph-cc-dbody{display:flex;flex-direction:column;gap:14px;padding:20px}
.aph-cc-dhead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.aph-cc-dtitles{display:flex;flex-direction:column;gap:8px;min-width:0}
.aph-cc-chip{align-self:flex-start;font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--border);color:var(--muted-foreground);white-space:nowrap}
.aph-cc-dtitle{margin:0;font-size:18px;font-weight:650;line-height:1.4}
.aph-cc-dsec h3{margin:0 0 4px;font-size:12px;font-weight:650;color:var(--muted-foreground)}
.aph-cc-dsec p{margin:0;font-size:14px;line-height:1.65;white-space:pre-line}
.aph-cc-dsec ul{margin:4px 0 0;padding-left:18px;font-size:13px;line-height:1.6}
.aph-cc-dmeta{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 12px;margin:0;padding-top:12px;border-top:1px solid var(--border);font-size:12px;color:var(--muted-foreground)}
.aph-cc-dmeta dd{margin:0;color:var(--foreground)}
.aph-cc-link{color:var(--foreground);text-decoration:underline;text-underline-offset:2px;font-size:13px;font-weight:600}
.aph-cc-state{margin:0;padding:14px 16px;border:1px dashed var(--border);border-radius:10px;font-size:13px;color:var(--muted-foreground)}
.aph-cc-state[data-unread]{border:2px solid var(--foreground);background:${ALERT_BG};color:var(--foreground)}
.aph-cc-state .aph-cc-btn{margin-left:8px}
@container cc (min-width:560px){
  .aph-cc-kpis{grid-template-columns:repeat(3,minmax(160px,1fr));gap:12px}
  .aph-cc-filters{display:flex;flex-wrap:wrap}
  .aph-cc-filters .aph-cc-tog{min-height:40px}
  .aph-cc-bots{grid-template-columns:repeat(2,minmax(240px,1fr))}
  .aph-cc-sum3{grid-template-columns:repeat(3,minmax(0,1fr))}
  .aph-cc-bar-row{grid-template-columns:120px minmax(0,1fr) 140px;grid-template-areas:"name bar total" "name bar delta"}
  .aph-cc-bar-row .aph-cc-total,.aph-cc-bar-row .aph-cc-delta{justify-self:end;text-align:right}
  .aph-cc-top5 .aph-cc-card{grid-template-columns:auto minmax(96px,140px) minmax(0,1fr) auto auto;grid-template-areas:"rank who title total meta"}
}
@container cc (min-width:960px){
  .aph-cc-kpis{grid-template-columns:repeat(6,minmax(150px,1fr))}
  .aph-cc-bots{grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
  .aph-cc-sum3{grid-template-columns:repeat(3,minmax(0,320px))}
  .aph-cc-todo{display:grid;grid-template-columns:96px minmax(0,1fr) 220px;align-items:start;gap:6px 16px}
  .aph-cc-todo .aph-cc-top{grid-column:1;grid-row:1/3}
  .aph-cc-todo h3,.aph-cc-todo .aph-cc-why,.aph-cc-todo .aph-cc-extra{grid-column:2}
  .aph-cc-todo .aph-cc-meta{grid-column:3;grid-row:1/3;justify-content:flex-end}
  .aph-cc-bar-row{grid-template-columns:160px minmax(0,1fr) repeat(3,96px) 150px;grid-template-areas:"name bar in out total delta"}
  .aph-cc-bar-row .aph-cc-io{display:block;font-size:12px;color:var(--muted-foreground);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  .aph-cc-bar-row .aph-cc-io[data-k="in"]{grid-area:in}
  .aph-cc-bar-row .aph-cc-io[data-k="out"]{grid-area:out}
}
@media (max-width:767px),(pointer:coarse){.aph-cc-btn,.aph-cc-tog,.aph-cc-period .aph-cc-tog,.aph-cc-states .aph-cc-tog{min-height:44px}}
`;
