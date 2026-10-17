import type { Rule } from '@omne-harness/repo-toolchain/core/rule'
import { ENTRY_SRC, productSourceIn } from '../layout.ts'
import { scanCode } from '@omne-harness/repo-toolchain/core/source-text'

/**
 * 入口 verification「`credentials` 只调 `parse`」、design「本节点约束」第 7 条（契约 S-19）：
 * 凭据的判定（`derive`、`verify`、`checkPolicy`）只由账号能力调用。文本规则不知道接收者是谁，
 * 所以入口层包源码里这三个方法名的任何调用都报出——本包路由表里本来就没有别的 `verify`／`derive`。
 */
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
