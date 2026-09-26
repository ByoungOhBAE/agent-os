// Tiny, safe markdown for chief plans/reports: headings, paragraphs, bullet/numbered lists, tables, fenced code,
// **bold**, `code` and [links](/path). Produces React nodes only (no HTML injection); anything unknown stays plain
// text. Links are limited to same-site paths and https URLs (no javascript:/data: or protocol-relative //host).
import { Fragment, type ReactNode } from "react";

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "code"; text: string };

const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isRule = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^\s*```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { out.push({ kind: "heading", level: Math.min(h[1].length, 3) as 1 | 2 | 3, text: h[2].trim() }); i++; continue; }
    if (/^\s*\|/.test(line) && i + 1 < lines.length && isRule(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push({ kind: "table", head, rows });
      continue;
    }
    const li = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(line);
    if (li) {
      const ordered = !li[1];
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(lines[i]);
        if (!m || !m[1] === !ordered) break;
        items.push(m[3]);
        i++;
      }
      out.push({ kind: "list", ordered, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*```|\s*(?:[-*+]|\d+[.)])\s)/.test(lines[i])
      && !(/^\s*\|/.test(lines[i]) && i + 1 < lines.length && isRule(lines[i + 1]))) para.push(lines[i++].trim());
    out.push({ kind: "paragraph", text: para.join("\n") });
  }
  return out;
}

export function safeHref(href: string) {
  return (/^\/(?!\/)/.test(href) || /^https:\/\//.test(href)) && !/[\s"'<>]/.test(href);
}

export function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] !== undefined) parts.push(<strong key={k++}>{m[1]}</strong>);
    else if (m[2] !== undefined) parts.push(<code key={k++} className="k-code">{m[2]}</code>);
    else if (safeHref(m[4])) parts.push(<a key={k++} className="k-link" href={m[4]} {...(m[4].startsWith("https://") ? { target: "_blank", rel: "noreferrer" } : {})}>{m[3]}</a>);
    else parts.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={`k-md ${className ?? ""}`}>
      {parseBlocks(text).map((b, i) => {
        if (b.kind === "heading") {
          const Tag = (["h3", "h4", "h5"] as const)[b.level - 1];
          return <Tag key={i} className="k-md-h">{inline(b.text)}</Tag>;
        }
        if (b.kind === "list") {
          const Tag = b.ordered ? "ol" : "ul";
          return <Tag key={i}>{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</Tag>;
        }
        if (b.kind === "table") {
          return (
            <div key={i} className="k-md-table" role="region" aria-label="표" tabIndex={0}>
              <table>
                <thead><tr>{b.head.map((c, j) => <th key={j} scope="col">{inline(c)}</th>)}</tr></thead>
                <tbody>{b.rows.map((r, j) => <tr key={j}>{b.head.map((_, x) => <td key={x}>{inline(r[x] ?? "")}</td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        }
        if (b.kind === "code") return <pre key={i} className="k-md-pre">{b.text}</pre>;
        return <p key={i}>{b.text.split("\n").map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>;
      })}
    </div>
  );
}

export const MARKDOWN_CSS = `
.k-md{display:grid;grid-auto-rows:max-content;gap:8px;font-size:14px;line-height:1.6;word-break:keep-all;overflow-wrap:anywhere;min-width:0}
.k-md p,.k-md ul,.k-md ol{margin:0}
.k-md ul,.k-md ol{padding-left:20px;display:grid;gap:2px}
.k-md-h{margin:6px 0 0;font-weight:650;line-height:1.35;color:var(--c-text)}
h3.k-md-h{font-size:16px}h4.k-md-h{font-size:15px}h5.k-md-h{font-size:14px;color:var(--c-secondary)}
.k-md-h:first-child{margin-top:0}
.k-md strong{font-weight:650;color:var(--c-text)}
.k-link{color:var(--c-accent);text-decoration:underline;text-underline-offset:2px}
.k-link:focus-visible{outline:2px solid var(--c-accent);outline-offset:2px;border-radius:2px}
.k-code{font-family:var(--c-mono,ui-monospace,monospace);font-size:12.5px;padding:1px 5px;border-radius:4px;background:var(--c-input);border:1px solid var(--c-line)}
.k-md-pre{margin:0;padding:10px 12px;border-radius:6px;background:var(--c-input);border:1px solid var(--c-line);font-family:var(--c-mono,ui-monospace,monospace);font-size:12.5px;white-space:pre-wrap;overflow-wrap:anywhere}
.k-md-table{overflow-x:auto;max-width:100%;flex-shrink:0;border:1px solid var(--c-line);border-radius:6px}
.k-md-table:focus-visible{outline:2px solid var(--c-accent);outline-offset:2px}
.k-md table{border-collapse:collapse;width:100%;font-size:13px}
.k-md th,.k-md td{padding:6px 10px;border-bottom:1px solid var(--c-line);text-align:left;vertical-align:top;min-width:64px}
.k-md th{font-weight:650;color:var(--c-secondary);background:var(--c-input);white-space:nowrap}
.k-md tr:last-child td{border-bottom:0}
`;
