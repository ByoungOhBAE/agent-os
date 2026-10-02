/* AgentOS '작업 계획' tab injected into the Paperclip UI.
 * Additive + revertible: adds a sidebar item above '작업'(/issues) and a panel
 * that renders per-workspace-folder planning buckets from /agentos-workplan.json
 * (same-origin snapshot produced by scripts/gen-paperclip-workplan.mjs).
 * Touches no upstream file; remove the <script> tag + this file to revert.
 */
(() => {
  "use strict";
  if (window.__agentosWorkplan) return;
  window.__agentosWorkplan = true;

  const NAV_ID = "agentos-workplan-nav";
  const ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>';

  const COLS = [
    { cat: "do", title: "해야 할 일", hint: "진행 중이거나 바로 이어서 할 작업", dot: "#f87171" },
    { cat: "scheduled", title: "예정된 작업", hint: "승인됨 · 시작 예정", dot: "#fbbf24" },
    { cat: "planned", title: "계획만 된 작업", hint: "초안 · 검토/승인 대기", dot: "#a1a1aa" },
  ];

  function findIssuesLink() {
    return document.querySelector('nav a[href$="/issues"], aside a[href$="/issues"]');
  }

  function tryInject() {
    if (document.getElementById(NAV_ID)) return;
    const ref = findIssuesLink();
    if (!ref || !ref.parentElement) return;
    const a = document.createElement("a");
    a.id = NAV_ID;
    a.href = "#agentos-workplan";
    a.className = ref.className; // inherit native sidebar styling
    a.setAttribute("role", "button");
    a.setAttribute("aria-label", "작업 계획");
    a.innerHTML = ICON + '<span style="flex:1 1 auto;min-width:0">작업 계획</span>';
    a.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPanel();
    });
    ref.parentElement.insertBefore(a, ref);
  }

  // Styles (scoped .aos-wp-*)
  function ensureStyle() {
    if (document.getElementById("aos-wp-style")) return;
    const s = document.createElement("style");
    s.id = "aos-wp-style";
    s.textContent = `
.aos-wp-ov{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;justify-content:center;overflow:auto;padding:28px 18px}
.aos-wp-panel{width:100%;max-width:1120px;background:#0b0b0e;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:22px;color:#e4e4e7;font-family:inherit;height:max-content}
.aos-wp-top{display:flex;align-items:center;gap:12px;margin-bottom:4px}
.aos-wp-top h2{font-size:20px;margin:0;font-weight:650}
.aos-wp-x{margin-left:auto;background:transparent;border:1px solid rgba(255,255,255,.14);color:#e4e4e7;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:13px}
.aos-wp-x:hover{background:rgba(255,255,255,.06)}
.aos-wp-sub{color:#a1a1aa;font-size:13px;margin:0 0 16px}
.aos-wp-folders{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px;align-items:center}
.aos-wp-fo{border:1px solid rgba(255,255,255,.14);background:#18181b;color:#e4e4e7;border-radius:999px;padding:7px 16px;font-size:13px;cursor:pointer}
.aos-wp-fo.on{background:#e4e4e7;color:#18181b;border-color:#e4e4e7;font-weight:600}
.aos-wp-fo:disabled{opacity:.5;cursor:not-allowed}
.aos-wp-stats{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px}
.aos-wp-st{border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px 16px;min-width:104px;background:#18181b}
.aos-wp-st b{display:block;font-size:24px}
.aos-wp-st span{font-size:12px;color:#a1a1aa}
.aos-wp-cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.aos-wp-col{border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:14px;background:#141417;min-width:0}
.aos-wp-col h3{font-size:14px;margin:0 0 2px;display:flex;align-items:center;gap:8px}
.aos-wp-col .cnt{color:#a1a1aa;font-weight:400;font-size:13px}
.aos-wp-col .hint{font-size:12px;color:#a1a1aa;margin:0 0 12px}
.aos-wp-dot{width:10px;height:10px;border-radius:50%;flex:none}
.aos-wp-card{border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:11px 12px;margin-bottom:10px;background:#18181b}
.aos-wp-card:last-child{margin-bottom:0}
.aos-wp-card .t{font-weight:600;font-size:13.5px;line-height:1.35}
.aos-wp-card .d{font-size:12px;color:#a1a1aa;margin:5px 0 6px;line-height:1.45}
.aos-wp-card .s{font-size:10.5px;color:#a1a1aa;opacity:.7;word-break:break-all}
.aos-wp-empty{color:#a1a1aa;font-size:12.5px}
.aos-wp-done{margin-top:22px;border-top:1px dashed rgba(255,255,255,.14);padding-top:14px}
.aos-wp-done h4{font-size:13px;margin:0 0 10px;color:#a1a1aa;font-weight:600}
.aos-wp-chips{display:flex;flex-wrap:wrap;gap:7px}
.aos-wp-chip{font-size:11.5px;border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:4px 10px;color:#a1a1aa;background:#18181b}
.aos-wp-foot{margin-top:18px;font-size:11.5px;color:#a1a1aa}
@media (max-width:860px){.aos-wp-cols{grid-template-columns:minmax(0,1fr)}}
`;
    document.head.appendChild(s);
  }

  let data = null;
  let current = "";

  function esc(x) {
    return String(x == null ? "" : x).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]),
    );
  }

  function render(panel) {
    const f = (data.folders || []).find((x) => x.id === current) || data.folders[0];
    if (!f) {
      panel.querySelector(".aos-wp-body").innerHTML =
        '<p class="aos-wp-empty">표시할 폴더가 없습니다.</p>';
      return;
    }
    const items = (cat) => (f.items || []).filter((i) => i.category === cat);
    const done = items("done");
    const colsHtml = COLS.map((c) => {
      const list = items(c.cat);
      const cards = list.length
        ? list
            .map(
              (i) =>
                `<article class="aos-wp-card"><div class="t">${esc(i.title)}</div>${
                  i.status ? `<div class="d">${esc(i.status)}</div>` : ""
                }<div class="s">${esc(i.file)}</div></article>`,
            )
            .join("")
        : '<p class="aos-wp-empty">항목이 없습니다.</p>';
      return `<div class="aos-wp-col"><h3><span class="aos-wp-dot" style="background:${c.dot}"></span>${c.title} <span class="cnt">${list.length}</span></h3><p class="hint">${c.hint}</p>${cards}</div>`;
    }).join("");
    const chips = done.length
      ? `<div class="aos-wp-done"><h4>✅ 완료 (참고) · ${done.length}건</h4><div class="aos-wp-chips">${done
          .map((i) => `<span class="aos-wp-chip" title="${esc(i.file)}">${esc(i.title)}</span>`)
          .join("")}</div></div>`
      : "";
    const c = f.counts || { do: 0, scheduled: 0, planned: 0, done: 0 };
    panel.querySelector(".aos-wp-body").innerHTML =
      `<div class="aos-wp-stats">
        <div class="aos-wp-st"><b>${c.do}</b><span>해야 할 일</span></div>
        <div class="aos-wp-st"><b>${c.scheduled}</b><span>예정</span></div>
        <div class="aos-wp-st"><b>${c.planned}</b><span>계획만</span></div>
        <div class="aos-wp-st"><b>${c.done}</b><span>완료</span></div>
      </div>
      <div class="aos-wp-cols">${colsHtml}</div>
      ${chips}
      <p class="aos-wp-foot">출처: ${esc(f.label)} 폴더의 계획 문서 자동 정리 · ${esc(
        new Date(data.generatedAt).toLocaleString("ko-KR"),
      )} · 자동 분류는 참고용이며 큐레이션으로 보정합니다.</p>`;
    // folder buttons active state
    panel.querySelectorAll(".aos-wp-fo").forEach((b) =>
      b.classList.toggle("on", b.dataset.id === current),
    );
  }

  function openPanel() {
    ensureStyle();
    let ov = document.getElementById("aos-wp-ov");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "aos-wp-ov";
      ov.className = "aos-wp-ov";
      ov.innerHTML =
        '<div class="aos-wp-panel" role="dialog" aria-label="작업 계획"><div class="aos-wp-top"><h2>📋 작업 계획</h2><button class="aos-wp-x">닫기 ✕</button></div><p class="aos-wp-sub">폴더별 해야 할 일 · 예정 · 계획만 된 작업을 한눈에. “완료”에는 증거가 필요합니다.</p><div class="aos-wp-folders"></div><div class="aos-wp-body"><p class="aos-wp-empty">불러오는 중…</p></div></div>';
      ov.addEventListener("click", (e) => {
        if (e.target === ov) ov.remove();
      });
      ov.querySelector(".aos-wp-x").addEventListener("click", () => ov.remove());
      document.body.appendChild(ov);
    } else {
      ov.style.display = "flex";
    }

    const draw = () => {
      const fo = ov.querySelector(".aos-wp-folders");
      fo.innerHTML = "";
      (data.folders || []).forEach((f) => {
        const b = document.createElement("button");
        b.className = "aos-wp-fo";
        b.dataset.id = f.id;
        b.textContent = f.label + (f.available ? "" : " (없음)");
        b.disabled = !f.available;
        b.addEventListener("click", () => {
          current = f.id;
          render(ov.querySelector(".aos-wp-panel"));
        });
        fo.appendChild(b);
      });
      if (!current) {
        const first = (data.folders || []).find((f) => f.available) || data.folders[0];
        current = first ? first.id : "";
      }
      render(ov.querySelector(".aos-wp-panel"));
    };

    if (data) {
      draw();
    } else {
      fetch("/agentos-workplan.json", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          data = j;
          draw();
        })
        .catch((e) => {
          ov.querySelector(".aos-wp-body").innerHTML =
            '<p class="aos-wp-empty">작업 계획 데이터를 불러오지 못했습니다: ' +
            esc(e && e.message) +
            "</p>";
        });
    }
  }

  // Inject now and keep it present across SPA re-renders.
  tryInject();
  const mo = new MutationObserver(() => {
    if (!document.getElementById(NAV_ID)) tryInject();
  });
  mo.observe(document.body, { childList: true, subtree: true });
  setInterval(tryInject, 2000);
  // Open directly if navigated to the hash.
  if (location.hash === "#agentos-workplan") setTimeout(openPanel, 800);
})();
