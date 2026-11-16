import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fileAt, git, ignoredDirectories, isUnderIgnored } from '../core/git.ts'
import { runnerRoot } from '../core/subject.ts'
import {
  cruiseConfig,
  DependencyGraphUnavailable,
  graphOf,
  memberOf,
  requireCruiserTypeScript,
  revisionGraph,
  type CruiseDependency,
  type CruiseModule,
  type CruiseOutput,
  type DependencyGraph,
} from '../deps/graph.ts'
import { readIfFile } from './catalogue.ts'
import type { Change } from './run.ts'

export const RESOLUTION_NOTE = '本次改了解析配置，依赖项看 pnpm run lint:deps'

export interface HookGraph {
  readonly kind: 'graph' | 'resolution'
  readonly graph: DependencyGraph
  readonly commit: string
  readonly prepared: boolean
}

const SOURCE = /^(packages|apps|examples|tools|scripts)\/.+\.(ts|tsx|js|mjs|cjs)$/u
const RESOLUTION_FIELDS = ['name', 'exports', 'main', 'module', 'types', 'typings', 'imports']
const BATCH_CHARS = 12_000

export function resolutionChanged(root: string, base: string, paths: Iterable<string>): boolean {
  for (const path of paths) {
    const both = () => {
      const before = fileAt(root, base, path)
      const after = readIfFile(join(root, path))
      return before === undefined || after === undefined ? undefined : { before, after }
    }
    if (path === '.dependency-cruiser.cjs' || /^tsconfig[^/]*\.json$/u.test(path)) {
      const sides = both()
      if (sides !== undefined && sides.before !== sides.after) return true
    } else if (isManifest(path)) {
      const sides = both()
      if (sides !== undefined && fieldsDiffer(sides.before, sides.after)) return true
    }
  }
  return false
}

function isManifest(path: string): boolean {
  const member = memberOf(path)
  return member !== undefined && path === `${member.path}/package.json`
}

function fieldsDiffer(before: string, after: string): boolean {
  try {
    const [was, now] = [JSON.parse(before), JSON.parse(after)] as Record<string, unknown>[]
    return RESOLUTION_FIELDS.some(
      field => JSON.stringify(was?.[field]) !== JSON.stringify(now?.[field]),
    )
  } catch {
    return true
  }
}

function cruiserBin(): string {
  for (let dir = dirname(fileURLToPath(import.meta.url)); ; dir = dirname(dir)) {
    const bin = join(dir, 'node_modules', 'dependency-cruiser', 'bin', 'dependency-cruiser.mjs')
    if (existsSync(bin)) return bin
    if (dirname(dir) === dir)
      throw new DependencyGraphUnavailable('找不到本包依赖的 dependency-cruiser')
  }
}

function batches(files: readonly string[]): string[][] {
  const out: string[][] = []
  let chars = Number.POSITIVE_INFINITY
  for (const file of files) {
    if (chars + file.length + 1 > BATCH_CHARS) {
      out.push([])
      chars = 0
    }
    out.at(-1)?.push(file)
    chars += file.length + 1
  }
  return out
}

const onlyFollow = (files: readonly string[]) =>
  `^(?!(?:${files.map(file => file.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|')})$)`

// 只往下走给定文件，不用 --max-depth 1：给定文件先作为别的给定文件的导入目标被走到时，
// 它自己的导入会被深度截掉。
export function cruiseFiles(root: string, files: readonly string[]): CruiseOutput {
  const modules: CruiseModule[] = []
  const violations: CruiseOutput['summary']['violations'][number][] = []
  if (files.length === 0) return { modules, summary: { violations } }
  const bin = cruiserBin()
  requireCruiserTypeScript(bin)
  const tsconfig = join(runnerRoot(), 'tsconfig.base.json')
  const options = ['--config', cruiseConfig(), '--ts-config', tsconfig, '--output-type', 'json']
  for (const batch of batches(files)) {
    const given = new Set(batch)
    const run = spawnSync(
      process.execPath,
      [bin, ...options, '--do-not-follow', onlyFollow(batch), ...batch],
      {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 512 * 1024 * 1024,
      },
    )
    if (run.error !== undefined)
      throw new DependencyGraphUnavailable(`起不来 dependency-cruiser：${run.error.message}`, {
        cause: run.error,
      })
    let output: CruiseOutput
    try {
      output = JSON.parse(run.stdout) as CruiseOutput
    } catch {
      throw new DependencyGraphUnavailable(
        `dependency-cruiser 没有给出依赖图（退出码 ${run.status}）：${run.stderr.trim()}`,
      )
    }
    modules.push(...output.modules.filter(module => given.has(module.source)))
    violations.push(...output.summary.violations)
  }
  return { modules, summary: { violations } }
}

export function patchGraph(
  root: string,
  baseline: DependencyGraph,
  changed: ReadonlySet<string>,
  current: CruiseOutput,
): DependencyGraph {
  const ignored = ignoredDirectories(root)
  const fresh = graphOf(root, {
    modules: current.modules.filter(module => !isUnderIgnored(module.source, ignored)),
    summary: {
      violations: current.summary.violations.filter(
        violation => !isUnderIgnored(violation.from, ignored),
      ),
    },
  })
  const dependencies = [
    ...baseline.dependencies.filter(dependency => !changed.has(dependency.path)),
    ...fresh.dependencies,
  ]
  const outgoing = new Map<string, CruiseDependency[]>()
  for (const dependency of dependencies) {
    const list = outgoing.get(dependency.path) ?? []
    list.push({
      module: dependency.specifier,
      resolved: dependency.resolved,
      couldNotResolve: false,
      dependencyTypes: [],
    })
    outgoing.set(dependency.path, list)
  }
  const sources = new Set([
    ...baseline.modules.filter(path => !changed.has(path) || existsSync(join(root, path))),
    ...fresh.modules,
    ...outgoing.keys(),
  ])
  const merged = graphOf(root, {
    modules: [...sources].map(source => ({ source, dependencies: outgoing.get(source) ?? [] })),
    summary: { violations: [] },
  })
  const violation = (kind: string) => kind === 'dependency-rule' || kind === 'file-cycle'
  return {
    ...merged,
    findings: [
      ...baseline.findings.filter(
        finding => violation(finding.kind) && !changed.has(finding.sites[0]?.path ?? ''),
      ),
      ...fresh.findings.filter(finding => violation(finding.kind)),
      ...merged.findings,
    ],
  }
}

function cachedGraphs(root: string, commit: string): Set<string> {
  try {
    const directory = join(
      resolve(root, git(root, ['rev-parse', '--git-common-dir'])),
      'omne-dep-graph',
    )
    return new Set(readdirSync(directory).filter(name => name.startsWith(`${commit}-`)))
  } catch {
    return new Set()
  }
}

export function hookGraph(root: string, change: Change): HookGraph {
  const commit = git(root, ['rev-parse', '--verify', `${change.mergeBase}^{commit}`])
  const before = cachedGraphs(root, commit)
  const baseline = revisionGraph(root, commit)
  const prepared = [...cachedGraphs(root, commit)].some(name => !before.has(name))
  if (resolutionChanged(root, commit, change.paths))
    return { kind: 'resolution', graph: baseline, commit, prepared }
  const files = [...change.paths].filter(
    path =>
      SOURCE.test(path) && statSync(join(root, path), { throwIfNoEntry: false })?.isFile() === true,
  )
  return {
    kind: 'graph',
    graph: patchGraph(root, baseline, change.paths, cruiseFiles(root, files)),
    commit,
    prepared,
  }
}
