# AgentOS design system

AgentOS is a local operations console. The attached video frame informs its density and dark tone; its logos, copy, and artwork are not reused.

## Layout

- Desktop (>= 1100px): 268px fixed sidebar, 1px divider, fluid main area with a 1120px readable content limit. The chat transcript may use the full remaining width.
- Tablet (600–1099px): 72px icon rail, a collapsible navigation sheet, and a single main column.
- Mobile (< 600px): 56px top bar, navigation drawer, horizontal feature tabs, stacked cards, and a composer anchored after the transcript. No horizontal page scrolling at 375px.
- The board scrolls horizontally inside its own region. Its columns retain a 260px minimum width.

## Tokens

| Token              | Value     | Use                             |
| ------------------ | --------- | ------------------------------- |
| `--bg`             | `#0d1110` | App background                  |
| `--sidebar`        | `#141917` | Navigation                      |
| `--surface`        | `#191f1c` | Panels                          |
| `--surface-raised` | `#222a25` | Hover and selected surfaces     |
| `--border`         | `#303a33` | Subtle separators               |
| `--text`           | `#eef1e9` | Primary text                    |
| `--muted`          | `#a1aaa0` | Secondary text                  |
| `--accent`         | `#a4c997` | Actions and focus               |
| `--blue`           | `#82afd4` | In progress                     |
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
