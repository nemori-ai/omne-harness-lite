import { writeFileSync } from 'node:fs'
import type { Reporter, TestModule } from 'vitest/node'
import { READ_SET_META, type RawFile, type RawReadSets, type RecorderMeta } from './read-sets.ts'

function recordedOf(module: TestModule): RecorderMeta | undefined {
  const meta = (module.meta() as Record<string, unknown>)[READ_SET_META] as
    | Partial<RecorderMeta>
    | undefined
  if (meta === undefined) return undefined
  const { content, listing, presence, incomplete } = meta
  return Array.isArray(content) &&
    Array.isArray(listing) &&
    Array.isArray(presence) &&
    Array.isArray(incomplete)
    ? { content, listing, presence, incomplete }
    : undefined
}

function rawOf(module: TestModule): RawFile {
  const imports = module.diagnostic().importDurations
  const paths = Object.keys(imports)
  const state = module.state()
  const recorded = recordedOf(module)
  const typecheck = (module.meta() as { typecheck?: unknown }).typecheck === true
  return {
    file: module.moduleId,
    verdict: state === 'skipped' ? 'skipped' : module.ok() ? 'passed' : 'failed',
    modules: paths.filter(path => imports[path]?.external !== true),
    externals: paths.filter(path => imports[path]?.external === true),
    ...(recorded === undefined ? {} : { recorded }),
    ...(typecheck ? { typecheck } : {}),
  }
}

function configOf(module: TestModule): string[] {
  const { configFile, configFileDependencies } = module.project.vite.config
  return [...(typeof configFile === 'string' ? [configFile] : []), ...configFileDependencies]
}

export default class ReadSetReporter implements Reporter {
  readonly #outputFile: string | undefined

  constructor(options: { readonly outputFile?: string } = {}) {
    this.#outputFile = options.outputFile
  }

  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const path = this.#outputFile
    if (path === undefined || path === '') return
    const report: RawReadSets = {
      config: [...new Set(modules.flatMap(configOf))],
      files: modules.map(rawOf),
    }
    writeFileSync(path, `${JSON.stringify(report)}\n`)
  }
}
