/* AgentOS '칸반' menu for the Paperclip UI (업무 group, above '작업').
 * Since 2026-10-04 it is a plain link to the all-projects kanban of the project hub plugin
 * (/<prefix>/project-hub?project=all&tab=kanban), which shows the real Paperclip work of every bot.
 * The old in-page Hermes Kanban board was retired by the owner's decision (it showed an unused, empty board).
 * Hermes Kanban data and the BFF endpoints are left untouched. Additive + revertible.
 */
(() => {
  "use strict";
  if (window.__agentosKanban) return;
  window.__agentosKanban = true;

  const NAV_ID = "agentos-kanban-nav";
  const ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>';

  /** Company prefix from the issues link's own href (/HER/issues), falling back to the current URL. */
  function prefix(ref) {
    const fromRef = ref ? new URL(ref.href, location.origin).pathname.split("/").filter(Boolean)[0] : "";
    const fromPath = location.pathname.split("/").filter(Boolean)[0];
    return fromRef || fromPath || "";
  }
  function target(ref) {
    const p = prefix(ref);
    return `${p ? `/${p}` : ""}/project-hub?project=all&tab=kanban`;
  }
  function isActive() {
    return location.pathname.endsWith("/project-hub") && new URLSearchParams(location.search).get("project") === "all";
  }
  function findIssuesLink() {
    return document.querySelector('nav a[href$="/issues"], aside a[href$="/issues"]');
  }
  /** A sibling nav link that is NOT the current page, so we copy the idle look, not the active one. */
  function idleClass(ref) {
    const list = ref.parentElement ? [...ref.parentElement.querySelectorAll("a")] : [];
    const idle = list.find((a) => a.id !== NAV_ID && a.getAttribute("aria-current") !== "page" && !a.id.startsWith("agentos-"));
    return (idle || ref).className;
  }
  function ensureStyle() {
    if (document.getElementById("aos-kb-link-style")) return;
    const s = document.createElement("style");
    s.id = "aos-kb-link-style";
    s.textContent = "#" + NAV_ID + '[aria-current="page"]{background:rgba(255,255,255,.09) !important;border-radius:8px;color:inherit}';
    document.head.appendChild(s);
  }
  function closeMobileDrawer() {
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    setTimeout(() => document.querySelector("button.fixed.inset-0.z-40")?.click(), 0);
  }
  function sync() {
    const a = document.getElementById(NAV_ID);
    if (!a) return;
    const href = target(findIssuesLink());
    if (a.getAttribute("href") !== href) a.setAttribute("href", href);
    if (isActive()) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  function tryInject() {
    if (document.getElementById(NAV_ID)) { sync(); return; }
    const ref = findIssuesLink();
    if (!ref || !ref.parentElement) return;
    ensureStyle();
    const a = document.createElement("a");
    a.id = NAV_ID;
    a.className = idleClass(ref);
    a.href = target(ref);
    a.title = "모든 프로젝트의 작업을 한 보드에서 봅니다";
    a.innerHTML = ICON + '<span style="flex:1 1 auto;min-width:0">칸반</span>';
    a.addEventListener("click", (e) => {
      // let the browser handle new-tab / new-window clicks
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      // SPA navigation: push the URL, then let the host router (listens to popstate) render it.
      history.pushState(history.state, "", target(findIssuesLink()));
      window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
      closeMobileDrawer();
      sync();
    });
    ref.parentElement.insertBefore(a, ref);
    sync();
  }

  tryInject();
  const mo = new MutationObserver(() => tryInject());
  mo.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("popstate", sync);
  setInterval(tryInject, 2000);
  // an old bookmark of the retired in-page board opens the new board
  if (location.hash === "#agentos-kanban") {
    setTimeout(() => document.getElementById(NAV_ID)?.click(), 800);
  }
})();
