import type { Rule, Violation } from '@omne-harness/repo-toolchain/core/rule'
import { ACCOUNT_IDENTITY_SRC, productSourceIn } from '../layout.ts'
import {
  codeMatches,
  isCode,
  lineAt,
  matchClose,
  viewsOf,
} from '@omne-harness/repo-toolchain/core/source-text'

/**
 * AI design R-8（节点 verification「持锁段里没有 credentials 调用」一行的形式 ①）：
 * 账号能力包源码里，`storage.write(`/`persistence.write(` 调用的实参（即写事务回调）的词法范围内不出现
 * `credentials.verify(`／`derive(`／`checkPolicy(`／`parse(`。scrypt 若进了持锁段，登录负载会让本库一切写排队。
 * 只看词法范围：经辅助函数（例如回调里调的 `#issueCommitted`）的间接调用看不到，由形式 ② 的替身标记测试补。
 */
export const aiR8NoCredentialInWrite: Rule = {
  id: 'ai-r8-no-credential-in-write',
  source:
    'capability.account-identity v2 S-30 第 4 行 · account-identity 节点 design R-8 与 verification「持锁段里没有 credentials 调用」',
  description:
    '账号能力包源码里 storage.write/persistence.write( 的回调体内不出现 credentials.verify/derive/checkPolicy/parse 调用',
  check(files) {
    const out: Violation[] = []
    for (const file of files) {
      if (!productSourceIn(file.path, ACCOUNT_IDENTITY_SRC)) continue
      const views = viewsOf(file)
      for (const write of codeMatches(views, /\b(?:storage|persistence)\s*\??\.\s*write\s*\(/)) {
        const open = write.index + write[0].length - 1
        const close = matchClose(views.skeleton, open)
        if (close === -1) continue
        const scope = views.code.slice(0, close)
        const inside = /\bcredentials\s*[?!]?\.\s*(verify|derive|checkPolicy|parse)\s*\(/g
        inside.lastIndex = open
        for (let m = inside.exec(scope); m !== null; m = inside.exec(scope)) {
          if (!isCode(views, m.index)) continue
          out.push({
            rule: this.id,
            path: file.path,
            line: lineAt(file.text, m.index),
            message: `storage.write/persistence.write( 的回调里调了 credentials.${m[1]}(；凭据计算在写事务之前对快照做（R-8）`,
          })
        }
      }
    }
    return out
  },
}
