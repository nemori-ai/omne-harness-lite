// 仓库唯一的依赖图：dependency-cruiser 跑一遍，按根 `.dependency-cruiser.cjs` 的规则判违规，
// 再把文件级的依赖收成成员间的边，并在成员与组上找环。`lint:deps`、clean loop、`pnpm run metrics`
// 与架构报告都从这里取，不另写导入解析。
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ignoredDirectories, isUnderIgnored, nulSeparated } from '../core/git.ts'
import { isTestPath } from '../core/rule.ts'
import { runnerRoot } from '../core/subject.ts'

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

/**
 * 文件级的依赖事实：一个模块里指向别的成员、且已解析的一处导入。不限产品源码，测试与 `src` 下的 testing
 * 入口都在；Node 内建模块与解析失败的导入不在。方向规则（arch/directions.ts）只从这里判命中。
 */
export interface FileDependency extends ImportSite {
  /** 解析后的目标文件，仓库相对路径；可以在目标成员的 `src/`、`dist/` 或声明文件里。 */
  readonly resolved: string
}

/** 本模块自己产生的发现种类；方向规则的种类由产生它们的 arch/directions.ts 声明。 */
export type DependencyFindingKind =
  | 'dependency-rule'
  | 'file-cycle'
  | 'member-cycle'
  | 'group-cycle'

/** 发现涉及的成员边。 */
export interface FindingEdge {
  readonly from: string
  readonly to: string
}

interface FindingBase<Kind extends string> {
  readonly kind: Kind
  /** dependency-cruiser 的规则名；成员环与组环是本模块算的，取 kind。 */
  readonly rule: string
  readonly message: string
  /** 可定位的导入处；环取环上各边的首个导入处。 */
  readonly sites: readonly ImportSite[]
  /** 涉及的成员边；违规不跨成员时为空。 */
  readonly edges: readonly FindingEdge[]
}

/** 组环：`edges` 是环所在各组之间的全部跨组成员边，`groups` 是环上的组键，按字典序。 */
export interface GroupCycleFinding extends FindingBase<'group-cycle'> {
  readonly groups: readonly string[]
}

/** 本模块与方向规则的发现；`group-cycle` 是带组键的变体，别的种类只有基础字段。 */
export type DependencyFinding<Kind extends string = DependencyFindingKind> =
  Kind extends 'group-cycle' ? GroupCycleFinding : FindingBase<Kind>

export interface DependencyGraph {
  readonly members: readonly Member[]
  /**
   * 成员目录里 dependency-cruiser 走到或解析到的文件（仓库相对路径，含测试）；方向规则据此判源角色与目标角色有没有文件。
   * 解析失败的导入与内建模块的节点不是文件，不在这里。
   */
  readonly modules: readonly string[]
  readonly edges: readonly MemberEdge[]
  /** 跨成员的文件级依赖事实；`edges` 是其中产品源码部分按成员对的归并。 */
  readonly dependencies: readonly FileDependency[]
  readonly findings: readonly DependencyFinding[]
}

/**
 * dependency-cruiser 或 Git 的已知失败：图取不到。架构符合性报告据此把方向行记成「依赖事实不可得」；
 * 别的异常不属于这一类，照常抛出。
 */
