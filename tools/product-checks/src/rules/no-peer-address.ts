import type { Rule } from '@omne-harness/repo-toolchain/core/rule'
import { ENTRY_SRC, productSourceIn } from '../layout.ts'
import { scanCode } from '@omne-harness/repo-toolchain/core/source-text'

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
