// 影响面：把「基线以来改了哪些文件」算成 `make check` 的执行计划——每一步跑还是跳、跑哪些成员、为什么。
// 纯函数；路径规则只在 `test-runs.config.json` 的 `affected` 里定一次。
//
// 每个改动文件按顺序归到第一类命中的：全局 → 读者 → 成员文件 → Python 工具 → 只需常驻检查 → 其余。
// 读者、成员文件与 Python 工具三种归属可以同时成立（例如另一个成员的 `schema/` 既是那个成员的文件，
// 又被 stream-assembly 读），三者都算；归类只记第一类。命中全局或落进「其余」（没有规则认得它）的，
// 整份计划判全量：判不准就多跑，不按猜的范围少跑。
//
// 成员按 package.json 声明的 workspace 依赖求反向传递闭包。pnpm 自带的 `--filter "...[<since>]"`
// 做的是同一件事，但它在 git 工作树里匹配不到任何包（2026-10-01 在 pnpm 10.28.1 上验证：主检出选中 41 个，
// 同一提交的工作树选中 0 个），而实施都在工作树里进行，所以这里自己算。
import type { AffectedRules } from './config.ts'
import { ownerOf, type WorkspaceMember } from './members.ts'

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

export type FileCategory = 'global' | 'reader' | 'member' | 'python' | 'resident' | 'unclassified'

export interface ClassifiedFile {
  readonly path: string
  /** 按顺序第一类命中的。 */
  readonly category: FileCategory
  /** 第一类命中的那条规则：配置里的路径模式；成员文件是成员目录。`unclassified` 没有。 */
  readonly rule?: string
  /** 命中的读者规则：哪条路径模式、把哪些成员带进来。 */
  readonly reads: readonly { readonly pattern: string; readonly members: readonly string[] }[]
  /** 算作成员改动时归属的成员（最长前缀）；成员目录里的文档不算。 */
  readonly owner?: string
  /** 命中 Python 工具的模式。 */
  readonly python?: string
}

/** 一个文件归哪类、带进哪些成员；纯函数。 */
export function classify(
  path: string,
  members: readonly WorkspaceMember[],
  rules: AffectedRules,
): ClassifiedFile {
  const global = firstMatch(path, rules.globalPaths)
  if (global !== undefined) return { path, category: 'global', rule: global, reads: [] }
  const reads = rules.readers.flatMap(reader => {
    const pattern = firstMatch(path, reader.paths)
    return pattern === undefined ? [] : [{ pattern, members: reader.members }]
  })
  const memberOwner = ownerOf(path, members)
  const memberDocument =
    memberOwner === undefined ? undefined : firstMatch(path, rules.memberDocuments)
  const owner = memberDocument === undefined ? memberOwner?.path : undefined
  const python = firstMatch(path, rules.pythonPaths)
  const effects = {
    reads,
    ...(owner === undefined ? {} : { owner }),
    ...(python === undefined ? {} : { python }),
  }
  const firstRead = reads[0]
  if (firstRead !== undefined)
    return { path, category: 'reader', rule: firstRead.pattern, ...effects }
  if (owner !== undefined) return { path, category: 'member', rule: owner, ...effects }
  if (python !== undefined) return { path, category: 'python', rule: python, ...effects }
  const resident = memberDocument ?? firstMatch(path, rules.residentPaths)
  if (resident !== undefined) return { path, category: 'resident', rule: resident, reads }
  return { path, category: 'unclassified', reads }
}

/** 一个被选中的成员为什么被选中；三项可以同时有。 */
export interface PlannedMember {
  readonly path: string
  /** 它自己改了的文件。 */
  readonly changed: readonly string[]
  /** 它的测试读、被改了的成员外路径（读者规则）。 */
  readonly reads: readonly { readonly path: string; readonly pattern: string }[]
  /** 它（直接）依赖的、已被选中的成员：沿反向依赖走到它的那一步。 */
  readonly dependsOn?: string
}

export type BuildReason = 'selected' | 'dependency' | 'resident'

