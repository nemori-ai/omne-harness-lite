// 计时报告器：运行器随 JSON 报告一起挂给每个成员的 vitest（`--reporter=<本文件>`），补上 JSON 报告里没有的两样——
// 每个文件的导入耗时（vitest 的 collectDuration：导入模块并执行 describe 回调），与每条用例的实际时限和标签。
// 写到环境变量 OMNE_TEST_TIMING_FILE 指的路径；没设就什么都不写。只读 vitest 的公开报告器接口。
import { writeFileSync } from 'node:fs'
import type { Reporter, TestCase, TestModule } from 'vitest/node'

export const TIMING_FILE_ENV = 'OMNE_TEST_TIMING_FILE'

/** `<成员>.timing.json` 的形状。 */
export interface TimingReport {
  readonly files: readonly {
    /** 测试文件的绝对路径，与 JSON 报告的 `testResults[].name` 一致。 */
    readonly file: string
    readonly collectSeconds: number
    readonly tests: readonly {
      /** 与 JSON 报告的 `assertionResults[].fullName` 同一拼法：各层 describe 名与用例名以空格连接。 */
      readonly fullName: string
      /** vitest 解析后的时限；拿不到为 null。 */
      readonly timeoutSeconds: number | null
      readonly tags: readonly string[]
    }[]
  }[]
}

function fullNameOf(test: TestCase): string {
  const titles: string[] = []
  for (let parent = test.parent; parent.type === 'suite'; parent = parent.parent)
    titles.unshift(parent.name)
  return [...titles, test.name].join(' ')
}

const seconds = (milliseconds: number) => Math.round(milliseconds) / 1000

function timingOf(module: TestModule): TimingReport['files'][number] {
  return {
    file: module.moduleId,
    collectSeconds: seconds(module.diagnostic().collectDuration),
    tests: [...module.children.allTests()].map(test => ({
      fullName: fullNameOf(test),
      timeoutSeconds:
        typeof test.options.timeout === 'number' ? seconds(test.options.timeout) : null,
      tags: [...test.tags],
    })),
  }
}

export default class TimingReporter implements Reporter {
  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const path = process.env[TIMING_FILE_ENV]
    if (path === undefined || path === '') return
    const report: TimingReport = { files: modules.map(timingOf) }
    writeFileSync(path, `${JSON.stringify(report)}\n`)
  }
}
