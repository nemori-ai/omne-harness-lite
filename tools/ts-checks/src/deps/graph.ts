// 仓库唯一的依赖图：dependency-cruiser 跑一遍，按根 `.dependency-cruiser.cjs` 的规则判违规，
// 再把文件级的依赖收成成员间的边，并在成员与组上找环。`lint:deps`、clean loop、`make metrics`
// 与架构报告都从这里取，不另写导入解析。
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isTestPath } from '../rule.ts'

/** workspace 成员：`packages/<组>/<包>`、`apps/<应用>`、`examples/<示例>`。 */
export interface Member {
  /** 仓库相对路径，也是图节点的键。 */
  readonly path: string
  /** `packages/<组>`、`apps` 或 `examples`。键用路径，`packages/tools` 不与根 `tools/` 混淆。 */
  readonly group: string
  /** 目录名；本仓库里等于包名去掉 scope。 */
  readonly name: string
}

export interface ImportSite {
  readonly path: string
  readonly line: number
  readonly specifier: string
}

export interface MemberEdge {
  readonly from: string
  readonly to: string
  readonly sites: readonly ImportSite[]
}

export type DependencyFindingKind =
  | 'dependency-rule'
  | 'file-cycle'
  | 'member-cycle'
  | 'group-cycle'

export interface DependencyFinding {
  readonly kind: DependencyFindingKind
  /** dependency-cruiser 的规则名；成员环与组环是本模块算的，取 kind。 */
  readonly rule: string
  readonly message: string
  /** 可定位的导入处；环取环上各边的首个导入处。 */
  readonly sites: readonly ImportSite[]
  /** 涉及的成员边；违规不跨成员时为空。 */
  readonly edges: readonly { readonly from: string; readonly to: string }[]
}

export interface DependencyGraph {
  readonly members: readonly Member[]
  readonly edges: readonly MemberEdge[]
  readonly findings: readonly DependencyFinding[]
}

/** 路径相对于仓库根。 */
export function memberOf(path: string): Member | undefined {
  const match =
    /^(packages\/[^/]+)\/([^/]+)\//u.exec(path) ?? /^(apps|examples)\/([^/]+)\//u.exec(path)
  const group = match?.[1]
  const name = match?.[2]
  if (group === undefined || name === undefined) return undefined
  return { path: `${group}/${name}`, group, name }
}

/** 强连通分量里节点数大于一的那些，即环；节点按字典序。 */
export function cycles(
  nodes: readonly string[],
  edges: readonly { readonly from: string; readonly to: string }[],
): string[][] {
  const next = new Map<string, string[]>()
  for (const node of nodes) next.set(node, [])
  for (const edge of edges) next.get(edge.from)?.push(edge.to)

  let counter = 0
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const found: string[][] = []

  const connect = (node: string): void => {
    index.set(node, counter)
    low.set(node, counter)
    counter += 1
    stack.push(node)
    onStack.add(node)
    for (const target of next.get(node) ?? []) {
      if (!index.has(target)) {
        connect(target)
        low.set(node, Math.min(low.get(node) ?? 0, low.get(target) ?? 0))
      } else if (onStack.has(target)) {
        low.set(node, Math.min(low.get(node) ?? 0, index.get(target) ?? 0))
      }
    }
    if (low.get(node) !== index.get(node)) return
    const component: string[] = []
    for (;;) {
      const top = stack.pop()
      if (top === undefined) break
      onStack.delete(top)
      component.push(top)
      if (top === node) break
    }
    if (component.length > 1) found.push(component.sort())
  }
  for (const node of [...nodes].sort()) if (!index.has(node)) connect(node)
  return found.sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''))
}

// ---- dependency-cruiser 的输出 -------------------------------------------------------------

export interface CruiseDependency {
  readonly module: string
  readonly resolved: string
  readonly couldNotResolve: boolean
  readonly dependencyTypes: readonly string[]
}
export interface CruiseModule {
  readonly source: string
  readonly dependencies: readonly CruiseDependency[]
}
export interface CruiseViolation {
  readonly from: string
  readonly to: string
  readonly rule: { readonly name: string; readonly severity: string }
  readonly cycle?: readonly (string | { readonly name: string })[]
}
export interface CruiseOutput {
  readonly modules: readonly CruiseModule[]
  readonly summary: { readonly violations: readonly CruiseViolation[] }
}