export class DependencyGraphUnavailable extends Error {
  override readonly name = 'DependencyGraphUnavailable'
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
  /**
   * 与依赖上的同名字段同义：解析失败。解析失败的导入也留成节点，`source` 是说明符原文，不是文件。dependency-cruiser
   * 只给依赖到的节点写这个字段，走到的文件没有它，所以可以缺省（与它自己的类型声明一致）。
   */
  readonly couldNotResolve?: boolean
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

/** 规则只从运行检查器的仓库读（见 core/subject.ts），被检查的检出改不了规则。 */
export function cruiseConfig(): string {
  return join(runnerRoot(), '.dependency-cruiser.cjs')
}
/** 解析选项（条件名等）同样取运行检查器的仓库的，被检查的检出改不了解析方式。 */
function cruiseTsconfig(): string {
  return join(runnerRoot(), 'tsconfig.base.json')
}
const ROOTS = ['packages', 'apps', 'examples', 'tools', 'scripts']
const SCOPE = '@omne-harness/'

/**
 * 本包自己依赖的 dependency-cruiser。它的 exports 只有 import 条件、不含 package.json，所以按 Node 的查找顺序
 * 从本模块往上找 node_modules/dependency-cruiser：工作区里是本包的 node_modules，安装后是 pnpm 放在本包旁边的那一份。
 */
function cruiserBin(): string {
  for (let dir = dirname(fileURLToPath(import.meta.url)); ; dir = dirname(dir)) {
    const bin = join(dir, 'node_modules', 'dependency-cruiser', 'bin', 'dependency-cruiser.mjs')
    if (existsSync(bin)) return bin
    if (dirname(dir) === dir)
      throw new DependencyGraphUnavailable('找不到本包依赖的 dependency-cruiser')
  }
}

/**
 * dependency-cruiser 自己找 TypeScript 来解析 .ts；找不到时它不报错，只是把 .ts 全部漏掉，依赖图变空却照样通过。
 * 所以先按它的位置往上找 typescript，找不到就停下。pnpm 下由使用方的 packageExtensions 给它加上 typescript。
 */
export function requireCruiserTypeScript(bin: string): void {
  for (let dir = dirname(realpathSync(bin)); ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'node_modules', 'typescript', 'package.json'))) return
    if (dirname(dir) === dir)
      throw new DependencyGraphUnavailable(
        'dependency-cruiser 找不到 TypeScript，无法解析 .ts。用 pnpm 时在 pnpm-workspace.yaml 的 packageExtensions 里给 dependency-cruiser 加上 typescript 依赖。',
      )
  }
}

/** 对一棵检出跑 dependency-cruiser，取 JSON；违规不算失败，读不出 JSON 才算。 */
export function cruise(root: string): CruiseOutput {
  const roots = ROOTS.filter(dir => existsSync(join(root, dir)))
  if (roots.length === 0) return { modules: [], summary: { violations: [] } }
  const bin = cruiserBin()
  requireCruiserTypeScript(bin)
  const args = [
    bin,
    '--config',
    cruiseConfig(),
    '--ts-config',
    cruiseTsconfig(),
    '--output-type',
    'json',
  ]
  const run = spawnSync(process.execPath, [...args, ...roots], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  })
  if (run.error !== undefined)
    throw new DependencyGraphUnavailable(`起不来 dependency-cruiser：${run.error.message}`, {
      cause: run.error,
    })
  try {
    return JSON.parse(run.stdout) as CruiseOutput
  } catch {
    throw new DependencyGraphUnavailable(
      `dependency-cruiser 没有给出依赖图（退出码 ${run.status}）：${run.stderr.trim()}`,
    )
  }
}

