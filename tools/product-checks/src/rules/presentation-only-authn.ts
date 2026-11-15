import type { Rule, Violation } from '@omne-harness/repo-toolchain/core/rule'
import { ENTRY_SRC, productSourceIn } from '../layout.ts'
import {
  codeMatches,
  lineAt,
  scanCode,
  viewsOf,
} from '@omne-harness/repo-toolchain/core/source-text'

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