/** 运行检查器的那个仓库：规则只从它读，被检查的检出改不了规则。 */
const RUNNER = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))
export const CRUISE_CONFIG = join(RUNNER, '.dependency-cruiser.cjs')
/** 解析选项（条件名等）同样取运行检查器的仓库的，被检查的检出改不了解析方式。 */
const CRUISE_TSCONFIG = join(RUNNER, 'tsconfig.base.json')
const ROOTS = ['packages', 'apps', 'examples', 'tools', 'scripts']
const SCOPE = '@omne-harness/'

/** 本包自己装的 dependency-cruiser；它的 exports 不含 package.json，从包目录直接定位。src/deps 与 dist/deps 同深。 */
function cruiserBin(): string {
  return fileURLToPath(
    new URL('../../node_modules/dependency-cruiser/bin/dependency-cruiser.mjs', import.meta.url),
  )
}

/** 对一棵检出跑 dependency-cruiser，取 JSON；违规不算失败，读不出 JSON 才算。 */
export function cruise(root: string): CruiseOutput {
  const roots = ROOTS.filter(dir => existsSync(join(root, dir)))
  if (roots.length === 0) return { modules: [], summary: { violations: [] } }
  const args = [
    cruiserBin(),
    '--config',
    CRUISE_CONFIG,
    '--ts-config',
    CRUISE_TSCONFIG,
    '--output-type',
    'json',
  ]
  const run = spawnSync(process.execPath, [...args, ...roots], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  })
  if (run.error !== undefined) throw run.error
  try {
    return JSON.parse(run.stdout) as CruiseOutput
  } catch {
    throw new Error(
      `dependency-cruiser 没有给出依赖图（退出码 ${run.status}）：${run.stderr.trim()}`,
    )
  }
}

function ruleComments(): ReadonlyMap<string, string> {
  const require = createRequire(import.meta.url)
  const config = require(CRUISE_CONFIG) as {
    forbidden?: readonly { readonly name: string; readonly comment?: string }[]
  }
  return new Map((config.forbidden ?? []).map(rule => [rule.name, rule.comment ?? '']))
}

/** 导入说明符在文件里第一次以字符串字面量出现的行；找不到记第 1 行。 */
function lineFinder(root: string): (path: string, specifier: string) => number {
  const texts = new Map<string, readonly string[]>()
  return (path, specifier) => {
    let lines = texts.get(path)
    if (lines === undefined) {
      try {
        lines = readFileSync(join(root, path), 'utf8').split('\n')
      } catch {
        lines = []
      }
      texts.set(path, lines)
    }
    const quoted = [`'${specifier}'`, `"${specifier}"`, `\`${specifier}\``]
    const index = lines.findIndex(line => quoted.some(item => line.includes(item)))
    return index === -1 ? 1 : index + 1
  }
}

function isProductSource(path: string, member: Member): boolean {
  return path.startsWith(`${member.path}/src/`) && !isTestPath(path)
}

const pairKey = (from: string, to: string) => `${from}\u0000${to}`

