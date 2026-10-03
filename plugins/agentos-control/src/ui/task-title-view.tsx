// 작업 제목 화면 표시: 소속 경로는 작게, 실제 할 일 이름은 굵게, 다시 한 작업은 "N회차".
// Shared by the 통합 관제 (chief desk) and the project hub; the full title stays available on hover.
import { displayTitle, shortPath } from "../task-title.js";

export function TaskTitle({ title, className }: { title: string; className?: string }) {
  const d = displayTitle(title);
  const path = shortPath(d.path);
  const tag = d.tag ? d.tag.replace(/^\[|\]$/g, "") : null;
  return (
    <span className={`tt${className ? ` ${className}` : ""}`} title={title} data-task-title="">
      {(tag || path) && (
        <span className="tt-path" data-tt-path="">
          {tag && <span className="tt-tag">{tag}</span>}
          {path}
        </span>
      )}
      <span className="tt-name" data-tt-name="">
        {d.name}
        {d.seq !== null && d.seq > 1 && <span className="tt-seq" data-tt-seq={d.seq}>{d.seq}회차</span>}
      </span>
    </span>
  );
}

export const TASK_TITLE_CSS = `
.tt{display:flex;flex-direction:column;gap:2px;min-width:0}
.tt-path{display:flex;align-items:center;gap:6px;min-width:0;font-size:11px;font-weight:400;line-height:1.4;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tt-tag{flex:none;font-size:10px;font-weight:600;padding:0 5px;border-radius:4px;border:1px solid currentColor;line-height:16px}
.tt-name{min-width:0;word-break:keep-all;overflow-wrap:anywhere}
.tt-seq{display:inline-block;margin-left:6px;font-size:11px;font-weight:600;padding:0 6px;border-radius:999px;border:1px solid currentColor;opacity:.8;line-height:17px;vertical-align:1px;white-space:nowrap}
`;
