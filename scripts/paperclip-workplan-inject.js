/* AgentOS '작업 계획' injected into the Paperclip UI as an IN-PAGE view (not a
 * popup): mounts inside <main> and is torn down when the SPA router navigates
 * away. Renders per-workspace-folder planning buckets from /agentos-workplan.json
 * (same-origin snapshot). Additive + revertible.
 */
(() => {
  "use strict";
  if (window.__agentosWorkplan) return;
  window.__agentosWorkplan = true;

  const NAV_ID = "agentos-workplan-nav";
  const VIEW_ID = "aos-wp-view";
  const ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>';
  const COLS = [
    { cat: "do", title: "해야 할 일", hint: "진행 중이거나 바로 이어서 할 작업", dot: "#f87171" },
    { cat: "scheduled", title: "예정된 작업", hint: "승인됨 · 시작 예정", dot: "#fbbf24" },
    { cat: "planned", title: "계획만 된 작업", hint: "초안 · 검토/승인 대기", dot: "#a1a1aa" },
  ];

  function esc(x) {
    return String(x == null ? "" : x).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // ---- shared in-page mount kit (one instance across AgentOS injections) ----
  function pageKit() {
    if (window.__aosPage) return window.__aosPage;
    function teardownAll() {
      document.querySelectorAll("[data-agentos-page]").forEach((e) => e.remove());
      document.querySelectorAll("main").forEach((m) => {
        if (m.__aosPrevPos !== undefined) { m.style.position = m.__aosPrevPos; delete m.__aosPrevPos; }
      });
      document.querySelectorAll(".aos-nav-active").forEach((n) => n.classList.remove("aos-nav-active"));
    }
    function mount(id, navEl, build) {
      teardownAll();
      const main = document.querySelector("main");
      if (!main) return null;
      if (main.__aosPrevPos === undefined) main.__aosPrevPos = main.style.position;
      main.style.position = "relative";
      const v = document.createElement("div");
      v.id = id;
      v.setAttribute("data-agentos-page", "1");
      v.style.cssText = "position:absolute;inset:0;overflow:auto;background:#0b0b0e;padding:18px 20px;z-index:5";
      build(v);
      main.appendChild(v);
      if (navEl) navEl.classList.add("aos-nav-active");
      main.scrollTop = 0;
      return v;
    }
    for (const m of ["pushState", "replaceState"]) {
      const o = history[m];
      if (!o.__aosHooked) {
        const w = function () { teardownAll(); return o.apply(this, arguments); };
        w.__aosHooked = o;
        history[m] = w;
      }
    }
    window.addEventListener("popstate", teardownAll);
    const st = document.createElement("style");
    st.id = "aos-nav-style";
    st.textContent = ".aos-nav-active{background:rgba(255,255,255,.09) !important;border-radius:8px}";
    document.head.appendChild(st);
    window.__aosPage = { mount, teardownAll };
    return window.__aosPage;
  }

  function ensureStyle() {
    if (document.getElementById("aos-wp-style")) return;
    const s = document.createElement("style");
    s.id = "aos-wp-style";
    s.textContent = `
#${VIEW_ID}{color:#e4e4e7;font-family:inherit}
.aos-wp-head h2{font-size:20px;margin:0 0 4px;font-weight:650}
.aos-wp-head p{margin:0 0 16px;color:#a1a1aa;font-size:13px;max-width:72ch}
.aos-wp-folders{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px;align-items:center}
.aos-wp-fo{border:1px solid rgba(255,255,255,.14);background:#18181b;color:#e4e4e7;border-radius:999px;padding:7px 16px;font-size:13px;cursor:pointer}
.aos-wp-fo.on{background:#e4e4e7;color:#18181b;border-color:#e4e4e7;font-weight:600}
.aos-wp-fo:disabled{opacity:.5;cursor:not-allowed}
.aos-wp-btn{border:1px solid rgba(255,255,255,.14);background:#18181b;color:#e4e4e7;border-radius:8px;padding:6px 12px;font-size:13px;cursor:pointer}
.aos-wp-refresh{margin-left:auto;display:inline-flex;align-items:center;gap:6px}
.aos-wp-err{color:#f87171;font-size:13px;margin:8px 0}
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
.aos-wp-card{border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:11px 12px;margin-bottom:10px;background:#18181b;cursor:pointer;transition:border-color .12s}
.aos-wp-card:hover{border-color:rgba(255,255,255,.32)}
.aos-wp-card:focus-visible{outline:2px solid #818cf8;outline-offset:1px}
.aos-wp-card:last-child{margin-bottom:0}
.aos-wp-card .t{font-weight:600;font-size:13.5px;line-height:1.35}
.aos-wp-card .d{font-size:12px;color:#a1a1aa;margin:5px 0 6px;line-height:1.45}
.aos-wp-card .s{font-size:11px;color:#818cf8;opacity:.85;margin-top:6px}
.aos-wp-empty{color:#a1a1aa;font-size:12.5px}
.aos-wp-done{margin-top:22px;border-top:1px dashed rgba(255,255,255,.14);padding-top:14px}
.aos-wp-done h4{font-size:13px;margin:0 0 10px;color:#a1a1aa;font-weight:600}
.aos-wp-chips{display:flex;flex-wrap:wrap;gap:7px}
.aos-wp-chip{font-size:11.5px;border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:4px 10px;color:#a1a1aa;background:#18181b}
.aos-wp-foot{margin-top:18px;font-size:11.5px;color:#a1a1aa}
.aos-wpd-ov{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.66);display:flex;align-items:center;justify-content:center;padding:24px}
.aos-wpd{position:relative;width:100%;max-width:640px;max-height:85vh;overflow:auto;background:#0e0e12;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:22px 24px;color:#e4e4e7}
.aos-wpd h3{margin:0 0 6px;font-size:18px;line-height:1.35;padding-right:70px}
.aos-wpd .cat{display:inline-block;font-size:11px;color:#a1a1aa;border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:2px 9px;margin-bottom:6px}
.aos-wpd section{margin:16px 0}
.aos-wpd section h4{margin:0 0 6px;font-size:13.5px;color:#fff;font-weight:650}
.aos-wpd section p{margin:0;font-size:13.5px;color:#d4d4d8;line-height:1.6}
.aos-wpd .muted{color:#71717a;font-style:italic}
.aos-wpd .x{position:absolute;top:18px;right:20px;background:transparent;border:1px solid rgba(255,255,255,.2);color:#e4e4e7;border-radius:8px;padding:5px 11px;cursor:pointer;font-size:12.5px}
.aos-wpd .x:hover{background:rgba(255,255,255,.08)}
.aos-wpd .src{margin-top:18px;font-size:11px;color:#71717a;border-top:1px solid rgba(255,255,255,.1);padding-top:12px;word-break:break-all;line-height:1.7}
@media (max-width:860px){.aos-wp-cols{grid-template-columns:minmax(0,1fr)}}
`;
    document.head.appendChild(s);
  }

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
    a.className = ref.className;
    a.setAttribute("role", "button");
    a.setAttribute("aria-label", "작업 계획");
    a.innerHTML = ICON + '<span style="flex:1 1 auto;min-width:0">작업 계획</span>';
    a.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); openPage(); });
    ref.parentElement.insertBefore(a, ref);
  }

  let data = null;
  let current = "";

  function renderBody(view) {
    const body = view.querySelector(".aos-wp-body");
    const f = (data.folders || []).find((x) => x.id === current) || (data.folders || [])[0];
    if (!f) { body.innerHTML = '<p class="aos-wp-empty">표시할 폴더가 없습니다.</p>'; return; }
    const items = (cat) => (f.items || []).filter((i) => i.category === cat);
    const done = items("done");
    const colsHtml = COLS.map((c) => {
      const list = items(c.cat);
      const cards = list.length
        ? list.map((i) =>
            `<article class="aos-wp-card" data-file="${esc(i.file)}" role="button" tabindex="0"><div class="t">${esc(i.title)}</div>${
              i.status ? `<div class="d">${esc(i.status)}</div>` : ""
            }<div class="s">자세히 보기 →</div></article>`).join("")
        : '<p class="aos-wp-empty">항목이 없습니다.</p>';
      return `<div class="aos-wp-col"><h3><span class="aos-wp-dot" style="background:${c.dot}"></span>${c.title} <span class="cnt">${list.length}</span></h3><p class="hint">${c.hint}</p>${cards}</div>`;
    }).join("");
    const chips = done.length
      ? `<div class="aos-wp-done"><h4>✅ 완료 (참고) · ${done.length}건</h4><div class="aos-wp-chips">${done
          .map((i) => `<span class="aos-wp-chip" title="${esc(i.file)}">${esc(i.title)}</span>`).join("")}</div></div>`
      : "";
    const c = f.counts || { do: 0, scheduled: 0, planned: 0, done: 0 };
    body.innerHTML =
      `<div class="aos-wp-stats">
        <div class="aos-wp-st"><b>${c.do}</b><span>해야 할 일</span></div>
        <div class="aos-wp-st"><b>${c.scheduled}</b><span>예정</span></div>
        <div class="aos-wp-st"><b>${c.planned}</b><span>계획만</span></div>
        <div class="aos-wp-st"><b>${c.done}</b><span>완료</span></div>
      </div>
      <div class="aos-wp-cols">${colsHtml}</div>
      ${chips}
      <p class="aos-wp-foot">출처: ${esc(f.label)} 폴더의 계획 문서 자동 정리 · ${esc(
        new Date(data.generatedAt).toLocaleString("ko-KR"))} · 자동 분류는 참고용이며 큐레이션으로 보정합니다.</p>`;
    view.querySelectorAll(".aos-wp-card").forEach((c) => {
      const open = () => {
        const it = (f.items || []).find((x) => x.file === c.dataset.file);
        if (it) openDetail(it);
      };
      c.addEventListener("click", open);
      c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
    view.querySelectorAll(".aos-wp-fo").forEach((b) => b.classList.toggle("on", b.dataset.id === current));
  }

  // Item detail popup (explicitly a popup): what / why / expected effect, in
  // plain Korean, pulled from the plan doc.
  function openDetail(item) {
    const CAT = { do: "해야 할 일", scheduled: "예정된 작업", planned: "계획만 된 작업", done: "완료" };
    const sec = (emoji, label, val) =>
      `<section><h4>${emoji} ${label}</h4><p${val ? "" : ' class="muted"'}>${
        val ? esc(val) : "계획 문서에 아직 적혀 있지 않습니다."
      }</p></section>`;
    const old = document.getElementById("aos-wpd-ov");
    if (old) old.remove();
    const ov = document.createElement("div");
    ov.id = "aos-wpd-ov";
    ov.className = "aos-wpd-ov";
    ov.innerHTML =
      `<div class="aos-wpd" role="dialog" aria-label="${esc(item.title)}"><button class="x">닫기 ✕</button>` +
      `<h3>${esc(item.title)}</h3><div class="cat">${CAT[item.category] || esc(item.category)}</div>` +
      sec("📌", "무엇인가요?", item.what) +
      sec("🎯", "왜 하나요?", item.why) +
      sec("✨", "기대 효과", item.expected) +
      (item.exclude ? `<section><h4>🚫 이번엔 안 하는 것</h4><p>${esc(item.exclude)}</p></section>` : "") +
      `<div class="src">상태: ${esc(item.status || "-")}<br>출처 문서: ${esc(item.file)}</div></div>`;
    ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
    ov.querySelector(".x").addEventListener("click", () => ov.remove());
    document.addEventListener("keydown", function esc2(e) {
      if (e.key === "Escape") { ov.remove(); document.removeEventListener("keydown", esc2); }
    });
    document.body.appendChild(ov);
  }

  function drawFolders(view) {
    const fo = view.querySelector(".aos-wp-folders");
    fo.innerHTML = "";
    (data.folders || []).forEach((f) => {
      const b = document.createElement("button");
      b.className = "aos-wp-fo";
      b.dataset.id = f.id;
      b.textContent = f.label + (f.available ? "" : " (없음)");
      b.disabled = !f.available;
      b.addEventListener("click", () => { current = f.id; renderBody(view); });
      fo.appendChild(b);
    });
    const r = document.createElement("button");
    r.className = "aos-wp-btn aos-wp-refresh";
    r.textContent = "새로고침";
    r.addEventListener("click", () => { data = null; build(view); });
    fo.appendChild(r);
    if (!current) {
      const first = (data.folders || []).find((f) => f.available) || (data.folders || [])[0];
      current = first ? first.id : "";
    }
    renderBody(view);
  }

  function build(view) {
    view.innerHTML =
      '<div class="aos-wp-head"><h2>📋 작업 계획</h2><p>폴더를 골라 해야 할 일 · 예정 · 계획만 된 작업을 한눈에. 카드를 클릭하면 무엇을·왜·기대효과를 쉬운 말로 설명해 드립니다.</p></div>' +
      '<div class="aos-wp-folders"></div>' +
      '<div class="aos-wp-body"><p class="aos-wp-empty">불러오는 중…</p></div>';
    if (data) { drawFolders(view); return; }
    fetch("/agentos-workplan.json", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { data = j; drawFolders(view); })
      .catch((e) => {
        view.querySelector(".aos-wp-body").innerHTML =
          '<p class="aos-wp-err">작업 계획 데이터를 불러오지 못했습니다: ' + esc(e && e.message) + "</p>";
      });
  }

  function openPage() {
    ensureStyle();
    pageKit().mount(VIEW_ID, document.getElementById(NAV_ID), build);
  }

  tryInject();
  const mo = new MutationObserver(() => { if (!document.getElementById(NAV_ID)) tryInject(); });
  mo.observe(document.body, { childList: true, subtree: true });
  setInterval(tryInject, 2000);
  if (location.hash === "#agentos-workplan") setTimeout(openPage, 1000);
})();
