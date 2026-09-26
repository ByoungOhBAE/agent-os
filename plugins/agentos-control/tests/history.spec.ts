import { describe, expect, it } from "vitest";
import { readableUserText } from "../src/worker.js";

// Shapes copied from real Hermes rows (group-round-prompt.ts buildGroupChatTurnPrompt + compaction handoffs).
const roomPrompt = [
  '[Group chat: "림버스 개발방"] You are @ub514, one participant in a group chat with 개발자 (@uac1c) and the user.',
  "",
  "New messages in the room since your last turn (oldest first):",
  "  You (user): 스킬 교체도 공략에 넣어줘",
  "  개발자: 확인했습니다",
  "",
  "Rules for this room:",
  "- Reply with ONE conversational message ONLY if you have something new worth adding.",
].join("\n");

describe("기록 표시용 사용자 문장", () => {
  it("그룹방 프롬프트에서 방에 올라온 줄만 남긴다", () => {
    expect(readableUserText(roomPrompt)).toBe("You (user): 스킬 교체도 공략에 넣어줘\n개발자: 확인했습니다");
  });
  it("압축 뒤 재진술 머리말을 벗기고 같은 규칙을 적용한다", () => {
    expect(readableUserText(`[STILL IN PROGRESS — this is the active request, restated.]\n${roomPrompt}`))
      .toBe("You (user): 스킬 교체도 공략에 넣어줘\n개발자: 확인했습니다");
  });
  it("컨텍스트 압축 인계문은 숨긴다", () => {
    expect(readableUserText("[CONTEXT COMPACTION — REFERENCE ONLY] Earlier turns were compacted")).toBeNull();
  });
  it("일반 1:1 메시지는 그대로 둔다(양성 대조)", () => {
    expect(readableUserText("안녕, 오늘 할 일 알려줘")).toBe("안녕, 오늘 할 일 알려줘");
  });
});
