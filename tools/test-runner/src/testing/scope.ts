// 影响面：把「基线以来改了哪些文件」算成 `pnpm run check` 的执行计划——每一步跑还是跳、跑哪些成员、为什么。
// 除调用方给的 turbo 依赖图（`dependents`）外不读外部状态；路径规则只在 `test-runs.config.json` 的 `affected` 里定一次。
//
// 每个改动文件按顺序归到第一类命中的：全局 → 读者 → 成员文件 → Python 工具 → 只需常驻检查 → 其余。
// 读者、成员文件与 Python 工具三种归属可以同时成立（例如另一个成员的 `schema/` 既是那个成员的文件，
// 又被 stream-assembly 读），三者都算；归类只记第一类。命中全局或落进「其余」（没有规则认得它）的，
// 整份计划判全量：判不准就多跑，不按猜的范围少跑。
//
// 改了哪些成员、哪些成员依赖它们，由 turbo 的 `--affected` 给出（turbo.ts）；这里不自己求依赖闭包。
// turbo 按包计改动，成员根目录文档（`memberDocuments`）一改就选中那个成员与它的全部下游。这类文件不算成员改动，
// 也不作下游选择的种子：只改了文档的成员带出的下游，按 turbo 的依赖图（`dependents`）从 `--affected` 里拿掉，
// 同时是代码改动成员下游的照旧留下。测试读的成员根目录文档由读者规则点名，只选规则点名的成员，不带下游。
// 拿之前核对 turbo 选中的成员都能由代码改动成员与只改了文档的成员及其下游解释；有解释不了的，
// turbo 的种子里就有这里没认出的改动，影响面未知，判全量。
// turbo 不认成员目录以外的读取（2026-10-15 在 turbo 2.11.7 上验证：`--affected` 默认不看任务 inputs），
// 读者规则仍在这里。
//
// 锁文件单独一类：`pnpm-lock.yaml` 是唯一命中的全局文件时，交锁文件判定（lockfile-impact.ts）按 importer 映射到成员，
// 映射到的成员作为种子，与代码改动的成员一样按 turbo 的依赖图带上下游；判不准、没有判定、引擎自己在里面，仍判全量。
// 它与别的全局文件一起改时不问判定，直接全量。
import { isLegacyDirectory, isLegacyFile } from '@omne-harness/repo-toolchain/core/check-scope'
import type { AffectedRules } from './config.ts'
import type { LockfileAffectedMember, LockfileImpact } from './lockfile-impact.ts'
import { ownerOf, type WorkspaceMember } from '@omne-harness/repo-toolchain/core/workspace'

export const LOCKFILE_PATH = 'pnpm-lock.yaml'
/** 影响面引擎自己所在的成员：它的依赖变了，这次的计划就是用变了依赖的引擎算的，不能拿它给自己划范围。 */
export const ENGINE_MEMBER = 'tools/test-runner'

/** 锁文件判定：只在 `pnpm-lock.yaml` 是唯一命中的全局文件时才问它；基线与 HEAD 两份锁文件由调用方取。 */
export type LockfileJudge = () => LockfileImpact

/** `*` 不跨目录；`**` 跨目录，`**\/` 也匹配零层目录。 */
export function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replaceAll(/[.+?^${}()|[\]\\]/gu, '\\$&')
    .replaceAll('**/', '\u0001')
    .replaceAll('**', '\u0000')
    .replaceAll('*', '[^/]*')
    .replaceAll('\u0001', '(?:.*/)?')
    .replaceAll('\u0000', '.*')
  return new RegExp(`^${escaped}$`, 'u')
}

const firstMatch = (path: string, patterns: readonly string[]) =>
  patterns.find(pattern => patternToRegExp(pattern).test(path))

export type FileCategory =
  | 'excluded'
  | 'global'
  | 'lockfile'
  | 'reader'
  | 'member'
  | 'python'
  | 'resident'
  | 'unclassified'

