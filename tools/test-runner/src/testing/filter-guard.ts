// 过滤守卫：仓库根 `vitest.tiers.mts` 在 vitest 命令行带了过滤（`-t` 用例名或文件）时挂给成员的 vitest。
// 过滤后一条用例都没有跑（全被跳过，或一个文件都没剩）时让这次运行失败，并写明过滤条件（#737）：
// 不让「没选中」读成「通过」。过滤条件由选项传入（`vitest.tiers.mts` 从命令行读出），只读 vitest 的公开报告器接口。
import type { Reporter, TestRunEndReason } from 'vitest/node'

export interface FilterGuardOptions {
  readonly testNames?: readonly string[]
  readonly files?: readonly string[]
}

/** 守卫读到的 vitest 实例：只看是不是 watch 模式。`Vitest` 满足它。 */
interface VitestView {
  readonly config: { readonly watch: boolean }
}

/** 守卫读到的测试模块：有没有失败、各用例的结果。`TestModule` 满足它。 */
interface ModuleView {
  ok(): boolean
  readonly children: { allTests(): Iterable<{ result(): { readonly state: string } }> }
}

/** 真跑了的用例：结果是通过或失败；跳过的与没跑到的不算。 */
function ranTests(modules: ReadonlyArray<ModuleView>): number {
  let count = 0
  for (const module of modules)
    for (const test of module.children.allTests()) {
      const { state } = test.result()
      if (state === 'passed' || state === 'failed') count += 1
    }
  return count
}

/** 一条用例都没跑时的说明。 */
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

/**
 * 只在命令行带了过滤时由 `vitest.tiers.mts` 挂上，所以这里不再判有没有过滤。
 * watch 模式、运行被打断、有未处理的错误或有文件失败（含加载失败）时不出声：
 * 后几种 vitest 已判失败并给出原因，不再叠一句「没选中」盖住真正的原因。
 */
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
