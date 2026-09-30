// Pure checks for the `hermes-bots.mjs hire` gate (no I/O, so they can be tested with `node --test`).
// Paperclip accepts issue document keys only in the form ^[a-z0-9][a-z0-9_-]*$, so a Korean bot name
// (부서_업무) cannot be used in the key `role-<name>`. The caller then names the reviewed role document
// with `--role-doc role-<english>`, and the document's first line `# <bot name>` ties it to the bot.

export const ROLE_DOC_KEY_RE = /^role-[a-z0-9][a-z0-9_-]*$/;

/**
 * Decide which issue document holds the role text.
 * @param {string} name bot name (부서_업무)
 * @param {string|undefined} roleDocArg value of --role-doc; undefined when the flag was not given, "" when given without a value
 * @returns {{ ok: true, key: string } | { ok: false, error: string }}
 */
export function resolveRoleDocKey(name, roleDocArg) {
  if (roleDocArg !== undefined) {
    const key = String(roleDocArg);
    if (!ROLE_DOC_KEY_RE.test(key))
      return { ok: false, error: `--role-doc "${key}" 형식이 틀렸습니다. role- 뒤에 영어 소문자·숫자·-·_ 만 쓸 수 있습니다 (예: --role-doc role-content-blog)` };
    return { ok: true, key };
  }
  const key = `role-${name}`;
  if (!ROLE_DOC_KEY_RE.test(key))
    return { ok: false, error: `봇 이름 "${name}" 에 한글 등이 있어 문서 이름 ${key} 을 Paperclip이 받지 않습니다. 역할서를 영어 이름 문서로 올리고 \`--role-doc role-<영문>\` 을 지정하세요 (예: --role-doc role-content-blog)` };
  return { ok: true, key };
}

/** The first line of the role document must be exactly `# <bot name>` (BOM and CR line endings ignored). */
export function roleDocTitleMatches(body, name) {
  const first = String(body ?? "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n")[0];
  return first === `# ${name}`;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A reviewer comment approves the role document when it starts with "## 완료" and names the exact document key. */
export function isRoleReviewApproval(commentBody, key) {
  const body = String(commentBody ?? "").trim();
  if (!/^##\s*완료/.test(body)) return false;
  // exact key: `role-content-blog` must not be satisfied by a mention of `role-content-blog2`
  return new RegExp(`(?<![a-z0-9_-])${escapeRe(key)}(?![a-z0-9_-])`).test(body);
}