export interface CheckPlan {
  readonly mode: 'full' | 'scoped'
  /** 一句话：为什么是这个模式、这个范围。 */
  readonly reason: string
  readonly files: readonly ClassifiedFile[]
  /** 按范围时被选中的成员及原因；全量时为空（全部成员）。 */
  readonly members: readonly PlannedMember[]
  /** 要构建的成员：被选中的、它们的传递依赖、常驻检查需要的；只取有 build 脚本的。 */
  readonly build: readonly { readonly path: string; readonly reason: BuildReason }[]
  readonly typecheck: readonly string[]
  readonly test: readonly string[]
  readonly acceptance: readonly string[]
  readonly python: { readonly run: boolean; readonly reason: string }
}

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
): CheckPlan {
  return {
    mode: 'full',
    reason,
    files,
    members: [],
    build: withScript(members, 'build').map(path => ({ path, reason: 'selected' })),
    typecheck: withScript(members, 'typecheck'),
    test: withScript(members, 'test'),
    acceptance: withScript(members, 'acceptance'),
    python: { run: true, reason: '全量' },
  }
}

/** 沿声明的依赖往下走：这些成员连同它们直接、间接依赖的成员。 */
function dependencyClosure(
  start: Iterable<string>,
  members: readonly WorkspaceMember[],
): Set<string> {
  const byName = new Map(members.map(member => [member.name, member]))
  const byPath = new Map(members.map(member => [member.path, member]))
  const reached = new Set(start)
  const queue = [...reached]
  for (let head = queue.shift(); head !== undefined; head = queue.shift())
    for (const name of byPath.get(head)?.dependencies ?? []) {
      const target = byName.get(name)
      if (target !== undefined && !reached.has(target.path)) {
        reached.add(target.path)
        queue.push(target.path)
      }
    }
  return reached
}

/** 沿反向依赖往上走：返回每个被走到的成员是经哪个成员走到的。 */
function dependentClosure(
  start: Iterable<string>,
  members: readonly WorkspaceMember[],
): Map<string, string> {
  const byName = new Map(members.map(member => [member.name, member]))
  const dependentsOf = new Map<string, string[]>()
  for (const member of members)
    for (const name of member.dependencies) {
      const target = byName.get(name)
      if (target !== undefined)
        dependentsOf.set(target.path, [...(dependentsOf.get(target.path) ?? []), member.path])
    }
  const via = new Map<string, string>()
  const reached = new Set(start)
  const queue = [...reached]
  for (let head = queue.shift(); head !== undefined; head = queue.shift())
    for (const dependent of dependentsOf.get(head) ?? [])
      if (!reached.has(dependent)) {
        reached.add(dependent)
        via.set(dependent, head)
        queue.push(dependent)
      }
  return via
}

function selectMembers(
  files: readonly ClassifiedFile[],
  members: readonly WorkspaceMember[],
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
  const via = dependentClosure(changed.keys(), members)
  return members.flatMap(member => {
    const own = changed.get(member.path) ?? []
    const read = reads.get(member.path) ?? []
    const dependsOn = via.get(member.path)
    if (own.length === 0 && read.length === 0 && dependsOn === undefined) return []
    return [
      {
        path: member.path,
        changed: own,
        reads: read,
        ...(dependsOn === undefined ? {} : { dependsOn }),
      },
    ]
  })
}

function buildList(
  selected: ReadonlySet<string>,
  members: readonly WorkspaceMember[],
  rules: AffectedRules,
): CheckPlan['build'] {
  const forTests = dependencyClosure(selected, members)
  const forResident = dependencyClosure(
    rules.residentBuild.map(entry => entry.member),
    members,
  )
  return members
    .filter(member => member.scripts['build'] !== undefined)
    .flatMap(member => {
      const reason: BuildReason | undefined = selected.has(member.path)
        ? 'selected'
        : forTests.has(member.path)
          ? 'dependency'
          : forResident.has(member.path)
            ? 'resident'
            : undefined
      return reason === undefined ? [] : [{ path: member.path, reason }]
    })
}

function scopedReason(
  files: readonly ClassifiedFile[],
  planned: readonly PlannedMember[],
  python: boolean,
): string {
  if (files.length === 0) return '基线以来没有改动'
  if (planned.length === 0 && !python)
    return `只需常驻检查：${files.length} 个改动文件都只被常驻检查读`
  const own = planned.filter(member => member.changed.length > 0).length
  const readers = planned.filter(member => member.changed.length === 0 && member.reads.length > 0)
  const dependents = planned.filter(
    member => member.changed.length === 0 && member.reads.length === 0,
  )
  return (
    `按影响面：${files.length} 个改动文件，成员 ${planned.length} 个` +
    `（自己改了 ${own} 个、依赖方 ${dependents.length} 个、只因读者规则 ${readers.length} 个）` +
    `；pytest ${python ? '跑' : '不跑'}`
  )
}

