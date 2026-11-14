import type { Reporter, TestRunEndReason } from 'vitest/node'

export interface FilterGuardOptions {
  readonly testNames?: readonly string[]
  readonly files?: readonly string[]
}

interface VitestView {
  readonly config: { readonly watch: boolean }
}

interface ModuleView {
  ok(): boolean
  readonly children: { allTests(): Iterable<{ result(): { readonly state: string } }> }
}

function ranTests(modules: ReadonlyArray<ModuleView>): number {
  let count = 0
  for (const module of modules)
    for (const test of module.children.allTests()) {
      const { state } = test.result()
      if (state === 'passed' || state === 'failed') count += 1
    }
  return count
}

function noSelectionMessage(options: FilterGuardOptions): string {
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

  onInit(vitest: VitestView): void {
    this.#watch = vitest.config.watch
  }

  onTestRunEnd(
    modules: ReadonlyArray<ModuleView>,
    unhandledErrors: ReadonlyArray<unknown>,
    reason: TestRunEndReason,
  ): void {
    if (this.#watch || reason === 'interrupted' || unhandledErrors.length > 0) return
    if (modules.some(module => !module.ok()) || ranTests(modules) > 0) return
    process.exitCode = 1
    process.stderr.write(noSelectionMessage(this.#options))
  }
}