/** 把 dependency-cruiser 的输出收成成员图与违规；`root` 只用来给导入处找行号。 */
export function graphOf(root: string, output: CruiseOutput): DependencyGraph {
  const lineOf = lineFinder(root)
  const members = new Map<string, Member>()
  const note = (path: string) => {
    const member = memberOf(path)
    if (member !== undefined && !members.has(member.path)) members.set(member.path, member)
    return member
  }

  // 产品源码（不含测试）里指向别的成员的依赖，按成员对归并；类型导入也算。
  const edges = new Map<string, { from: string; to: string; sites: ImportSite[] }>()
  const specifierOf = new Map<string, string>()
  for (const module of output.modules) {
    const from = note(module.source)
    for (const dependency of module.dependencies) {
      if (dependency.couldNotResolve) continue
      specifierOf.set(pairKey(module.source, dependency.resolved), dependency.module)
      const to = note(dependency.resolved)
      if (from === undefined || to === undefined || from.path === to.path) continue
      if (!isProductSource(module.source, from)) continue
      const key = pairKey(from.path, to.path)
      let edge = edges.get(key)
      if (edge === undefined) {
        edge = { from: from.path, to: to.path, sites: [] }
        edges.set(key, edge)
      }
      edge.sites.push({
        path: module.source,
        line: lineOf(module.source, dependency.module),
        specifier: dependency.module,
      })
    }
  }
  const memberList = [...members.values()].sort((a, b) => a.path.localeCompare(b.path))
  const edgeList = [...edges.values()].sort((a, b) =>
    a.from === b.from ? a.to.localeCompare(b.to) : a.from.localeCompare(b.from),
  )

  const findings: DependencyFinding[] = []
  const comments = ruleComments()
  for (const violation of output.summary.violations) {
    const specifier = specifierOf.get(pairKey(violation.from, violation.to)) ?? violation.to
    const site = { path: violation.from, line: lineOf(violation.from, specifier), specifier }
    const fromMember = memberOf(violation.from)?.path
    const toMember = memberOf(violation.to)?.path
    const pair =
      fromMember !== undefined && toMember !== undefined && fromMember !== toMember
        ? [{ from: fromMember, to: toMember }]
        : []
    if (violation.rule.name === 'no-circular') {
      const path = (violation.cycle ?? []).map(step =>
        typeof step === 'string' ? step : step.name,
      )
      findings.push({
        kind: 'file-cycle',
        rule: violation.rule.name,
        message: `文件之间成环：${[violation.from, ...path].join(' → ')}`,
        sites: [site],
        edges: pair,
      })
      continue
    }
    const reason = comments.get(violation.rule.name)?.split(/(?<=\.)\s/u)[0] ?? ''
    findings.push({
      kind: 'dependency-rule',
      rule: violation.rule.name,
      message: `[${violation.rule.name}] ${violation.from} 依赖了 ${violation.to}${reason === '' ? '' : `：${reason}`}`,
      sites: [site],
      edges: pair,
    })
  }

  const firstSite = (from: string, to: string): ImportSite[] => {
    const site = edges.get(pairKey(from, to))?.sites[0]
    return site === undefined ? [] : [site]
  }
  for (const component of cycles(
    memberList.map(member => member.path),
    edgeList,
  )) {
    const inside = edgeList.filter(
      edge => component.includes(edge.from) && component.includes(edge.to),
    )
    findings.push({
      kind: 'member-cycle',
      rule: 'member-cycle',
      message: `成员之间成环：${component.join('、')}`,
      sites: inside.flatMap(edge => firstSite(edge.from, edge.to)),
      edges: inside.map(edge => ({ from: edge.from, to: edge.to })),
    })
  }
  const groupOf = new Map(memberList.map(member => [member.path, member.group]))
  const groupEdges = new Map<string, { from: string; to: string }>()
  for (const edge of edgeList) {
    const from = groupOf.get(edge.from)
    const to = groupOf.get(edge.to)
    if (from !== undefined && to !== undefined && from !== to)
      groupEdges.set(pairKey(from, to), { from, to })
  }
  for (const component of cycles([...new Set(groupOf.values())], [...groupEdges.values()])) {
    const inside = edgeList.filter(edge => {
      const from = groupOf.get(edge.from)
      const to = groupOf.get(edge.to)
      return (
        from !== undefined &&
        to !== undefined &&
        from !== to &&
        component.includes(from) &&
        component.includes(to)
      )
    })
    findings.push({
      kind: 'group-cycle',
      rule: 'group-cycle',
      message: `组之间成环：${component.join('、')}`,
      sites: inside.flatMap(edge => firstSite(edge.from, edge.to)),
      edges: inside.map(edge => ({ from: edge.from, to: edge.to })),
    })
  }
  return { members: memberList, edges: edgeList, findings }
}

/** 按提交缓存的基线图放在各工作树共用的 git 公共目录里：不进工作树，不会让工作树显得不干净。 */
function cacheDirectory(root: string): string {
  const dir = git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
    .toString()
    .trim()
  return join(dir, 'omne-dep-graph')
}

/**
 * 当前工作树的依赖图（含未提交的改动）。不用 dependency-cruiser 的缓存：按 git 元数据判断变化会漏掉
 * 删掉的未跟踪文件，按内容判断又不比重跑快。
 */
