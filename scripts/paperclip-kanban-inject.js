/* AgentOS '칸반' (Hermes Kanban) ported into the Paperclip UI as an IN-PAGE view
 * (not a popup): mounts inside <main>, and is torn down when the SPA router
 * navigates to another page. Full interactive: read columns/cards, create, move.
 * Talks to the AgentOS BFF (127.0.0.1:4200). Additive + revertible.
 */
(() => {
  "use strict";
  if (window.__agentosKanban) return;
  window.__agentosKanban = true;

  const BFF = "http://127.0.0.1:4200";
  const NAV_ID = "agentos-kanban-nav";
  const VIEW_ID = "aos-kb-view";
  const STATUSES = ["triage", "todo", "scheduled", "ready", "running", "blocked", "review", "done"];
  const STATUS_KO = {
    triage: "분류", todo: "할 일", scheduled: "예정", ready: "준비됨",
    running: "진행 중", blocked: "막힘", review: "검토", done: "완료", archived: "보관",
  };
  const ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>';

  function esc(x) {
    return String(x == null ? "" : x).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  async function api(path, opts) {
    const r = await fetch(BFF + path, {
      method: (opts && opts.method) || "GET",
      headers: opts && opts.body ? { "Content-Type": "application/json" } : {},
      body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `요청 실패 (${r.status})`);
    return j;
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
    if (document.getElementById("aos-kb-style")) return;
    const s = document.createElement("style");
    s.id = "aos-kb-style";
    s.textContent = `
#${VIEW_ID}{color:#e4e4e7;font-family:inherit}
.aos-kb-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:4px}
.aos-kb-top h2{font-size:19px;margin:0;font-weight:650}
.aos-kb-sel{background:#18181b;color:#e4e4e7;border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:6px 10px;font-size:13px}
.aos-kb-btn{background:#18181b;color:#e4e4e7;border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:6px 12px;font-size:13px;cursor:pointer}
.aos-kb-btn:hover{background:rgba(255,255,255,.07)}
.aos-kb-btn.pri{background:#e4e4e7;color:#18181b;border-color:#e4e4e7;font-weight:600}
.aos-kb-sub{color:#a1a1aa;font-size:12.5px;margin:2px 0 14px}
.aos-kb-new{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center}
.aos-kb-new input{background:#18181b;color:#e4e4e7;border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:7px 10px;font-size:13px}
.aos-kb-new .t{flex:1 1 240px;min-width:0}
.aos-kb-cols{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px}
.aos-kb-col{flex:0 0 240px;background:#141417;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px;min-height:120px}
.aos-kb-col h3{font-size:12.5px;margin:0 0 10px;color:#e4e4e7;display:flex;align-items:center;gap:6px}
.aos-kb-col .n{color:#a1a1aa;font-weight:400}
.aos-kb-card{background:#18181b;border:1px solid rgba(255,255,255,.1);border-radius:9px;padding:9px 10px;margin-bottom:8px}
.aos-kb-card .t{font-size:13px;font-weight:550;line-height:1.35}
.aos-kb-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:7px}
.aos-kb-tag{font-size:10.5px;color:#a1a1aa;border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:1px 7px}
.aos-kb-move{background:#0b0b0e;color:#e4e4e7;border:1px solid rgba(255,255,255,.18);border-radius:7px;padding:3px 6px;font-size:11px;margin-top:7px;width:100%}
.aos-kb-empty{color:#71717a;font-size:11.5px;padding:6px 2px}
.aos-kb-msg{color:#a1a1aa;font-size:13px;padding:24px 4px}
.aos-kb-err{color:#f87171}
.aos-kb-foot{margin-top:12px;font-size:11px;color:#71717a}
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
    a.href = "#agentos-kanban";
    a.className = ref.className;
    a.setAttribute("role", "button");
    a.setAttribute("aria-label", "칸반");
    a.innerHTML = ICON + '<span style="flex:1 1 auto;min-width:0">칸반</span>';
    a.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); openPage(); });
    ref.parentElement.insertBefore(a, ref);
  }

  let boards = [];
  let currentBoard = "";
  const boardQuery = () => (currentBoard ? `?board=${encodeURIComponent(currentBoard)}` : "");

  async function loadBoard(view) {
    const body = view.querySelector(".aos-kb-body");
    body.innerHTML = '<p class="aos-kb-msg">불러오는 중…</p>';
    let board;
    try {
      board = await api(`/api/hermes/kanban/board${boardQuery()}`);
    } catch (e) {
      body.innerHTML = `<p class="aos-kb-msg aos-kb-err">칸반을 불러오지 못했습니다: ${esc(e.message)}<br><span style="color:#a1a1aa">AgentOS BFF(127.0.0.1:4200)가 실행 중인지 확인하세요 (Paperclip 실행 시 자동 기동).</span></p>`;
      return;
    }
    const cols = board.columns || [];
    body.innerHTML =
      `<div class="aos-kb-cols">${cols
        .map((c) => {
          const tasks = c.tasks || [];
          const cards = tasks.length
            ? tasks
                .map((t) => {
                  const opts = STATUSES.concat(["archived"])
                    .map((s) => `<option value="${s}"${s === c.name ? " selected" : ""}>${STATUS_KO[s] || s}</option>`)
                    .join("");
                  const tags = [];
                  if (t.assignee) tags.push(`<span class="aos-kb-tag">${esc(t.assignee)}</span>`);
                  if (t.identifier) tags.push(`<span class="aos-kb-tag">${esc(t.identifier)}</span>`);
                  return `<div class="aos-kb-card" data-id="${esc(t.id)}"><div class="t">${esc(t.title)}</div>${
                    tags.length ? `<div class="aos-kb-meta">${tags.join("")}</div>` : ""
                  }<select class="aos-kb-move" data-id="${esc(t.id)}">${opts}</select></div>`;
                })
                .join("")
            : '<div class="aos-kb-empty">—</div>';
          return `<div class="aos-kb-col"><h3>${STATUS_KO[c.name] || esc(c.name)} <span class="n">${tasks.length}</span></h3>${cards}</div>`;
        })
        .join("")}</div><p class="aos-kb-foot">출처: Hermes Kanban · 보드 ${esc(currentBoard || "default")} · 상태를 바꾸면 즉시 이동됩니다.</p>`;
    body.querySelectorAll(".aos-kb-move").forEach((sel) => {
      sel.addEventListener("change", async () => {
        sel.disabled = true;
        try {
          await api(`/api/hermes/kanban/tasks/${encodeURIComponent(sel.dataset.id)}${boardQuery()}`, {
            method: "PATCH",
            body: { status: sel.value },
          });
          await loadBoard(view);
        } catch (e) {
          sel.disabled = false;
          alert("이동 실패: " + e.message);
        }
      });
    });
  }

  function build(view) {
    view.innerHTML =
      '<div class="aos-kb-top"><h2>🗂️ 칸반</h2>' +
      '<select class="aos-kb-sel aos-kb-boards" aria-label="보드 선택"></select>' +
      '<button class="aos-kb-btn aos-kb-refresh">새로고침</button></div>' +
      '<p class="aos-kb-sub">Hermes Kanban 보드 — 작업을 만들고 상태(열)를 바꿔 이동합니다. 조직 대시보드 안에서 바로.</p>' +
      '<div class="aos-kb-new"><input class="t" placeholder="새 작업 제목" aria-label="새 작업 제목"><input class="asg" placeholder="담당자(선택)" aria-label="담당자" style="flex:0 0 140px"><button class="aos-kb-btn pri aos-kb-add">+ 새 작업</button></div>' +
      '<div class="aos-kb-body"><p class="aos-kb-msg">불러오는 중…</p></div>';

    view.querySelector(".aos-kb-refresh").addEventListener("click", () => loadBoard(view));

    const sel = view.querySelector(".aos-kb-boards");
    api("/api/hermes/kanban/boards")
      .then((bl) => {
        boards = bl.boards || [];
        currentBoard = currentBoard || bl.current || (boards[0] && boards[0].slug) || "";
        sel.innerHTML = boards
          .map((b) => `<option value="${esc(b.slug)}"${b.slug === currentBoard ? " selected" : ""}>${esc(b.name || b.slug)}${b.total ? ` (${b.total})` : ""}</option>`)
          .join("");
      })
      .catch(() => { sel.innerHTML = '<option value="">default</option>'; });
    sel.addEventListener("change", () => { currentBoard = sel.value; loadBoard(view); });

    const add = view.querySelector(".aos-kb-add");
    add.addEventListener("click", async () => {
      const titleEl = view.querySelector(".aos-kb-new .t");
      const asgEl = view.querySelector(".aos-kb-new .asg");
      const title = titleEl.value.trim();
      if (!title) { titleEl.focus(); return; }
      add.disabled = true;
      try {
        await api(`/api/hermes/kanban/tasks${boardQuery()}`, {
          method: "POST",
          body: { title, assignee: asgEl.value.trim() || undefined },
        });
        titleEl.value = ""; asgEl.value = "";
        await loadBoard(view);
      } catch (e) {
        alert("생성 실패: " + e.message);
      } finally {
        add.disabled = false;
      }
    });

    loadBoard(view);
  }

  function openPage() {
    ensureStyle();
    pageKit().mount(VIEW_ID, document.getElementById(NAV_ID), build);
  }

  tryInject();
  const mo = new MutationObserver(() => { if (!document.getElementById(NAV_ID)) tryInject(); });
  mo.observe(document.body, { childList: true, subtree: true });
  setInterval(tryInject, 2000);
  if (location.hash === "#agentos-kanban") setTimeout(openPage, 1000);
})();
