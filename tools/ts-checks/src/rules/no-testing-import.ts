import { isTestPath, type Rule, type Violation } from '../rule.ts'
import { lineAt } from '../source-text.ts'
import { syntaxImports, syntaxOf } from '../syntax.ts'

/** 装配节点 verification 点名：产品源码不得 import 任何包的 `./testing` 子入口（测试装配、可控时钟只给测试）。 */
export const noTestingImport: Rule = {
  id: 'no-testing-import',
  source: 'apps/tenancy-host verification · kernel-basis／offer-expiry 节点「./testing 只给测试」',
  description: '产品源码不得 import @omne-harness/*/testing',
  check(files) {
    const out: Violation[] = []
    for (const file of files) {
      if (isTestPath(file.path)) continue
      for (const ref of syntaxImports(syntaxOf(file))) {
        if (
          ref.specifier !== undefined &&
          /^@omne-harness\/[^/]+\/testing(?:\/|$)/.test(ref.specifier)
        )
          out.push({
            rule: this.id,
            path: file.path,
            line: lineAt(file.text, ref.index),
            message: '产品源码 import 了 ./testing 子入口；测试装配与可控时钟只给测试',
          })
      }
    }
    return out
  },
}