export interface ClassifiedFile {
  readonly path: string
  /** 按顺序第一类命中的。 */
  readonly category: FileCategory
  /** 第一类命中的那条规则：配置里的路径模式；成员文件是成员目录。`unclassified` 没有。 */
  readonly rule?: string
  /** 命中的读者规则：哪条路径模式、把哪些成员带进来。 */
  readonly reads: readonly { readonly pattern: string; readonly members: readonly string[] }[]
  /** 算作成员改动时归属的成员（最长前缀）；成员根目录文档不算。 */
  readonly owner?: string
  /** 命中 `memberDocuments` 的成员根目录文档所在的成员：不算它的改动，也不作 turbo 下游选择的种子。 */
  readonly documentOf?: string
  /** 命中 Python 工具的模式。 */
  readonly python?: string
}

/** 一个文件归哪类、带进哪些成员；纯函数。 */
export function classify(
  path: string,
  members: readonly WorkspaceMember[],
  rules: AffectedRules,
): ClassifiedFile {
  if (isLegacyFile(path)) return { path, category: 'excluded', reads: [] }
  const global = firstMatch(path, rules.globalPaths)
  if (global !== undefined)
    return {
      path,
      category: path === LOCKFILE_PATH ? 'lockfile' : 'global',
      rule: global,
      reads: [],
    }
  const reads = rules.readers.flatMap(reader => {
    const pattern = firstMatch(path, reader.paths)
    return pattern === undefined ? [] : [{ pattern, members: reader.members }]
  })
  const memberOwner = ownerOf(path, members)
  const memberDocument =
    memberOwner === undefined ? undefined : firstMatch(path, rules.memberDocuments)
  const owner = memberDocument === undefined ? memberOwner?.path : undefined
  const python = firstMatch(path, rules.pythonPaths)
  const documentOf = memberDocument === undefined ? undefined : memberOwner?.path
  const effects = {
    reads,
    ...(owner === undefined ? {} : { owner }),
    ...(documentOf === undefined ? {} : { documentOf }),
    ...(python === undefined ? {} : { python }),
  }
  const firstRead = reads[0]
  if (firstRead !== undefined)
    return { path, category: 'reader', rule: firstRead.pattern, ...effects }
  if (owner !== undefined) return { path, category: 'member', rule: owner, ...effects }
  if (python !== undefined) return { path, category: 'python', rule: python, ...effects }
  if (memberDocument !== undefined)
    return { path, category: 'resident', rule: memberDocument, ...effects }
  const resident = firstMatch(path, rules.residentPaths)
  if (resident !== undefined) return { path, category: 'resident', rule: resident, reads }
  return { path, category: 'unclassified', reads }
}

/**
 * 这些成员连同直接、间接依赖它们的成员（成员目录），按 turbo 的包依赖图，不看改动（turbo.ts 的 `dependentMembers`）。
 * 测试用造出来的依赖图代替。
 */
export type Dependents = (members: readonly string[]) => ReadonlySet<string>

/** 只改了文档的一个成员与它改了的成员根目录文档。 */
export interface DocumentsOnlyMember {
  readonly path: string
  readonly files: readonly string[]
}

/**
 * 只改了文档的成员：成员目录里改的都是 `memberDocuments` 命中的文件；只看给出的成员（调用方给在役的）。
 * `owners` 是有代码改动的成员。
 */
function documentsOnlyMembers(
  files: readonly ClassifiedFile[],
  members: readonly { readonly path: string }[],
  owners: ReadonlySet<string>,
): DocumentsOnlyMember[] {
  return members.flatMap(member => {
    if (owners.has(member.path)) return []
    const documents = files.filter(file => file.documentOf === member.path).map(file => file.path)
    return documents.length === 0 ? [] : [{ path: member.path, files: documents }]
  })
}

/** 拿掉文档种子的结果：拿掉后的成员，或 turbo 选中却解释不了的成员。 */
type Narrowed =
  | { readonly affected: ReadonlySet<string> }
  | { readonly unexplained: readonly string[] }

/**
 * turbo 的 `--affected` 拿掉只因文档种子带进来的成员：只改了文档的成员及其下游里，不是代码改动成员下游的那些。
 * 没有只改了文档的成员时原样返回，不求依赖图。要拿却没给依赖图就报错：不悄悄照 turbo 多选，也不猜着少选。
 * 拿之前核对 turbo 选中的每个成员都在代码改动成员或只改了文档的成员的下游里（含它们自己）：
 * 有不在的，说明 turbo 的种子里有这里没认出的改动，拿掉就可能漏选，返回这些成员，由调用方判全量。
 */