function ruleComments(): ReadonlyMap<string, string> {
  const require = createRequire(import.meta.url)
  const config = require(cruiseConfig()) as {
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

  // 成员里的文件留下，方向规则据此判源角色与目标角色有没有文件。dependency-cruiser 把解析失败的导入也留成节点，
  // `source` 是说明符原文：写成成员路径的裸说明符（`packages/x/y/src/z.ts`）会让不存在的目标角色显得有文件。
  // 内建模块的节点（`fs`、`node:fs`）不像成员路径，下面的 `memberOf` 就把它们去掉了。
  const modules = output.modules
    .filter(module => !module.couldNotResolve)
    .map(module => module.source)
    .filter(path => memberOf(path) !== undefined)
    .sort()
  // 指向别的成员、已解析的依赖逐处记下（内建模块没有成员，自然不在）；产品源码（不含测试）的那些再按成员对归并成边，
  // 类型导入也算。
  const dependencies: FileDependency[] = []
  const edges = new Map<string, { from: string; to: string; sites: ImportSite[] }>()
  const specifierOf = new Map<string, string>()
  for (const module of output.modules) {
    const from = note(module.source)
    for (const dependency of module.dependencies) {
      if (dependency.couldNotResolve) continue
      specifierOf.set(pairKey(module.source, dependency.resolved), dependency.module)
      const to = note(dependency.resolved)
      if (from === undefined || to === undefined || from.path === to.path) continue
      const site = {
        path: module.source,
        line: lineOf(module.source, dependency.module),
        specifier: dependency.module,
      }
      dependencies.push({ ...site, resolved: dependency.resolved })
      if (!isProductSource(module.source, from)) continue
      const key = pairKey(from.path, to.path)
      let edge = edges.get(key)
      if (edge === undefined) {
        edge = { from: from.path, to: to.path, sites: [] }
        edges.set(key, edge)
      }
      edge.sites.push(site)
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
    const inside = edgeList.flatMap(edge => {
      const fromGroup = groupOf.get(edge.from)
      const toGroup = groupOf.get(edge.to)
      return fromGroup !== undefined &&
        toGroup !== undefined &&
        fromGroup !== toGroup &&
        component.includes(fromGroup) &&
        component.includes(toGroup)
        ? [{ from: edge.from, to: edge.to }]
        : []
    })
    findings.push({
      kind: 'group-cycle',
      rule: 'group-cycle',
      message: `组之间成环：${component.join('、')}`,
      sites: inside.flatMap(edge => firstSite(edge.from, edge.to)),
      edges: inside,
      groups: component,
    })
  }
  return { members: memberList, modules, edges: edgeList, dependencies, findings }
}

/** 缓存的图的格式版本；`DependencyGraph` 的形状或某一项的取法变了就加一（v5：组环发现带 `groups`）。 */
const GRAPH_FORMAT = 'v5'

/** 按提交缓存的基线图放在各工作树共用的 git 公共目录里：不进工作树，不会让工作树显得不干净。 */
function cacheDirectory(root: string): string {
  // 不用 `--path-format=absolute`：Git 2.31 之前不认它，会原样回显，缓存就落到以它命名的相对目录里。
  const dir = resolve(root, git(root, ['rev-parse', '--git-common-dir']).toString().trim())
  return join(dir, 'omne-dep-graph')
}

/**
 * 当前工作树的依赖图（含未提交的改动）。先按指纹（`workingGraphFingerprint`）查 git 公共目录里的缓存，命中就读整张图，
 * 不起 dependency-cruiser；未命中照常算，算完写缓存。不用 dependency-cruiser 自己的缓存：按 git 元数据判断变化会漏掉
 * 删掉的未跟踪文件，按内容判断实测也不比重跑快。`OMNE_DEP_GRAPH_CACHE=0` 关掉缓存；缓存读不到、写不进都按未命中，
 * 既不让检查失败，也不让检查放行。
 */
export function workingGraph(root: string): DependencyGraph {
  const ignoredDirs = ignoredDirectories(root)
  const key = workingCacheEnabled() ? workingCacheKey(root, ignoredDirs) : undefined
  if (key !== undefined) {
    const hit = readWorkingCache(key.path, key)
    if (hit !== undefined) {
      note(`依赖图缓存：命中 working-${key.digest.slice(0, 12)}`)
      return hit
    }
    note(`依赖图缓存：未命中 working-${key.digest.slice(0, 12)}，重算`)
  }
  const graph = graphOf(root, withoutIgnoredModules(cruise(root), ignoredDirs))
  if (key !== undefined) writeWorkingCache(key.path, key, graph)
  return graph
}

/** 开着缓存时这棵树的缓存键：指纹加缓存文件的路径。算不出指纹（不在 git 仓库里等）就没有键，说明原因后不缓存。 */
function workingCacheKey(
  root: string,
  ignoredDirs: ReadonlySet<string>,
): (WorkingFingerprint & { readonly path: string }) | undefined {
  const key = fingerprintOf(root, ignoredDirs)
  if ('reason' in key) {
    note(`依赖图缓存：不可用（${key.reason}），重算`)
    return undefined
  }
  return { ...key, path: join(cacheDirectory(root), `working-${key.digest}.json`) }
}

// ---- 工作树的图按指纹缓存 ------------------------------------------------------------------

/** 关掉工作树依赖图缓存的开关：设成 `0`。基线图按提交的缓存不受它影响。 */
export const WORKING_CACHE_SWITCH = 'OMNE_DEP_GRAPH_CACHE'
/** 缓存目录里最多留几份工作树的图，按最近读写的时间留。 */
const WORKING_CACHE_KEEP = 10

function workingCacheEnabled(env: Readonly<Record<string, string | undefined>> = process.env) {
  return env[WORKING_CACHE_SWITCH] !== '0'
}

/** 命中与否只在 stderr 是终端时打一行：管道里的消费者（测试、turbo）看到的输出与没有缓存时相同。 */
function note(line: string): void {
  if (process.stderr.isTTY === true) process.stderr.write(`${line}\n`)
}

/** 工作树依赖图的指纹：`inputs` 是逐行的输入清单（排好序），`digest` 是它的 sha256。 */
export interface WorkingFingerprint {
  readonly digest: string
  readonly inputs: readonly string[]
}

/**
 * 当前工作树依赖图的指纹，覆盖所有能改变 `workingGraph(root)` 结果的输入：图的格式版本、dependency-cruiser 的版本、
 * 规则文件（原文与 require 后的结果）、解析配置（`tsconfig.base.json` 连同 `extends` 链）、HEAD 提交、扫描根与根
 * `tsconfig.base.json`、`package.json` 下未提交与未跟踪文件的路径与内容、扫描根下被忽略的路径（目录记存在与否，
 * 单个文件记内容）、`ignoredDirectories` 的结果、`pnpm-lock.yaml` 与 `node_modules/.modules.yaml` 的内容。
 * `root` 不在 git 工作树里或没有提交时没有指纹（返回 undefined），这样的树不缓存。
 */
export function workingGraphFingerprint(
  root: string,
  ignoredDirs: ReadonlySet<string> = ignoredDirectories(root),
): WorkingFingerprint | undefined {
  const key = fingerprintOf(root, ignoredDirs)
  return 'reason' in key ? undefined : key
}

function fingerprintOf(
  root: string,
  ignoredDirs: ReadonlySet<string>,
): WorkingFingerprint | { readonly reason: string } {
  try {
    const inputs = workingInputs(root, ignoredDirs)
    return { digest: sha256(inputs.join('\n')), inputs }
  } catch (error) {
    // 算不出指纹（不在 git 仓库里、没有提交、读不到某个输入）就不缓存，照常出图；出图自己的失败由 cruise 报。
    return { reason: error instanceof Error ? error.message : String(error) }
  }
}

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')

/** 文件的内容摘要；没有这个文件记 `absent`，这样文件出现与消失也改变指纹。 */
function fileDigest(path: string): string {
  return existsSync(path) ? sha256(readFileSync(path)) : 'absent'
}

/** dependency-cruiser 的版本：解析器、默认扩展名和输出都随它变。 */
function cruiserVersion(): string {
  const manifest = join(dirname(cruiserBin()), '..', 'package.json')
  return (
    (JSON.parse(readFileSync(manifest, 'utf8')) as { version?: unknown }).version?.toString() ?? '?'
  )
}

/** 规则文件 require 后的结果：根 `.dependency-cruiser.cjs` 只是转到共享预设，预设的内容也要进指纹。 */
function loadedConfigDigest(): string {
  const require = createRequire(import.meta.url)
  return sha256(JSON.stringify(require(cruiseConfig())))
}

/**
 * tsconfig 的 `extends` 链上每个文件的内容摘要（从给定文件起）。相对路径按文件所在目录解析；包名按 Node 的
 * 解析规则（含 exports）从文件所在位置解析，解析不到的记下说明符。文件带注释时只取 `extends` 一项的字面。
 */
function tsconfigDigests(file: string, seen: Set<string> = new Set()): string[] {
  if (seen.has(file)) return []
  seen.add(file)
  if (!existsSync(file)) return ['absent']
  const text = readFileSync(file, 'utf8')
  const digests = [sha256(text)]
  for (const value of extendsOf(text)) {
    const target = resolveExtends(file, value)
    digests.push(
      ...(target === undefined ? [`unresolved ${value}`] : tsconfigDigests(target, seen)),
    )
  }
  return digests
}

function extendsOf(text: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    const literal = /"extends"\s*:\s*"([^"]+)"/u.exec(text)?.[1]
    return literal === undefined ? [] : [literal]
  }
  const value = (parsed as { extends?: unknown } | null)?.extends
  if (typeof value === 'string') return [value]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function resolveExtends(from: string, value: string): string | undefined {
  const candidates =
    value.startsWith('.') || value.startsWith('/') || /^[a-zA-Z]:/u.test(value)
      ? [resolve(dirname(from), value), resolve(dirname(from), `${value}.json`)]
      : []
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  if (candidates.length > 0) return undefined
  const require = createRequire(from)
  for (const specifier of [value, `${value}.json`, `${value}/tsconfig.json`]) {
    try {
      return require.resolve(specifier)
    } catch {
      // 换下一种写法。
    }
  }
  return undefined
}

