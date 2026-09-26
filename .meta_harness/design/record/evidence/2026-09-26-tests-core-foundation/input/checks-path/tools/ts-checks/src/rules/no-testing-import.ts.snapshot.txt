import { isTestPath, scanLines, type Rule } from '../rule.ts'

/** 装配节点 verification 点名：产品源码不得 import 任何包的 `./testing` 子入口（测试装配、可控时钟只给测试）。 */
export const noTestingImport: Rule = {
  id: 'no-testing-import',
  source: 'apps/tenancy-host verification · kernel-basis／offer-expiry 节点「./testing 只给测试」',
  description: '产品源码不得 import @omne-harness-lite/*/testing',
  check(files) {
    return scanLines(
      this,
      files,
      /from\s+['"]@omne-harness-lite\/[^'"]+\/testing['"]/,
      '产品源码 import 了 ./testing 子入口；测试装配与可控时钟只给测试',
      path => isTestPath(path),
    )
  },
}