function withoutDocumentSeeds(
  affected: ReadonlySet<string>,
  owners: ReadonlySet<string>,
  documentsOnly: readonly DocumentsOnlyMember[],
  dependents: Dependents | undefined,
): Narrowed {
  if (documentsOnly.length === 0) return { affected }
  if (dependents === undefined)
    throw new Error(
      `${sample(documentsOnly.map(member => member.path))} 只改了文档，要拿掉它们带出的下游，但没有给出 turbo 的依赖图`,
    )
  const kept = dependents([...owners])
  const dropped = dependents(documentsOnly.map(member => member.path))
  const unexplained = [...affected].filter(member => !kept.has(member) && !dropped.has(member))
  if (unexplained.length > 0) return { unexplained }
  return {
    affected: new Set([...affected].filter(member => kept.has(member) || !dropped.has(member))),
  }
}

/** 一个被选中的成员为什么被选中；三项可以同时有。 */
export interface PlannedMember {
  readonly path: string
  /** 它自己改了的文件。 */
  readonly changed: readonly string[]
  /** 它的测试读、被改了的成员外路径（读者规则）。 */
  readonly reads: readonly { readonly path: string; readonly pattern: string }[]
  /** 自己没改代码，因依赖了改动过代码（或锁文件里依赖变了）的成员而被 turbo 选中。 */
  readonly downstream?: true
  /** 锁文件里它的依赖变了（lockfile-impact.ts 的映射）：importer 条目变了，或它直接、间接依赖的这些包变了。 */
  readonly lockfile?: Omit<LockfileAffectedMember, 'path'>
}

export type BuildReason = 'selected' | 'resident'

export interface CheckPlan {
  readonly mode: 'full' | 'scoped'
  /** 一句话：为什么是这个模式、这个范围。 */
  readonly reason: string
  readonly files: readonly ClassifiedFile[]
  /** 按范围时被选中的成员及原因；全量时为空（所有在役成员）。 */
  readonly members: readonly PlannedMember[]
  /** 要构建的成员：被选中的与常驻检查需要的；上游依赖由 turbo 先构建。只取有 build 脚本的。 */
  readonly build: readonly { readonly path: string; readonly reason: BuildReason }[]
  readonly typecheck: readonly string[]
  readonly test: readonly string[]
  readonly acceptance: readonly string[]
  readonly python: { readonly run: boolean; readonly reason: string }
  /**
   * 只改了文档、没有选中的成员与它们改了的文档（按范围时由 `planCheck` 给出；全量时为空）。
   * 可选：手写的计划文件可以不给，读作没有。
   */
  readonly documentsOnly?: readonly DocumentsOnlyMember[]
  /** 问过锁文件判定时它的结论原文（映射到成员，或两份等价）；判全量时写在 `reason` 里，没问时没有。 */
  readonly lockfile?: string
}

/**
 * `scripts/check.sh` 每次都跑的常驻步骤，按脚本里的顺序写；计划打印原样列出。
 * 经 pnpm 运行的写根 `package.json` 的脚本名；直接运行 dev-flow 的两步写 `change-scope`（本卡改动的核对）
 * 与 `contract-check`（契约快照核对）。
 * `scripts/check.sh` 改了常驻步骤这里要跟着改，`tests/scope.spec.ts` 从脚本读出来比对。
 */
export const RESIDENT_STEPS = [
  'check:agents',
  'check:docs',
  'check:design',
  'check:lines',
  'change-scope',
  'format:check',
  'test:format',
  'check:declarations',
  'contract-check',
  'lint:rules',
  'lint:oxlint',
  'lint:deps',
  'loop:status',
] as const

/** 列出前几个，多了写总数。 */
export function sample(paths: readonly string[], top = 5): string {
  return paths.length <= top
    ? paths.join('、')
    : `${paths.slice(0, top).join('、')} 等 ${paths.length} 个`
}

