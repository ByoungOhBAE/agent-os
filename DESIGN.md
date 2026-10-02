# AgentOS design system

## 2026 console direction · Operations ledger

Audience: one local operator scanning current-board work, deciding what needs review, then opening the source task or session. The console should feel like a calm, precise operations ledger rather than a marketing analytics template. Domain vocabulary: board, task, review, run, source, observation, profile, memory. Physical color world: graphite workstation, slate screen, desaturated sage status light, warm paper notes, amber warning lamp, oxidized red fault indicator. Signature: a board-derived **work ledger**—one dominant current-board count, a thin proportional status track, and a compact attention queue; no fabricated global metrics.

Reject: three equal KPI cards → one source-scoped work ledger; luminous gradient agent tiles → quiet monogram plaques; colored sidebar separate from page → continuous ink canvas with a single boundary. No decorative accent gradients. Success and warnings keep their meaning even without color.

Tokens: ink `#101716`, canvas `#141b19`, panel `#1b2420`, raised `#25302a`, inset `#101815`, soft border `rgba(219,233,211,.10)`, primary text `#edf1e9`, secondary `#b4beb0`, tertiary `#89998b`, signal `#bdd1aa`; blue/amber/red reserved for semantic states. Four-pixel spacing grid; 12–16px component padding, 24–32px section rhythm. Borders-only depth, no decorative shadows. Compact 14px body / 12px metadata / 22px section / 32px page heading; weight and tone separate value, label and provenance. System Korean-capable font stack. One 4/8/12px radius scale for controls/panels/drawers.

The work ledger and connection panels distinguish empty, loading, unavailable, stale, and observed states. Every control retains keyboard focus and 40px+ hit area. At 1440 the work ledger is dominant beside a narrow attention queue; at 768 the sidebar becomes a rail and the queue stacks; at 375 the nav is a drawer and only the board region scrolls horizontally. Keep Korean words intact, wrap identifiers anywhere. The Paperclip-hosted Hermes read-only plugin uses the same ink/sage hierarchy but inherits its host's navigation and does not invent write actions.

AgentOS is a local operations console. The attached video frame informs its density and dark tone; its logos, copy, and artwork are not reused.

## Layout

- Desktop (>= 1100px): 268px fixed sidebar, 1px divider, fluid main area with a 1500px content limit. The chat transcript may use the full remaining width.
- Tablet (600–1099px): 72px icon rail, a collapsible navigation sheet, and a single main column.
- Mobile (< 600px): 56px top bar, navigation drawer, horizontal feature tabs, stacked cards, and a composer anchored after the transcript. No horizontal page scrolling at 375px.
- The board scrolls horizontally inside its own region. Its columns retain a 260px minimum width.

## Tokens

| Token              | Value     | Use                             |
| ------------------ | --------- | ------------------------------- |
| `--bg`             | `#101716` | App background                  |
| `--sidebar`        | `#141b19` | Navigation                      |
| `--surface`        | `#1b2420` | Panels                          |
| `--surface-raised` | `#25302a` | Hover and selected surfaces     |
| `--border`         | `rgba(219,233,211,.10)` | Subtle separators   |
| `--text`           | `#edf1e9` | Primary text                    |
| `--muted`          | `#b4beb0` | Secondary text                  |
| `--accent`         | `#bdd1aa` | Actions and focus               |
| `--blue`           | `#a5bdd0` | In progress                     |
| `--amber`          | `#e1bc78` | Waiting and warning             |
| `--red`            | `#e18e88` | Failure and destructive actions |

Use system UI fonts with Korean fallbacks (`Pretendard`, `Malgun Gothic`); use `Consolas` for IDs, status codes, and times. Body text is 14–16px, section titles 18–22px, page titles 34px desktop and 28px mobile. Spacing follows a 4px grid with 8, 12, 16, 24, and 32px as the common intervals. Radius: 10px controls, 14px panels. Icons never carry meaning without text or an accessible name.

## Components and states

- Sidebar: Workspace, Orchestration, Agents; selected item has a filled surface and 3px accent rail. Search is available from the keyboard.
- Agent header: name, runtime/provider label, connection indicator, concise capability summary. Tabs exist only for supported or explicitly marked preview functions.
- Sessions: list, search, provider/profile badge, last activity, message count, selected detail, rename/archive actions when supported.
- Skills: category and source filters, enabled switch, provenance, usage. Mutation waits for a server response; errors restore the previous state. Installing from a hub requires a separate explicit action.
- Kanban: columns for Hermes statuses; cards show title, assignee, priority, and status. A detail drawer contains full body, comments, and safe status actions. Never silently move a running card.
- Chat: profile selector, session switcher, streaming output, tool progress, approval panel, stop button, disconnected banner. Partial output is preserved on failure.
- Each data view has distinct empty, initial loading, refresh, error, unauthorized, and offline states with a retry action when appropriate.

## Interaction and accessibility

- All actions are semantic buttons/links. Logical tab order starts with navigation, then header/tabs, then page content. The skip link jumps to main.
- `:focus-visible` uses a 2px accent outline and 3px offset. Hover is never the only indication.
- Status uses text plus icon/color. Live run updates use a polite live region; approval requests use an assertive announcement. Streaming text is throttled before announcing.
- Reduced-motion preference disables decorative movement; animations do not gate progress feedback.
- Korean copy must wrap at word boundaries where possible. Truncation is reserved for secondary previews; titles and approval requests remain readable.
- Test at 1440, 768, and 375px, with keyboard-only navigation and 200% zoom.