const SCAN_FILES = ['tsconfig.base.json', 'package.json']
/** 路径落在 dependency-cruiser 会扫描的范围里：扫描根之下，或根 `tsconfig.base.json`、`package.json`。 */
function inScanScope(path: string): boolean {
  return ROOTS.some(dir => path.startsWith(`${dir}/`)) || SCAN_FILES.includes(path)
}

/** 第 `count` 个空格之后的部分：porcelain v2 的记录里路径在固定个数的字段之后，路径本身可以含空格。 */
function afterFields(record: string, count: number): string | undefined {
  let index = -1
  for (let seen = 0; seen < count; seen += 1) {
    index = record.indexOf(' ', index + 1)
    if (index === -1) return undefined
  }
  return record.slice(index + 1)
}

/**
 * 相对 HEAD 有改动的路径：已跟踪文件的修改、删除、暂存，未跟踪文件（逐个列，不折叠成目录）。
 * 不认改名（`--no-renames`）：改名拆成一删一增，记录里就没有带两个路径的 `2` 行。
 */
function changedPaths(root: string): string[] {
  const records = nulSeparated(
    git(root, [
      'status',
      '--porcelain=v2',
      '-z',
      '--untracked-files=all',
      '--no-renames',
    ]).toString(),
  )
  const paths: string[] = []
  for (const record of records) {
    const path = record.startsWith('1 ')
      ? afterFields(record, 8)
      : record.startsWith('u ')
        ? afterFields(record, 10)
        : record.startsWith('? ') || record.startsWith('! ')
          ? record.slice(2)
          : undefined
    if (path !== undefined && path !== '') paths.push(path)
  }
  return paths
}

