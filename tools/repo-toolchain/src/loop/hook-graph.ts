// 收工钩子的依赖图：基线合并点上的图（deps/graph.ts 按提交缓存）里，只把这次改过的文件的边换成现算的。
// 一条依赖边属于发出导入的文件，所以新增的边只可能出自改过的文件；新的环或方向违规一定含一条新边。
// 于是只对改过且还在的源文件跑一层 dependency-cruiser，耗时随改动大小走，不随仓库大小走。成员边、成员环与组环在
// 合并后的依赖上重算（graphOf），新边、稳定依赖不稳定、方向与环的读数照旧读这张图。
// 不覆盖：同一成员里的文件环（基线图只留跨成员的依赖）；没改的文件指向已删文件的旧边。两者归 pnpm run lint:deps。
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

/**
 * `graph`：量了依赖项时是这棵工作树的图；解析配置变了（`resolution`）时是基线图，只供不看依赖的读数用。
 * `commit`：基线提交；`prepared`：它的图这次没有缓存，现算并存下了。
 */
export interface HookGraph {
  readonly kind: 'graph' | 'resolution'
  readonly graph: DependencyGraph
  readonly commit: string
  readonly prepared: boolean
}

/** dependency-cruiser 认的源文件；`.d.ts` 也以 `.ts` 结尾。与 deps/graph.ts 的扫描根相同。 */
const SOURCE = /^(packages|apps|examples|tools|scripts)\/.+\.(ts|tsx|js|mjs|cjs)$/u
/** 成员清单里决定导入落到哪个成员、哪个文件的字段。 */
const RESOLUTION_FIELDS = ['name', 'exports', 'main', 'module', 'types', 'typings', 'imports']
/**
 * 一批的路径最多这么多个字符：路径在命令行上出现两次（文件本身与 `--do-not-follow` 的正则），
 * Windows 的命令行上限是 32767 个字符。
 */
const BATCH_CHARS = 12_000

/**
 * 改过的文件让没改的文件的导入换了落点：根上的解析配置内容变了，或某个成员清单里的解析字段变了。两边都在才比：
 * 新加、删掉的文件不算，导入新成员的文件本身就在改动里。`pnpm-lock.yaml` 只管第三方包，成员里的 tsconfig 不进
 * dependency-cruiser，都不算。
 */
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

/** 本包依赖的 dependency-cruiser，查找顺序同 deps/graph.ts：从本模块往上找 node_modules。 */
function cruiserBin(): string {
  for (let dir = dirname(fileURLToPath(import.meta.url)); ; dir = dirname(dir)) {
    const bin = join(dir, 'node_modules', 'dependency-cruiser', 'bin', 'dependency-cruiser.mjs')
    if (existsSync(bin)) return bin
    if (dirname(dir) === dir)
      throw new DependencyGraphUnavailable('找不到本包依赖的 dependency-cruiser')
  }
}

/** 按命令行长度分批。 */
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

/** 除了这几个文件，别的模块都不往下走。 */
const onlyFollow = (files: readonly string[]) =>
  `^(?!(?:${files.map(file => file.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|')})$)`

/**
 * 对给定文件跑一层 dependency-cruiser，规则与解析选项同 `lint:deps`：只往下走给定的文件，它们的导入目标在输出里
 * 也是模块，但依赖是空的，所以只留给定文件自己的模块。不用 `--max-depth 1`：给定文件先作为另一个给定文件的导入目标
 * 被走到时，它自己的导入就被深度截掉了。
 */
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

/**
 * 基线图里去掉改过的文件发出的依赖与违规，换上 `current`（改过且还在的文件一层的结果）；成员边、成员环与组环在合并后的
 * 依赖上由 graphOf 重算。`changed` 是基线到工作树改过的全部路径，含删掉的。
 */
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

/** 基线图在 git 公共目录里的缓存文件名（deps/graph.ts 的 `revisionGraph` 写的那些），只看这个提交的。 */
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

/**
 * 收工钩子要的依赖图。基线图最先取（只取决于基线提交，这次即使超过时限被终止，存下的下次只读）；
 * 解析配置变了就不量依赖项；否则只对改过且还在的源文件跑一层，与基线图合并。
 */
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
