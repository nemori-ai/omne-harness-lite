import { isLegacyDirectory } from '../check-scope.ts'
import { git } from '../metrics/git.ts'
import { memberOf } from '../metrics/graph.ts'
import { isMeasuredSource } from '../metrics/report.ts'
import { isTestPath, type SourceFile } from '../rule.ts'

export interface ProductInputs {
  readonly sources: number
  readonly tests: number
}

export interface EngineeringEvidence {
  readonly current: ProductInputs
  readonly baselines: readonly { readonly commit: string; readonly inputs: ProductInputs }[]
}

export type SensorScope =
  | { readonly kind: 'all' }
  | { readonly kind: 'engineering'; readonly evidence: EngineeringEvidence }

export function parseScope(value: unknown): SensorScope['kind'] {
  if (value === undefined) return 'all'
  if (value === 'all' || value === 'engineering') return value
  throw new Error('--scope 只能是 all 或 engineering')
}

export function countProductInputs(paths: Iterable<string>): ProductInputs {
  let sources = 0
  let tests = 0
  for (const path of paths) {
    if (memberOf(path) === undefined) continue
    if (isMeasuredSource(path)) sources += 1
    if (isTestPath(path)) tests += 1
  }
  return { sources, tests }
}

function maintainedPath(path: string): boolean {
  return (
    /^(packages|apps|examples)(?:\/|$)/u.test(path) &&
    !isLegacyDirectory(path) &&
    !path.split('/').some(part => ['node_modules', 'dist', 'coverage'].includes(part))
  )
}

function historicalInputs(root: string, commit: string): ProductInputs {
  const paths: string[] = []
  for (const entry of git(root, ['ls-tree', '-r', '-z', commit]).split('\0')) {
    if (entry === '') continue
    const match = /^(\d+) (\w+) [0-9a-f]+\t([\s\S]+)$/u.exec(entry)
    const [, mode, type, path] = match ?? []
    if (path === undefined) throw new Error(`Cannot classify Git tree entry at ${commit}`)
    if (!maintainedPath(path)) continue
    // A link can hide a source subtree. Tree metadata cannot prove its inputs absent.
    if (type !== 'blob' || (mode !== '100644' && mode !== '100755'))
      throw new Error(`Cannot classify product inputs at ${commit}:${path} (${mode} ${type})`)
    if (/\.[cm]?tsx?$/u.test(path)) paths.push(path)
  }
  return countProductInputs(paths)
}

export function engineeringEvidence(
  root: string,
  files: readonly SourceFile[],
  refs: readonly string[],
): EngineeringEvidence {
  if (refs.length === 0) throw new Error('Engineering scope requires baseline evidence')
  const commits = new Set(
    refs.map(ref => git(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`])),
  )
  return {
    current: countProductInputs(files.map(file => file.path)),
    baselines: [...commits].map(commit => ({ commit, inputs: historicalInputs(root, commit) })),
  }
}

export function withoutProductInputs(scope: SensorScope): boolean {
  const empty = (inputs: ProductInputs) => inputs.sources === 0 && inputs.tests === 0
  return (
    scope.kind === 'engineering' &&
    empty(scope.evidence.current) &&
    scope.evidence.baselines.length > 0 &&
    scope.evidence.baselines.every(baseline => empty(baseline.inputs))
  )
}