/**
 * 工作树里各路径的内容标识：普通文件取 git 的对象摘要（`hash-object --no-filters`，按磁盘上的字节），
 * 符号链接记目标，不存在记 `missing`，其余记类型。一次 `hash-object` 批量算，路径多也只起一个进程；
 * `--stdin-paths` 按换行分路径（这版 git 的 hash-object 不认 `-z`），名字里带换行的文件在本进程里算 sha256。
 */
function contentIds(root: string, paths: readonly string[]): Map<string, string> {
  const ids = new Map<string, string>()
  const regular: string[] = []
  for (const path of paths) {
    let stat
    try {
      stat = lstatSync(join(root, path))
    } catch {
      ids.set(path, 'missing')
      continue
    }
    if (stat.isSymbolicLink()) ids.set(path, `link ${readlinkSync(join(root, path))}`)
    else if (!stat.isFile()) ids.set(path, stat.isDirectory() ? 'directory' : 'special')
    else if (/[\r\n]/u.test(path)) ids.set(path, `sha256 ${sha256(readFileSync(join(root, path)))}`)
    else regular.push(path)
  }
  if (regular.length > 0) {
    const hashes = git(
      root,
      ['hash-object', '--stdin-paths', '--no-filters'],
      Buffer.from(`${regular.join('\n')}\n`),
    )
      .toString()
      .split('\n')
      .filter(line => line !== '')
    if (hashes.length !== regular.length)
      throw new DependencyGraphUnavailable(
        `git hash-object 给了 ${hashes.length} 个摘要，要 ${regular.length} 个`,
      )
    regular.forEach((path, index) => ids.set(path, hashes[index] ?? ''))
  }
  return ids
}

/** 指纹的输入清单：每一类输入一组行，组内按路径排序；取掉任何一组都会让对应的失效用例变红。 */
function workingInputs(root: string, ignoredDirs: ReadonlySet<string>): string[] {
  const head = git(root, ['rev-parse', '--verify', 'HEAD^{commit}']).toString().trim()
  const lines = [
    `format ${GRAPH_FORMAT}`,
    `cruiser ${cruiserVersion()}`,
    `config ${sha256(readFileSync(cruiseConfig()))} ${loadedConfigDigest()}`,
    ...tsconfigDigests(cruiseTsconfig()).map(digest => `tsconfig ${digest}`),
    `head ${head}`,
    `roots ${ROOTS.filter(dir => existsSync(join(root, dir))).join(' ')}`,
    `lock ${fileDigest(join(root, 'pnpm-lock.yaml'))}`,
    `modules ${fileDigest(join(root, 'node_modules', '.modules.yaml'))}`,
    `ignored-dirs ${[...ignoredDirs].filter(inScanScope).sort().join(' ')}`,
  ]
  const changed = [...new Set(changedPaths(root).filter(inScanScope))].sort()
  const ignored = nulSeparated(
    git(root, [
      'ls-files',
      '--others',
      '--ignored',
      '--exclude-standard',
      '--directory',
      '-z',
    ]).toString(),
  )
    .filter(inScanScope)
    .sort()
  const ignoredFiles = ignored.filter(path => !path.endsWith('/'))
  const ids = contentIds(root, [...new Set([...changed, ...ignoredFiles])])
  for (const path of changed) lines.push(`changed ${path} ${ids.get(path) ?? ''}`)
  for (const path of ignored)
    lines.push(
      path.endsWith('/')
        ? `ignored-dir ${path.slice(0, -1)}`
        : `ignored-file ${path} ${ids.get(path) ?? ''}`,
    )
  return lines
}

