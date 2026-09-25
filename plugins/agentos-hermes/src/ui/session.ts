import { sessionPattern } from "../bff.js";

/** 플러그인 페이지 내부 경로. 세션 ID는 BFF와 같은 형식만 허용한다. */
export function sessionHref(id: string | null): string {
  if (id === null || !sessionPattern.test(id)) return "/hermes";
  return `/hermes?${new URLSearchParams({ session: id })}`;
}

/** 호스트 URL의 `?session=`을 읽고, 형식이 맞지 않으면 무시한다. */
export function selectedSession(search: string): string | null {
  const id = new URLSearchParams(search).get("session");
  return id && sessionPattern.test(id) && id !== "." && id !== ".." ? id : null;
}

const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

/** 실제 청구 기록 > 추정 > 구독 포함 > 미기록 순. 기록이 없으면 0으로 쓰지 않는다. */
export function costLabel(cost: { status?: string | null; estimated_usd?: number | null; actual_usd?: number | null } | undefined, billingMode?: string | null): string {
  if (typeof cost?.actual_usd === "number") return `실제 비용 ${usd(cost.actual_usd)} (Hermes 기록)`;
  if (cost?.status === "included" || (billingMode === "subscription_included" && cost?.status !== "estimated")) return "구독 포함으로 기록됨 · 별도 금액 없음";
  if (typeof cost?.estimated_usd === "number" && cost.status === "estimated") return `추정 비용 ${usd(cost.estimated_usd)} (청구액 아님)`;
  if (typeof cost?.estimated_usd === "number") return `추정값 ${usd(cost.estimated_usd)} · 상태 ${cost.status || "미기록"} (신뢰도 낮음)`;
  return "비용 미기록";
}

export function billingLabel(mode: string | null | undefined): string {
  if (!mode) return "미기록";
  if (mode === "subscription_included") return "구독 포함 (subscription_included)";
  return `${mode} (API 호출 방식 기록 · 구독/종량 여부는 별도 확인 필요)`;
}