/**
 * 由改动过的文件、成员清单与规则算出执行计划；纯函数。`full` 为真（`FULL=1`）直接给全量计划。
 * 规则里点名了不存在的成员就抛错。
 */
export function planCheck(
  changedPaths: readonly string[],
  members: readonly WorkspaceMember[],
  rules: AffectedRules,
  full = false,
): CheckPlan {
  checkRuleMembers(members, rules)
  const files = [...new Set(changedPaths)].sort().map(path => classify(path, members, rules))
  if (full) return fullPlan(members, files, 'FULL=1：要求全量')
  const globals = files.filter(file => file.category === 'global')
  const first = globals[0]
  if (first !== undefined)
    return fullPlan(
      members,
      files,
      `全局文件 ${first.path} 有改动（命中 ${first.rule ?? ''}）` +
        (globals.length > 1 ? `，另有 ${globals.length - 1} 个全局文件` : ''),
    )
  const unknown = files.filter(file => file.category === 'unclassified').map(file => file.path)
  if (unknown.length > 0)
    return fullPlan(
      members,
      files,
      `${unknown.length} 个改动文件不在任何规则里，影响面未知：${sample(unknown)}`,
    )

  const planned = selectMembers(files, members)
  const selected = new Set(planned.map(member => member.path))
  const pythonHits = files.filter(file => file.python !== undefined)
  return {
    mode: 'scoped',
    reason: scopedReason(files, planned, pythonHits.length > 0),
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
  }
}

/** 说明里按这个顺序列各类：先列让计划判全量的两类。 */
const CATEGORY_NAMES: Readonly<Record<FileCategory, string>> = {
  global: '全局',
  unclassified: '未归类',
  reader: '读者',
  member: '成员文件',
  python: 'Python 工具',
  resident: '只需常驻检查',
}

function whyMember(member: PlannedMember): string {
  const parts: string[] = []
  if (member.changed.length > 0) parts.push(`自己改了 ${sample(member.changed, 2)}`)
  if (member.reads.length > 0)
    parts.push(
      `测试读 ${sample(
        member.reads.map(read => `${read.path}（${read.pattern}）`),
        2,
      )}`,
    )
  if (member.dependsOn !== undefined) parts.push(`依赖 ${member.dependsOn}`)
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

  const residentOnly = plan.mode === 'scoped' && plan.members.length === 0 && !plan.python.run
  if (residentOnly && plan.files.length > 0)
    lines.push(
      '判为只需常驻检查，跳过了类型检查、成员测试、验收、pytest；构建只做常驻检查需要的成员' +
        `（依据：${configPath} 的 affected.residentPaths 与 memberDocuments）`,
    )
  lines.push('步骤：')
  lines.push(
    '  常驻：agents-check、docs-check、design-check、format:check、test:format、lint:rules、loop-status STRICT',
  )
  lines.push(`  pytest：${plan.python.run ? '跑' : '跳过'}——${plan.python.reason}`)
  if (plan.mode === 'full') {
    lines.push('  构建：全部（根 pnpm run build，含 examples 与工具）')
    lines.push('  类型检查：全部（根 pnpm run typecheck）')
    lines.push(`  成员测试：全部 ${plan.test.length} 个成员的快、慢两层`)
  } else {
    const resident = plan.build.filter(entry => entry.reason === 'resident')
    const forTests = plan.build.length - resident.length
    const residentWhy = rules.residentBuild
      .filter(entry => resident.some(build => build.path === entry.member))
      .map(entry => `${entry.member}——${entry.why}`)
    lines.push(
      `  构建：${plan.build.length} 个` +
        (forTests > 0 ? `（被选中的成员及其依赖 ${forTests} 个）` : '') +
        (resident.length > 0
          ? `；常驻检查需要的 ${resident.map(entry => entry.path).join('、')}` +
            (residentWhy.length > 0 ? `（${residentWhy.join('；')}）` : '')
          : ''),
    )
    lines.push(
      plan.typecheck.length === 0
        ? '  类型检查：跳过——没有被选中的成员'
        : `  类型检查：${plan.typecheck.length} 个成员`,
    )
    lines.push(
      plan.test.length === 0
        ? '  成员测试：没有要跑的成员'
        : `  成员测试：${plan.test.length} 个成员的快、慢两层`,
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
  return lines
}