interface WorkingCacheEntry {
  readonly format: string
  readonly fingerprint: string
  readonly inputs: readonly string[]
  readonly graph: DependencyGraph
}

function isGraph(value: unknown): value is DependencyGraph {
  if (typeof value !== 'object' || value === null) return false
  const graph = value as Record<string, unknown>
  return ['members', 'modules', 'edges', 'dependencies', 'findings'].every(key =>
    Array.isArray(graph[key]),
  )
}

/** 读缓存：文件不在、读不出、JSON 坏、格式或指纹对不上都算未命中。命中时摸一下时间，留份时按最近用过算。 */
function readWorkingCache(path: string, key: WorkingFingerprint): DependencyGraph | undefined {
  let entry: Partial<WorkingCacheEntry> | undefined
  try {
    entry = JSON.parse(readFileSync(path, 'utf8')) as Partial<WorkingCacheEntry>
  } catch {
    return undefined
  }
  if (
    typeof entry !== 'object' ||
    entry === null ||
    entry.format !== GRAPH_FORMAT ||
    entry.fingerprint !== key.digest ||
    !isGraph(entry.graph)
  )
    return undefined
  try {
    const now = new Date()
    utimesSync(path, now, now)
  } catch {
    // 摸不动时间只影响留哪几份。
  }
  return entry.graph
}

/** 写缓存：先写临时名再改名，别的进程读到的要么是整份要么没有；写不进就算了。写完只留最近 `WORKING_CACHE_KEEP` 份。 */
function writeWorkingCache(path: string, key: WorkingFingerprint, graph: DependencyGraph): void {
  const entry: WorkingCacheEntry = {
    format: GRAPH_FORMAT,
    fingerprint: key.digest,
    inputs: key.inputs,
    graph,
  }
  try {
    mkdirSync(dirname(path), { recursive: true })
    const staged = `${path}.${process.pid}.tmp`
    writeFileSync(staged, JSON.stringify(entry))
    renameSync(staged, path)
  } catch {
    return
  }
  pruneWorkingCache(dirname(path))
}

