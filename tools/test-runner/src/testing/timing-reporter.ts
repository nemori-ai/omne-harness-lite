import { writeFileSync } from 'node:fs'
import type { Reporter, TestCase, TestModule } from 'vitest/node'

export interface TimingReport {
  readonly files: readonly {
    readonly file: string
    readonly collectSeconds: number
    readonly tests: readonly {
      readonly fullName: string
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
  readonly #outputFile: string | undefined

  constructor(options: { readonly outputFile?: string } = {}) {
    this.#outputFile = options.outputFile
  }

  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const path = this.#outputFile
    if (path === undefined || path === '') return
    const report: TimingReport = { files: modules.map(timingOf) }
    writeFileSync(path, `${JSON.stringify(report)}\n`)
  }
}