const withScript = (members: readonly WorkspaceMember[], script: string, among?: Set<string>) =>
  members
    .filter(member => member.scripts[script] !== undefined)
    .filter(member => among === undefined || among.has(member.path))
    .map(member => member.path)

/** 规则里点名的成员都要真的存在：成员改名或删掉后规则还指着旧目录，是规则错了，不悄悄忽略。 */
function checkRuleMembers(members: readonly WorkspaceMember[], rules: AffectedRules): void {
  const known = new Set(members.map(member => member.path))
  const named = [
    ...rules.readers.flatMap(reader => reader.members),
    ...rules.residentBuild.map(entry => entry.member),
  ]
  const missing = [...new Set(named.filter(path => !known.has(path)))]
  if (missing.length > 0) throw new Error(`影响面规则点名了不存在的成员：${missing.join('、')}`)
}

function fullPlan(
  members: readonly WorkspaceMember[],
  files: readonly ClassifiedFile[],
  reason: string,
  rules: AffectedRules,
): CheckPlan {
  const active = members.filter(member => !isLegacyDirectory(member.path))
  return {
    mode: 'full',
    reason,
    files,
    members: [],
    build: buildList(new Set(active.map(member => member.path)), members, rules),
    typecheck: withScript(active, 'typecheck'),
    test: withScript(active, 'test'),
    acceptance: withScript(active, 'acceptance'),
    python: { run: true, reason: '全量' },
    documentsOnly: [],
  }
}

function selectMembers(
  files: readonly ClassifiedFile[],
  members: readonly WorkspaceMember[],
  affected: ReadonlySet<string>,
  lockfile: ReadonlyMap<string, LockfileAffectedMember>,
): PlannedMember[] {
  const changed = new Map<string, string[]>()
  const reads = new Map<string, { path: string; pattern: string }[]>()
  for (const file of files) {
    if (file.owner !== undefined)
      changed.set(file.owner, [...(changed.get(file.owner) ?? []), file.path])
    for (const hit of file.reads)
      for (const member of hit.members)
        reads.set(member, [...(reads.get(member) ?? []), { path: file.path, pattern: hit.pattern }])
  }
  // 读者不沿反向依赖传播：读文件的是那个成员的测试，依赖它的成员不读。
  // `affected` 已拿掉文档种子带出的成员，turbo 选中而自己没改代码、锁文件里依赖也没变的，就是种子成员的下游。
  return members.flatMap(member => {
    const own = changed.get(member.path) ?? []
    const read = reads.get(member.path) ?? []
    const viaLockfile = lockfile.get(member.path)
    const byTurbo = affected.has(member.path)
    if (own.length === 0 && read.length === 0 && !byTurbo && viaLockfile === undefined) return []
    return [
      {
        path: member.path,
        changed: own,
        reads: read,
        ...(viaLockfile === undefined
          ? {}
          : {
              lockfile: {
                importerChanged: viaLockfile.importerChanged,
                packages: viaLockfile.packages,
              },
            }),
        ...(byTurbo && own.length === 0 && viaLockfile === undefined
          ? { downstream: true as const }
          : {}),
      },
    ]
  })
}

/** 要构建的成员：被选中的与常驻检查需要的；它们依赖的上游由 turbo 按依赖先构建。只取有 build 脚本的。 */
function buildList(
  selected: ReadonlySet<string>,
  members: readonly WorkspaceMember[],
  rules: AffectedRules,
): CheckPlan['build'] {
  const resident = new Set(rules.residentBuild.map(entry => entry.member))
  return members
    .filter(member => member.scripts['build'] !== undefined)
    .flatMap(member => {
      const reason: BuildReason | undefined = selected.has(member.path)
        ? 'selected'
        : resident.has(member.path)
          ? 'resident'
          : undefined
      return reason === undefined ? [] : [{ path: member.path, reason }]
    })
}