function pruneWorkingCache(directory: string): void {
  try {
    const entries = readdirSync(directory)
      .filter(name => name.startsWith('working-') && name.endsWith('.json'))
      .map(name => ({ name, mtime: statSync(join(directory, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
    for (const entry of entries.slice(WORKING_CACHE_KEEP)) {
      try {
        unlinkSync(join(directory, entry.name))
      } catch {
        // 正被别的进程读着的那份下次再删。
      }
    }
  } catch {
    // 列不出目录就不清理。
  }
}

/**
 * 去掉在被 git 忽略的目录里的模块与它们的违规（变异运行器的 `.stryker-tmp-*` 沙箱）：它们不在任何提交里，
 * 留着会让每个沙箱模块的边都成了「比基线新增」的依赖。被跟踪的文件指向那里的依赖保留。
 */
function withoutIgnoredModules(
  output: CruiseOutput,
  ignoredDirs: ReadonlySet<string>,
): CruiseOutput {
  if (ignoredDirs.size === 0) return output
  return {
    modules: output.modules.filter(module => !isUnderIgnored(module.source, ignoredDirs)),
    summary: {
      violations: output.summary.violations.filter(
        violation => !isUnderIgnored(violation.from, ignoredDirs),
      ),
    },
  }
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
    throw new DependencyGraphUnavailable(
      `git ${args.join(' ')} 失败：${run.stderr.toString().trim()}`,
    )
  return run.stdout
}

/** 基线图的临时树：`tree-<提交>-<进程号>`，进程号是建它的进程。 */
const TREE_NAME = /^tree-[0-9a-f]+-(\d+)$/u

/**
 * 进程已不在、目录又过了这么久没动，才算别人留下的残留。进程号只在本机本系统里有意义：同一个 git 目录
 * 也可能被 WSL 里的运行用着，那边的进程这里看不见，宽限期挡住正在跑的那一次（一次导出加 dependency-cruiser 不到一分钟）。
 */
export const STALE_TREE_GRACE_MS = 10 * 60 * 1000

/** 进程还在不在：`kill(pid, 0)` 只探测不发信号；没有权限（EPERM）说明进程在。 */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * 删一棵临时树。Windows 上刚解开的文件可能还被杀毒或索引程序占着（EBUSY、EPERM、ENOTEMPTY），
 * 重试几次；仍删不掉就返回错误，由调用方报告，不让它盖过图本身的结果。
 */
function removeTree(tree: string): Error | undefined {
  try {
    rmSync(tree, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    return undefined
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error))
  }
}

/**
 * 清掉别的运行留下的临时树：被强行结束（任务超时、关掉终端、杀进程树）的运行来不及走到 `finally`，
 * 树就留在 git 目录里。只删进程已不在、且过了宽限期的；活着的进程的树不动。返回删掉的目录名。
 */
export function sweepStaleTrees(
  directory: string,
  alive: (pid: number) => boolean = processAlive,
  now: number = Date.now(),
): string[] {
  let names: string[]
  try {
    names = readdirSync(directory)
  } catch {
    return []
  }
  const removed: string[] = []
  for (const name of names) {
    const pid = TREE_NAME.exec(name)?.[1]
    if (pid === undefined || alive(Number(pid))) continue
    const tree = join(directory, name)
    try {
      if (now - statSync(tree).mtimeMs < STALE_TREE_GRACE_MS) continue
    } catch {
      continue
    }
    const failed = removeTree(tree)
    if (failed === undefined) removed.push(name)
    else process.stderr.write(`旧的基线图临时树 ${tree} 没删掉：${failed.message}\n`)
  }
  return removed
}

/**
 * 某个提交上的依赖图。把提交里的源码导出到 git 目录下的临时树、补上 workspace 链接后跑；
 * 提交不会变，结果按提交与规则文件的摘要缓存，同一基线只算一次。
 * 开始时顺带清掉别的运行留下的临时树（见 `sweepStaleTrees`）。
 */
export function revisionGraph(root: string, revision: string): DependencyGraph {
  const commit = git(root, ['rev-parse', '--verify', `${revision}^{commit}`])
    .toString()
    .trim()
  const rules = createHash('sha256').update(readFileSync(cruiseConfig())).digest('hex').slice(0, 12)
  const directory = cacheDirectory(root)
  sweepStaleTrees(directory)
  // 文件名带图的格式版本：旧格式的缓存没有 `dependencies` 或 `modules`，不能当现在的图读。
  const cached = join(directory, `${commit}-${rules}-${GRAPH_FORMAT}.json`)
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8')) as DependencyGraph

  const present = new Set(
    git(root, ['ls-tree', '--name-only', commit]).toString().split('\n').filter(Boolean),
  )
  const paths = [...ROOTS, 'tsconfig.base.json', 'package.json'].filter(path => present.has(path))
  const tree = join(directory, `tree-${commit}-${process.pid}`)
  const leftover = removeTree(tree)
  if (leftover !== undefined)
    throw new DependencyGraphUnavailable(`清不掉 ${tree}：${leftover.message}`)
  mkdirSync(tree, { recursive: true })
  try {
    if (paths.length > 0) {
      const archive = git(root, ['archive', '--format=tar', commit, '--', ...paths])
      // 以 cwd 定位目标目录：Windows 的 tar 把 `D:\…` 这样带冒号的 `-C` 参数当作远程主机。
      const untar = spawnSync('tar', ['-x'], {
        cwd: tree,
        input: archive,
        maxBuffer: 64 * 1024 * 1024,
      })
      if (untar.status !== 0)
        throw new DependencyGraphUnavailable(`解开 ${commit} 失败：${untar.stderr.toString()}`)
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
    // 删不掉不改变图的结果，也不盖过前面的错误：报告出来，下次运行时按残留清理。
    const failed = removeTree(tree)
    if (failed !== undefined)
      process.stderr.write(`基线图临时树 ${tree} 没删掉：${failed.message}；下次运行时再清\n`)
  }
}
