import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { isLegacyDirectory } from '@omne-harness/repo-toolchain/core/check-scope'

/** 一个扫描根里各包在 package.json 声明为 `./testing` 的入口文件，以及读不了的清单。 */
export interface TestingEntries {
  /** 入口文件，相对于扫描根的 POSIX 路径，与 `SourceFile.path` 同一写法。 */
  readonly entries: ReadonlySet<string>
  /** 无法解析的 package.json，相对于扫描根；其声明的入口不可知，不能当作没有入口。 */
  readonly unparsable: readonly string[]
}

export const NO_TESTING_ENTRIES: TestingEntries = { entries: new Set(), unparsable: [] }

/** `exports["./testing"]` 指向的源文件：字符串取其值；对象取 `source`，缺 `source` 时只在 `import` 指向 `.ts` 源时取它。 */
function declaredSource(manifest: unknown): string | undefined {
  if (manifest === null || typeof manifest !== 'object') return undefined
  const exportsField = (manifest as { exports?: unknown }).exports
  if (exportsField === null || typeof exportsField !== 'object') return undefined
  const target = (exportsField as Record<string, unknown>)['./testing']
  if (typeof target === 'string') return target
  if (target === null || typeof target !== 'object') return undefined
  const conditions = target as Record<string, unknown>
  if (typeof conditions['source'] === 'string') return conditions['source']
  const imported = conditions['import']
  return typeof imported === 'string' && imported.endsWith('.ts') && !imported.endsWith('.d.ts')
    ? imported
    : undefined
}

/** 读 `root` 下每个 package.json 声明的 `./testing` 入口；遍历范围与 `collectSources` 一致（跳过 node_modules、dist 与归档目录）。 */
export function collectTestingEntries(root: string): TestingEntries {
  const base = resolve(root)
  const entries = new Set<string>()
  const unparsable: string[] = []
  const posix = (path: string): string => path.replaceAll('\\', '/')
  const walk = (dir: string): void => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (item.name === 'node_modules' || item.name === 'dist') continue
      const full = join(dir, item.name)
      if (item.isDirectory()) {
        if (!isLegacyDirectory(relative(base, full))) walk(full)
        continue
      }
      if (item.name !== 'package.json') continue
      let manifest: unknown
      try {
        manifest = JSON.parse(readFileSync(full, 'utf8'))
      } catch {
        unparsable.push(posix(relative(base, full)))
        continue
      }
      const source = declaredSource(manifest)
      if (source !== undefined) entries.add(posix(relative(base, resolve(dirname(full), source))))
    }
  }
  if (!isLegacyDirectory(base)) walk(base)
  return { entries, unparsable }
}
