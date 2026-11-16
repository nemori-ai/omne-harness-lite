import type { Rule } from '@omne-harness/repo-toolchain/core/rule'
import { ENTRY_SRC, productSourceIn } from '../layout.ts'
import { scanCode } from '@omne-harness/repo-toolchain/core/source-text'

export const credentialsParseOnly: Rule = {
  id: 'credentials-parse-only',
  source: 'composition.governance-center-entry v1 S-19 · governance-center-entry 节点约束第 7 条',
  description: '入口层包源码不出现 .derive(、.verify(、.checkPolicy( 调用',
  check(files) {
    return scanCode(
      this.id,
      files,
      path => productSourceIn(path, ENTRY_SRC),
      /\.\s*(derive|verify|checkPolicy)\s*\(/,
      m => `调用了 .${m[1]}(；入口层对 credentials 只调 parse，凭据判定归账号能力`,
    )
  },
}