function scopedReason(
  files: readonly ClassifiedFile[],
  planned: readonly PlannedMember[],
  documentsOnly: number,
  python: boolean,
): string {
  if (files.length === 0) return '基线以来没有改动'
  const documents = documentsOnly === 0 ? '' : `；只改了文档、不选的成员 ${documentsOnly} 个`
  if (planned.length === 0)
    return (
      (python
        ? `只跑 pytest：${files.length} 个改动文件里有 Python 工具读的，没有成员受影响`
        : `只需常驻检查：${files.length} 个改动文件都只被常驻检查读`) + documents
    )
  const own = planned.filter(member => member.changed.length > 0).length
  const viaLockfile = planned.filter(member => member.lockfile !== undefined).length
  const readers = planned.filter(
    member =>
      member.changed.length === 0 && member.lockfile === undefined && member.reads.length > 0,
  )
  const dependents = planned.filter(
    member => member.downstream === true && member.reads.length === 0,
  )
  return (
    `${files.length} 个改动文件，成员 ${planned.length} 个` +
    `（自己改了 ${own} 个、锁文件里依赖变了 ${viaLockfile} 个、依赖方 ${dependents.length} 个、只因读者规则 ${readers.length} 个）` +
    documents +
    `；pytest ${python ? '跑' : '不跑'}`
  )
}

/** 锁文件判定的结论落到计划上：全量的原因，或作为种子的成员（只取在役的；退役成员不进任何计划）。 */
type LockfileSeeds =
  | { readonly full: string }
  | { readonly members: ReadonlyMap<string, LockfileAffectedMember>; readonly reason: string }

function lockfileSeeds(
  files: readonly ClassifiedFile[],
  active: readonly WorkspaceMember[],
  judge: LockfileJudge | undefined,
): LockfileSeeds | undefined {
  if (!files.some(file => file.category === 'lockfile')) return undefined
  if (judge === undefined) return { full: `${LOCKFILE_PATH} 有改动，没有锁文件判定，判为全量` }
  const impact = judge()
  if (impact.kind === 'full') return { full: `${LOCKFILE_PATH} 有改动：${impact.reason}` }
  if (impact.kind === 'unchanged') return { members: new Map(), reason: impact.reason }
  const known = new Set(active.map(member => member.path))
  return {
    members: new Map(
      impact.members.filter(member => known.has(member.path)).map(member => [member.path, member]),
    ),
    reason: impact.reason,
  }
}

/**
 * 由改动过的文件、成员清单、规则、turbo 判为受影响的成员（`--affected`）与 turbo 的依赖图算出执行计划；
 * 除 `dependents` 与 `judgeLockfile` 外不读外部状态。`full` 为真（`FULL=1`）直接给全量计划。规则里点名了不存在的成员就抛错；
 * 有只改了文档的成员或锁文件映射到了成员而没给 `dependents` 也抛错。turbo 选中了改动解释不了的成员时，不拿文档种子的下游，判全量。
 * `pnpm-lock.yaml` 是唯一命中的全局文件时问 `judgeLockfile`：映射到的成员作为种子带上下游；判全量、没给判定、
 * 引擎自己（`tools/test-runner`）在种子或其下游里，都判全量。锁文件与别的全局文件一起改时不问，直接全量。
 */
