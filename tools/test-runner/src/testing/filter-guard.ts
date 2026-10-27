// 过滤守卫：仓库根 `vitest.tiers.mts` 在 vitest 命令行带了过滤（`-t` 用例名或文件）时挂给成员的 vitest。
// 过滤后一条用例都没有跑（全被跳过，或一个文件都没剩）时让这次运行失败，并写明过滤条件（#737）：
// 不让「没选中」读成「通过」。过滤条件由选项传入（`vitest.tiers.mts` 从命令行读出），只读 vitest 的公开报告器接口。
import type { Reporter, TestModule, TestRunEndReason, Vitest } from 'vitest/node'

export interface FilterGuardOptions {
  readonly testNames?: readonly string[]
  readonly files?: readonly string[]
}

/** 真跑了的用例：结果是通过或失败；跳过的与没跑到的不算。 */
export function ranTests(modules: ReadonlyArray<TestModule>): number {
  let count = 0
  for (const module of modules)
    for (const test of module.children.allTests()) {
      const { state } = test.result()
      if (state === 'passed' || state === 'failed') count += 1
    }
  return count
}

/** 一条用例都没跑时的说明；`filters` 为空时不该调用。 */
export function noSelectionMessage(options: FilterGuardOptions): string {
  const parts = [
    ...(options.testNames ?? []).map(name => `用例名 -t ${JSON.stringify(name)}`),
    ...(options.files ?? []).map(file => `文件 ${JSON.stringify(file)}`),
  ]
  return (
    `vitest.tiers：带过滤运行（${parts.join('、')}），过滤后没有选中任何用例，按失败退出。` +
    '核对过滤条件与 --mode 的层（快层滤掉慢用例，慢层只留慢用例）。\n'
  )
}

export default class FilterGuard implements Reporter {
  readonly #options: FilterGuardOptions
  #watch = false

  constructor(options: FilterGuardOptions = {}) {
    this.#options = options
  }

  onInit(vitest: Vitest): void {
    this.#watch = vitest.config.watch
  }

  onTestRunEnd(
    modules: ReadonlyArray<TestModule>,
    _errors: unknown,
    reason: TestRunEndReason,
  ): void {
    const filtered =
      (this.#options.testNames?.length ?? 0) > 0 || (this.#options.files?.length ?? 0) > 0
    if (!filtered || this.#watch || reason === 'interrupted' || ranTests(modules) > 0) return
    process.exitCode = 1
    process.stderr.write(noSelectionMessage(this.#options))
  }
}
