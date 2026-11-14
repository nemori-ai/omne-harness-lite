import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { isLegacyDirectory } from '@omne-harness/repo-toolchain/core/check-scope'

export interface TestingEntries {
  readonly entries: ReadonlySet<string>
  readonly acceptanceDirectories: ReadonlySet<string>
  readonly unparsable: readonly string[]
}

export const NO_TESTING_ENTRIES: TestingEntries = {
  entries: new Set(),
  acceptanceDirectories: new Set(),
  unparsable: [],
}

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

export function collectTestingEntries(root: string): TestingEntries {
  const base = resolve(root)
  const entries = new Set<string>()
  const acceptanceDirectories = new Set<string>()
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
      if (
        manifest !== null &&
        typeof manifest === 'object' &&
        !Array.isArray(manifest) &&
        'name' in manifest &&
        typeof manifest.name === 'string' &&
        manifest.name.trim().length > 0
      )
        acceptanceDirectories.add(posix(relative(base, join(dirname(full), 'acceptance'))) + '/')
      const source = declaredSource(manifest)
      if (source !== undefined) entries.add(posix(relative(base, resolve(dirname(full), source))))
    }
  }
  if (!isLegacyDirectory(base)) walk(base)
  return { entries, acceptanceDirectories, unparsable }
}
