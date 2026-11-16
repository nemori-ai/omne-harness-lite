import type { Rule, Violation } from '@omne-harness/repo-toolchain/core/rule'
import { ENTRY_OPS, ENTRY_TRANSPORT, tenancyPackageOf } from '../layout.ts'
import {
  codeMatches,
  importsOf,
  lineAt,
  viewsOf,
} from '@omne-harness/repo-toolchain/core/source-text'

const NETWORK_MODULES = /^(?:node:)?(?:http|https|net|tls)$/

export const noNetworkListenInTenancy: Rule = {
  id: 'no-network-listen-in-tenancy',
  source:
    'composition.governance-center-entry v1 S-25 · governance-center-entry verification「网络监听只在本包（R-20）」',
  description:
    'tenancy/*/src 只有入口层包的 src/transport/** 与 src/ops/** 可以导入 node:http/https/net/tls 或调用 .listen(',
  check(files) {
    const out: Violation[] = []
    for (const file of files) {
      if (tenancyPackageOf(file.path) === undefined) continue
      if (file.path.startsWith(ENTRY_TRANSPORT) || file.path.startsWith(ENTRY_OPS)) continue
      const push = (index: number, message: string) =>
        out.push({ rule: this.id, path: file.path, line: lineAt(file.text, index), message })
      for (const ref of importsOf(file)) {
        if (ref.specifier !== undefined && NETWORK_MODULES.test(ref.specifier)) {
          push(ref.index, `导入了 ${ref.specifier}；网络监听只在入口层包的客户端面与运维面`)
        }
      }
      for (const m of codeMatches(viewsOf(file), /\.\s*listen\s*\(/)) {
        push(m.index, '调用了 .listen(；网络监听只在入口层包的客户端面与运维面')
      }
    }
    return out
  },
}
