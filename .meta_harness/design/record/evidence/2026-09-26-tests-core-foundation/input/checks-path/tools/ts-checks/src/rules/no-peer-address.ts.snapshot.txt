import type { Rule } from '../rule.ts'
import { ENTRY_SRC, productSourceIn } from '../layout.ts'
import { scanCode } from '../source-text.ts'

/**
 * 入口 verification「不读对端地址」、design「本节点约束」第 2 条（契约 S-16 不按来者区别对待）：
 * 入口层包源码不出现对端地址一类读取——套接字的 `remoteAddress`／`remotePort`／`remoteFamily`，
 * 以及转发头 `x-forwarded-for`、`x-real-ip`、`forwarded`（字面量或 `.forwarded` 成员，大小写不论）。
 */
export const noPeerAddress: Rule = {
  id: 'no-peer-address',
  source: 'composition.governance-center-entry v1 S-16 · governance-center-entry 节点约束第 2 条',
  description:
    '入口层包源码不出现 remoteAddress、remotePort、remoteFamily 与 x-forwarded-for／x-real-ip／forwarded 头的读取',
  check(files) {
    return scanCode(
      this.id,
      files,
      path => productSourceIn(path, ENTRY_SRC),
      /\bremote(?:Address|Port|Family)\b|['"`](?:x-forwarded-for|x-real-ip|forwarded)['"`]|\.\s*forwarded\b/i,
      m => `读取了对端地址（${m[0]}）；入口层不按来者区别对待，不读对端地址`,
    )
  },
}