export function workingGraph(root: string): DependencyGraph {
  return graphOf(root, cruise(root))
}

/**
 * 一棵没装依赖的树（导出的基线、测试夹具）：按各成员 `package.json` 的包名，在 `into`
 * （通常是树根的 node_modules）下建 `@omne-harness/*` 链接，让跨成员的包导入像 pnpm workspace 那样解析。
 * 已有的同名项不动。
 */
export function linkWorkspace(root: string, into: string): void {
  const scope = join(into, SCOPE.slice(0, -1))
  const visit = (directory: string, depth: number): void => {
    let entries: string[]
    try {
      entries = readdirSync(join(root, directory))
    } catch {
      return
    }
    if (entries.includes('package.json') && directory !== '') {
      try {
        const name = (
          JSON.parse(readFileSync(join(root, directory, 'package.json'), 'utf8')) as {
            name?: unknown
          }
        ).name
        if (typeof name === 'string' && name.startsWith(SCOPE)) {
          const link = join(scope, name.slice(SCOPE.length))
          mkdirSync(scope, { recursive: true })
          let present = false
          try {
            lstatSync(link)
            present = true
          } catch {
            present = false
          }
          if (!present) symlinkSync(resolve(root, directory), link, 'dir')
        }
      } catch {
        // 读不了的清单不建链接；导入会以无法解析报出。
      }
    }
    if (depth === 0) return
    for (const entry of entries) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      const path = directory === '' ? entry : `${directory}/${entry}`
      try {
        if (lstatSync(join(root, path)).isDirectory()) visit(path, depth - 1)
      } catch {
        // 跳过读不了的项。
      }
    }
  }
  for (const top of ROOTS) visit(top, 2)
}

function git(root: string, args: readonly string[], input?: Buffer): Buffer {
  const run = spawnSync('git', ['-C', root, ...args], {
    ...(input === undefined ? {} : { input }),
    maxBuffer: 1024 * 1024 * 1024,
  })
  if (run.status !== 0)
    throw new Error(`git ${args.join(' ')} 失败：${run.stderr.toString().trim()}`)
  return run.stdout
}

/**
 * 某个提交上的依赖图。把提交里的源码导出到 git 目录下的临时树、补上 workspace 链接后跑；
 * 提交不会变，结果按提交与规则文件的摘要缓存，同一基线只算一次。
 */
export function revisionGraph(root: string, revision: string): DependencyGraph {
  const commit = git(root, ['rev-parse', '--verify', `${revision}^{commit}`])
    .toString()
    .trim()
  const rules = createHash('sha256').update(readFileSync(CRUISE_CONFIG)).digest('hex').slice(0, 12)
  const directory = cacheDirectory(root)
  const cached = join(directory, `${commit}-${rules}.json`)
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8')) as DependencyGraph

  const present = new Set(
    git(root, ['ls-tree', '--name-only', commit]).toString().split('\n').filter(Boolean),
  )
  const paths = [...ROOTS, 'tsconfig.base.json', 'package.json'].filter(path => present.has(path))
  const tree = join(directory, `tree-${commit}-${process.pid}`)
  rmSync(tree, { recursive: true, force: true })
  mkdirSync(tree, { recursive: true })
  try {
    if (paths.length > 0) {
      const archive = git(root, ['archive', '--format=tar', commit, '--', ...paths])
      const untar = spawnSync('tar', ['-x', '-C', tree], {
        input: archive,
        maxBuffer: 64 * 1024 * 1024,
      })
      if (untar.status !== 0) throw new Error(`解开 ${commit} 失败：${untar.stderr.toString()}`)
    }
    linkWorkspace(tree, join(tree, 'node_modules'))
    // 树里没装第三方依赖，外部包一律无法解析；基线图只用来比成员边，不保留这类违规。
    const full = graphOf(tree, cruise(tree))
    const graph = {
      ...full,
      findings: full.findings.filter(finding => finding.rule !== 'no-unresolvable'),
    }
    const staged = `${cached}.${process.pid}`
    writeFileSync(staged, JSON.stringify(graph))
    renameSync(staged, cached)
    return graph
  } finally {
    rmSync(tree, { recursive: true, force: true })
  }
}