export function planCheck(
  changedPaths: readonly string[],
  members: readonly WorkspaceMember[],
  rules: AffectedRules,
  affected: ReadonlySet<string>,
  full = false,
  dependents?: Dependents,
  judgeLockfile?: LockfileJudge,
): CheckPlan {
  checkRuleMembers(members, rules)
  const files = [...new Set(changedPaths)].sort().map(path => classify(path, members, rules))
  if (full) return fullPlan(members, files, 'FULL=1：要求全量', rules)
  const globals = files.filter(file => file.category === 'global')
  const first = globals[0]
  if (first !== undefined)
    return fullPlan(
      members,
      files,
      `全局文件 ${first.path} 有改动（命中 ${first.rule ?? ''}）` +
        (globals.length > 1 ? `，另有 ${globals.length - 1} 个全局文件` : '') +
        (files.some(file => file.category === 'lockfile') ? `，另有 ${LOCKFILE_PATH}` : ''),
      rules,
    )
  const active = members.filter(member => !isLegacyDirectory(member.path))
  const lockfile = lockfileSeeds(files, active, judgeLockfile)
  if (lockfile !== undefined && 'full' in lockfile)
    return fullPlan(members, files, lockfile.full, rules)
  const unknown = files.filter(file => file.category === 'unclassified').map(file => file.path)
  if (unknown.length > 0)
    return fullPlan(
      members,
      files,
      `${unknown.length} 个改动文件不在任何规则里，影响面未知：${sample(unknown)}`,
      rules,
    )

  const viaLockfile = lockfile?.members ?? new Map<string, LockfileAffectedMember>()
  if (viaLockfile.size > 0 && dependents === undefined)
    throw new Error(
      `锁文件改动映射到 ${sample([...viaLockfile.keys()])}，要按依赖图带上它们的下游，但没有给出 turbo 的依赖图`,
    )
  // 锁文件映射到的成员与它们的下游：turbo 的 `--affected` 不一定选中它们，这里并进去；它们是合法种子，不是解释不了的成员。
  const lockfileClosure =
    viaLockfile.size > 0 && dependents !== undefined
      ? dependents([...viaLockfile.keys()])
      : new Set<string>()
  if (viaLockfile.has(ENGINE_MEMBER) || lockfileClosure.has(ENGINE_MEMBER))
    return fullPlan(
      members,
      files,
      `${LOCKFILE_PATH} 有改动：${lockfile?.reason ?? ''}；${ENGINE_MEMBER} 自己的依赖变了，引擎不能给自己划范围，判为全量`,
      rules,
    )
  const owners = new Set(files.flatMap(file => (file.owner === undefined ? [] : [file.owner])))
  const seeds = new Set([...owners, ...viaLockfile.keys()])
  const documents = documentsOnlyMembers(files, active, seeds)
  const narrowed = withoutDocumentSeeds(
    new Set([...affected, ...lockfileClosure]),
    seeds,
    documents,
    dependents,
  )
  if ('unexplained' in narrowed)
    return fullPlan(
      members,
      files,
      `turbo 判为受影响的成员里有 ${narrowed.unexplained.length} 个不在代码改动成员与只改了文档的成员的下游里，` +
        `影响面未知：${sample(narrowed.unexplained)}`,
      rules,
    )
  const planned = selectMembers(files, active, narrowed.affected, viaLockfile)
  const selected = new Set(planned.map(member => member.path))
  const unselected = documents.filter(member => !selected.has(member.path))
  const pythonHits = files.filter(file => file.python !== undefined)
  return {
    mode: 'scoped',
    reason: scopedReason(files, planned, unselected.length, pythonHits.length > 0),
    files,
    members: planned,
    build: buildList(selected, members, rules),
    typecheck: withScript(members, 'typecheck', selected),
    test: withScript(members, 'test', selected),
    acceptance: withScript(members, 'acceptance', selected),
    python:
      pythonHits.length > 0
        ? {
            run: true,
            reason: `${sample(
              pythonHits.map(file => file.path),
              3,
            )} 命中 Python 工具的路径（${pythonHits[0]?.python ?? ''}）`,
          }
        : { run: false, reason: '没有改动命中 Python 工具的路径' },
    documentsOnly: unselected,
    ...(lockfile === undefined ? {} : { lockfile: lockfile.reason }),
  }
}

/** 说明里按这个顺序列各类：先列让计划判全量的两类。 */
const CATEGORY_NAMES: Readonly<Record<FileCategory, string>> = {
  excluded: '退役目录，排除',
  global: '全局',
  lockfile: '锁文件',
  unclassified: '未归类',
  reader: '读者',
  member: '成员文件',
  python: 'Python 工具',
  resident: '只需常驻检查',
}

function whyMember(member: PlannedMember): string {
  const parts: string[] = []
  if (member.changed.length > 0) parts.push(`自己改了 ${sample(member.changed, 2)}`)
  if (member.lockfile !== undefined)
    parts.push(
      member.lockfile.packages.length === 0
        ? '锁文件里它的 importer 条目变了'
        : `锁文件里它依赖的 ${sample(member.lockfile.packages, 2)} 变了` +
            (member.lockfile.importerChanged ? '（importer 条目也变了）' : ''),
    )
  if (member.reads.length > 0)
    parts.push(
      `测试读 ${sample(
        member.reads.map(read => `${read.path}（${read.pattern}）`),
        2,
      )}`,
    )
  if (member.downstream === true) parts.push('依赖了改动过代码的成员（turbo --affected）')
  return parts.join('；')
}

