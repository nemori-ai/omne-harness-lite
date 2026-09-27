import type { Rule, Violation } from '../rule.ts'
import { ENTRY_OPS, ENTRY_TRANSPORT, tenancyPackageOf } from '../layout.ts'
import { codeMatches, importsOf, lineAt, viewsOf } from '../source-text.ts'

const NETWORK_MODULES = /^(?:node:)?(?:http|https|net|tls)$/

/**
 * 入口 verification「网络监听只在本包（R-20）」（契约 S-25；提案「能力间内部面不直接暴露」）：
 * `tenancy/*` 的包源码不得导入 `node:http`／`node:https`／`node:net`／`node:tls`（不带 `node:` 前缀的同名模块也算），
 * 也不得调用 `.listen(`；入口层包之内也只许在客户端面 `src/transport/**` 与运维面 `src/ops/**` 出现。
 */
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
