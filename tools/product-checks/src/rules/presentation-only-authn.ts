import type { Rule, Violation } from '@omne-harness/repo-toolchain/core/rule'
import { ENTRY_SRC, productSourceIn } from '../layout.ts'
import {
  codeMatches,
  lineAt,
  scanCode,
  viewsOf,
} from '@omne-harness/repo-toolchain/core/source-text'

/**
 * 入口 verification「只凭出示物认人」、design「本节点约束」第 8 条（契约 S-11；AI v2 S-30「只有 S-44 认出示物」）：
 * 入口层包源码不出现对 `logins` 的 `.verify(`（文本规则不分接收者，任何 `.verify(` 都报）、
 * 不出现 `parseLoginStateId`（导入或经命名空间调用都算）、不出现 `as LoginStateId` 与 `<LoginStateId>` 断言。
 * 本包手里的 `LoginStateId` 因此只能来自 AI S-15、S-44、S-37 的返回。
 *
 * EC2 S50 / D044 允许装配 accounts 的显式参与面，仅供已授权的按名邀请。
 * accounts 的直接方法调用只许 participate / resolveActivatedIdentifier；不能以账号读取、
 * 生产、激活或清除代替认人。别名/接收者类型仍由类型与动态测试补足。
 */
export const presentationOnlyAuthn: Rule = {
  id: 'presentation-only-authn',
  source:
    'composition.governance-center-entry v2 S-11、S-24、S-50 · capability.account-identity v3 S-30 第 10 行 · governance-center-entry 节点约束第 8 条',
  description:
    '入口层包源码不出现 .verify(、parseLoginStateId、as LoginStateId、<LoginStateId> 断言，accounts 只调用 participate / resolveActivatedIdentifier',
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
      ...accountsAccess(this.id, files, inEntry),
    ]
  },
}

function accountsAccess(
  rule: string,
  files: Parameters<Rule['check']>[0],
  include: (path: string) => boolean,
): Violation[] {
  const out: Violation[] = []
  for (const file of files) {
    if (!include(file.path)) continue
    for (const m of codeMatches(viewsOf(file), /\baccounts\s*\.\s*([\w$]+)\s*\(/)) {
      if (m[1] === 'participate' || m[1] === 'resolveActivatedIdentifier') continue
      out.push({
        rule,
        path: file.path,
        line: lineAt(file.text, m.index),
        message: 'EC2 入口 accounts 只供显式参与与授权后的标识定位，不作为认人或账号管理入口',
      })
    }
  }
  return out
}