/** 计划的文字说明：判成什么、每一步跑还是跳、范围多大、为什么；`configPath` 是规则所在的配置文件。 */
export function describeCheckPlan(
  plan: CheckPlan,
  rules: AffectedRules,
  configPath: string,
): string[] {
  const lines = [`判为${plan.mode === 'full' ? '全量' : '按影响面'}：${plan.reason}`]
  for (const category of Object.keys(CATEGORY_NAMES) as FileCategory[]) {
    const files = plan.files.filter(file => file.category === category)
    if (files.length === 0) continue
    const rulesHit = [...new Set(files.map(file => file.rule).filter(rule => rule !== undefined))]
    lines.push(
      `  ${CATEGORY_NAMES[category]} ${files.length} 个：${sample(
        files.map(file => file.path),
        3,
      )}` + (rulesHit.length === 0 ? '' : `（命中 ${sample(rulesHit, 3)}）`),
    )
  }
  lines.push(`  规则：${configPath} 的 affected`)
  if (plan.lockfile !== undefined) lines.push(`  锁文件：${plan.lockfile}`)

  const residentOnly = plan.mode === 'scoped' && plan.members.length === 0 && !plan.python.run
  if (residentOnly && plan.files.length > 0)
    lines.push(
      '判为只需常驻检查，跳过了类型检查、成员测试、验收、pytest；构建只做常驻检查需要的成员' +
        `（依据：${configPath} 的 affected.residentPaths 与 memberDocuments）`,
    )
  lines.push('步骤：')
  lines.push(`  常驻：${RESIDENT_STEPS.join('、')}（loop:status 带 --strict）`)
  lines.push(`  pytest：${plan.python.run ? '跑' : '跳过'}——${plan.python.reason}`)
  if (plan.mode === 'full') {
    lines.push(`  构建：${plan.build.length} 个计划成员，含必要依赖准备`)
    lines.push(`  类型检查：全部 ${plan.typecheck.length} 个在役成员`)
    lines.push(`  成员测试：全部 ${plan.test.length} 个成员的快层，快层通过才跑慢层`)
  } else {
    const resident = plan.build.filter(entry => entry.reason === 'resident').map(e => e.path)
    const forTests = plan.build.filter(entry => entry.reason === 'selected').map(e => e.path)
    const residentWhy = rules.residentBuild
      .filter(entry => resident.includes(entry.member))
      .map(entry => entry.why)
    const residentNote =
      resident.length === 0
        ? ''
        : `${resident.join('、')}——常驻检查需要${residentWhy.length > 0 ? `：${residentWhy.join('；')}` : ''}`
    lines.push(
      forTests.length === 0
        ? `  构建：只构建 ${residentNote}`
        : `  构建：${plan.build.length} 个——被选中的成员 ${sample(forTests, 6)}，turbo 先构建它们的上游` +
            (resident.length === 0 ? '' : `；另有 ${residentNote}`),
    )
    lines.push(
      plan.typecheck.length === 0
        ? '  类型检查：跳过——没有被选中的成员'
        : `  类型检查：${plan.typecheck.length} 个成员`,
    )
    lines.push(
      plan.test.length === 0
        ? '  成员测试：没有要跑的成员'
        : `  成员测试：${plan.test.length} 个成员的快层，快层通过才跑慢层`,
    )
  }
  lines.push(
    plan.acceptance.length === 0
      ? '  验收：跳过——本次影响面不含带验收的成员'
      : `  验收：${plan.acceptance.join('、')}`,
  )
  if (plan.mode === 'scoped' && plan.members.length > 0) {
    lines.push('被选中的成员：')
    for (const member of plan.members) lines.push(`  ${member.path}：${whyMember(member)}`)
  }
  const documents = plan.documentsOnly ?? []
  if (documents.length > 0) {
    lines.push(
      `只改了文档、不选的成员（成员根目录文档不算成员改动，也不带下游；依据：${configPath} 的 affected.memberDocuments）：`,
    )
    for (const member of documents)
      lines.push(`  ${member.path}：只改了 ${sample(member.files, 2)}`)
  }
  return lines
}
