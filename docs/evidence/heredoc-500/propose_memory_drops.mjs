// Propose (NOT apply) dropping the two bot memories that blame "Korean JSON heredoc" for HTTP 500 — the cause was the
// Windows backslash collapse, now fixed in Hermes (docs/hermes-local-patches.md #4). Drops wait for the owner's approval.
import { overview, decide } from "../../../server/bot-knowledge.mjs";
const ov = overview();
const hits = ov.bots.flatMap((b) => b.carried.filter((c) => /heredoc/i.test(c.text) && /500/.test(c.text)).map((c) => ({ bot: b.name, profile: b.profile, hash: c.hash, text: c.text, decision: c.decision })));
console.log(JSON.stringify(hits.map((h) => ({ bot: h.bot, key: `${h.profile}#${h.hash}`, prev: h.decision?.action ?? null, text: h.text.slice(0, 120) })), null, 1));
const reason = "이 기억은 '한글 JSON을 heredoc으로 보내면 500'이라고 원인을 적었지만, 재현·독립 검수 결과 진짜 원인은 Windows 터미널이 명령 속 역슬래시 두 개를 하나로 줄여 JSON이 깨진 것이었음(한글 본문은 정상, docs/evidence/heredoc-500). Hermes 로컬 수정(#4)으로 고쳐졌고, 역슬래시 든 본문은 파일로 보내라는 규칙이 지시문·공통 지식에 들어가 이 기억은 틀린 원인 설명만 남음.";
if (hits.length) console.log(JSON.stringify(await decide({ items: hits.map((h) => ({ profile: h.profile, hash: h.hash, action: "drop", reason })), by: "운영자(heredoc-500 정정)" })));
