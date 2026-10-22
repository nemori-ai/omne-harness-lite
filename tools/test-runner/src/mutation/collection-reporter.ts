import type { Reporter } from 'vitest/reporters'

type Modules = Parameters<NonNullable<Reporter['onTestRunEnd']>>[0]

/** Container errors are distinct from ordinary assertion failures in registered tests. */
export default class CollectionReporter implements Reporter {
  onTestRunEnd(modules: Modules): void {
    const errors = modules.flatMap(module =>
      [module, ...module.children.allSuites()].flatMap(container =>
        container.errors().map(error => ({
          file: module.moduleId,
          suite: container.type === 'suite' ? container.fullName : undefined,
          name: error.name,
          message: error.message,
          stack: error.stack,
        })),
      ),
    )
    if (errors.length > 0) throw new Error(`文件或 suite 收集错误：${JSON.stringify(errors)}`)
  }
}
