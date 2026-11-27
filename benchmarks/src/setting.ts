import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hostSources, type Setting, type Suite } from '@omne-harness/perf-harness'

export const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '')

/** The Node version the repository pins for development: times taken on another one enter no baseline. */
export function pinnedNode(root: string): string {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    devEngines?: { runtime?: { version?: string } }
  }
  const version = manifest.devEngines?.runtime?.version
  if (version === undefined) throw new Error('the root package.json pins no Node version')
  return version
}

export const settingOf = (root: string, suites: readonly Suite[]): Setting => ({
  root,
  suites,
  baselines: join(root, 'benchmarks', 'baselines'),
  results: join(root, 'tmp', 'perf', 'results'),
  scratch: join(root, 'tmp', 'perf', 'data'),
  pinnedNode: pinnedNode(root),
  sources: hostSources,
  now: () => new Date(),
})
