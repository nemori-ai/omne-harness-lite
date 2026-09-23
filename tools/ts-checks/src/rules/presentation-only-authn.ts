import type { Rule, Violation } from '../rule.ts'
import { ENTRY_SRC, productSourceIn } from '../layout.ts'
import { codeMatches, lineAt, matchClose, scanCode, viewsOf } from '../source-text.ts'

const ACCOUNTS_KEY = `(?:['"\`]accounts['"\`]|\\bACCOUNTS_SERVICE\\b)`

/**
 * 入口 verification「只凭出示物认人」、design「本节点约束」第 8 条（契约 S-11；AI v2 S-30「只有 S-44 认出示物」）：
 * 入口层包源码不出现对 `logins` 的 `.verify(`（文本规则不分接收者，任何 `.verify(` 都报）、
 * 不出现 `parseLoginStateId`（导入或经命名空间调用都算）、不出现 `as LoginStateId` 与 `<LoginStateId>` 断言。
 * 本包手里的 `LoginStateId` 因此只能来自 AI S-15、S-44、S-37 的返回。
 *
 * 另（入口 design「能力到 Cordis 的投影」S-24 行，主线 2026-09-23 裁决并入本规则）：入口层不 inject `accounts`，
 * 源码里不出现 `accounts` 服务名的解析——`inject: [...]`／`{...}`、`ctx.inject([...])`、`ctx.get(…)`、
 * `resolveOptional(ctx, …)` 里的 `'accounts'`，以及 `ACCOUNTS_SERVICE` 常量的任何引用。
 */
export const presentationOnlyAuthn: Rule = {
  id: 'presentation-only-authn',
  source:
    'composition.governance-center-entry v1 S-11、S-24 · capability.account-identity v2 S-30 第 10 行 · governance-center-entry 节点约束第 8 条',
  description:
    '入口层包源码不出现 .verify(、parseLoginStateId、as LoginStateId、<LoginStateId> 断言，也不解析 accounts 服务',
  check(files) {
    const inEntry = (path: string) => productSourceIn(path, ENTRY_SRC)
    return [
      ...scanCode(
        this.id,
        files,
        inEntry,
        /\.\s*verify\s*\(|\bparseLoginStateId\b|\bas\s+LoginStateId\b|(?:^|[^\w$)\]>\s])\s*<\s*LoginStateId\s*>/m,
        m =>
          `出现了 ${m[0].trim()}；入口层只凭出示物认人（logins.exchange），不把线上的 LoginStateId 当认人依据`,
      ),
      ...accountsResolution(this.id, files, inEntry),
    ]
  },
}

function accountsResolution(
  rule: string,
  files: Parameters<Rule['check']>[0],
  include: (path: string) => boolean,
): Violation[] {
  const out: Violation[] = []
  const message = '入口层解析了 accounts 服务；入口层不 inject accounts（S-24 有意不投影）'
  for (const file of files) {
    if (!include(file.path)) continue
    const views = viewsOf(file)
    const push = (index: number) =>
      out.push({ rule, path: file.path, line: lineAt(file.text, index), message })
    const direct = new RegExp(
      `\\.\\s*get\\s*(?:<[^>(]*>)?\\s*\\(\\s*${ACCOUNTS_KEY}|\\bresolveOptional\\s*(?:<[^>(]*>)?\\s*\\(\\s*[\\w$.]+\\s*,\\s*${ACCOUNTS_KEY}`,
    )
    for (const m of codeMatches(views, direct)) push(m.index)
    for (const m of codeMatches(views, /\binject\s*(?::|=|\()\s*[[{]/)) {
      const open = m.index + m[0].length - 1
      const close = matchClose(views.skeleton, open)
      if (close !== -1 && new RegExp(ACCOUNTS_KEY).test(views.code.slice(open, close)))
        push(m.index)
    }
    for (const m of codeMatches(views, /\bACCOUNTS_SERVICE\b/)) push(m.index)
  }
  return out
}
