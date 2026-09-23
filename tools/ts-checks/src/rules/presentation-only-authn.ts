import type { Rule } from '../rule.ts'
import { ENTRY_SRC, productSourceIn } from '../layout.ts'
import { scanCode } from '../source-text.ts'

/**
 * 入口 verification「只凭出示物认人」、design「本节点约束」第 8 条（契约 S-11；AI v2 S-30「只有 S-44 认出示物」）：
 * 入口层包源码不出现对 `logins` 的 `.verify(`（文本规则不分接收者，任何 `.verify(` 都报）、
 * 不出现 `parseLoginStateId`（导入或经命名空间调用都算）、不出现 `as LoginStateId` 与 `<LoginStateId>` 断言。
 * 本包手里的 `LoginStateId` 因此只能来自 AI S-15、S-44、S-37 的返回。
 */
export const presentationOnlyAuthn: Rule = {
  id: 'presentation-only-authn',
  source:
    'composition.governance-center-entry v1 S-11 · capability.account-identity v2 S-30 第 10 行 · governance-center-entry 节点约束第 8 条',
  description:
    '入口层包源码不出现 .verify(、parseLoginStateId、as LoginStateId 与 <LoginStateId> 断言',
  check(files) {
    return scanCode(
      this.id,
      files,
      path => productSourceIn(path, ENTRY_SRC),
      /\.\s*verify\s*\(|\bparseLoginStateId\b|\bas\s+LoginStateId\b|(?:^|[^\w$)\]>\s])\s*<\s*LoginStateId\s*>/m,
      m =>
        `出现了 ${m[0].trim()}；入口层只凭出示物认人（logins.exchange），不把线上的 LoginStateId 当认人依据`,
    )
  },
}
