import { isTestPath, type Rule, type Violation } from '@omne-harness/repo-toolchain/core/rule'
import { lineAt } from '@omne-harness/repo-toolchain/core/source-text'
import { syntaxImports, syntaxOf } from '@omne-harness/repo-toolchain/core/syntax'
import { NO_TESTING_ENTRIES, type TestingEntries } from '../testing-entries.ts'

/**
 * 装配节点 verification 点名：产品源码不得 import 任何包的 `./testing` 子入口（测试装配、可控时钟只给测试）。
 * 测试路径、精确声明的 testing 入口与合法成员的直接 acceptance 目录豁免。
 */
export function createNoTestingImport(declared: TestingEntries): Rule {
  const acceptanceDirectories = [...declared.acceptanceDirectories]
  return {
    id: 'no-testing-import',
    source:
      'apps/tenancy-host verification · kernel-basis／offer-expiry 节点「./testing 只给测试」',
    description:
      '产品源码不得 import @omne-harness/*/testing；测试路径、声明入口与成员直接验收目录除外',
    check(files) {
      const out: Violation[] = declared.unparsable.map(path => ({
        rule: this.id,
        path,
        line: 1,
        message: 'package.json 无法解析，不能核对它声明的 ./testing 入口',
      }))
      for (const file of files) {
        if (
          isTestPath(file.path) ||
          declared.entries.has(file.path) ||
          acceptanceDirectories.some(directory => file.path.startsWith(directory))
        )
          continue
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
}

/** 不带任何已声明入口的默认规则：只豁免测试路径。 */
export const noTestingImport: Rule = createNoTestingImport(NO_TESTING_ENTRIES)
