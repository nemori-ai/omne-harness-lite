// 验收的覆盖声明：每份可执行验收在开头的注释块里恰好一行 `// covers: PF-016 S5`（多条用逗号隔开），
// 文件名以它覆盖的某个 topic 的编号开头，声明的每条场景都在那个 topic 的 acceptance.md 里有一行。
// 规矩正文在 `docs/workspace.md`「可执行验收」；场景行怎么认与设计区对账器同一条（`../product/scenarios.ts`）。
// 场景含义变了会换新编号，覆盖旧编号的验收在这里被点名——这是这份检查存在的理由。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Violation } from '../rule.ts'
import { readProductTopics, SCENARIO_ID, type ProductTopic } from '../product/scenarios.ts'
import type { RunScript } from '../testing/config.ts'
import { isAcceptancePath, type AcceptanceLockConfig } from './lock.ts'

export const ACCEPTANCE_COVERS_RULE = 'acceptance-covers'
/** 成员跑验收的脚本名；有验收文件的成员必须有它，测试运行器以 `--script acceptance` 跑它。 */
export const ACCEPTANCE_SCRIPT: RunScript = 'acceptance'

const SUFFIX = '.acceptance.ts'
const COVERS = /^\s*\/\/\s*covers\s*:(.*)$/u
const ITEM = /^(PF-\d{3})\s+(\S+)$/u
const FILE_TOPIC = /^(PF-\d{3})\./u
const SKIP = new Set(['node_modules', 'dist', '.git'])

export interface AcceptanceFile {
  /** 仓库相对路径。 */
  readonly path: string
  readonly text: string
}

export interface CoveredScenario {
  /** `PF-016`。 */
  readonly topic: string
  readonly id: string
}

/** 一份验收声明覆盖的场景；声明本身不合写法的项不在其中。 */
export interface Declaration {
  readonly path: string
  readonly covers: readonly CoveredScenario[]
}

/** 成员目录：路径里 `acceptance` 那一段之前的部分。 */
export function memberOfAcceptance(path: string, config: AcceptanceLockConfig): string {
  const segments = path.split('/')
  return segments.slice(0, segments.indexOf(config.directory, 1)).join('/')
}

/** 成员根下全部 `acceptance/**\/*.acceptance.ts`，仓库相对路径，排好序。 */
export function listAcceptanceFiles(root: string, config: AcceptanceLockConfig): string[] {
  const found: string[] = []
  const walk = (relative: string): void => {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue
      const path = `${relative}/${entry.name}`
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith(SUFFIX) && isAcceptancePath(path, config)) found.push(path)
    }
  }
  for (const memberRoot of config.memberRoots)
    if (statSync(join(root, memberRoot), { throwIfNoEntry: false })?.isDirectory() === true)
      walk(memberRoot)
  return found.sort()
}

type Problem = { readonly line: number; readonly message: string }

/** 开头注释块里那一行声明：文件开头连续的 `//` 注释行（中间可以有空行）里恰好一行 `// covers:`。 */
function declarationOf(text: string): {
  readonly declared?: { readonly line: number; readonly value: string }
  readonly problems: Problem[]
} {
  const lines = text.split('\n')
  let headerEnd = 0
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim()
    if (trimmed.startsWith('//')) headerEnd = index + 1
    else if (trimmed !== '') break
  }
  const found = lines.flatMap((line, index) => {
    const matched = COVERS.exec(line)
    return matched === null ? [] : [{ line: index + 1, value: matched[1] ?? '' }]
  })
  const header = found.filter(entry => entry.line <= headerEnd)
  const problems: Problem[] = found
    .filter(entry => entry.line > headerEnd)
    .map(entry => ({ line: entry.line, message: '覆盖声明要写在文件开头的注释块里' }))
  const [only, second] = header
  if (only === undefined)
    problems.push({
      line: 1,
      message:
        '开头的注释块里缺覆盖声明：恰好一行 `// covers: PF-<三位> <场景编号>`，多条用逗号隔开',
    })
  else if (second !== undefined)
    problems.push({
      line: second.line,
      message: `开头的注释块里有 ${header.length} 行覆盖声明（第 ${header.map(entry => entry.line).join('、')} 行），只能有一行`,
    })
  return second === undefined && only !== undefined ? { declared: only, problems } : { problems }
}

/** 声明里一项指的场景在不在：topic 目录唯一，那份 acceptance.md 里恰好一行带这个编号。 */
function scenarioProblem(
  scenario: CoveredScenario,
  byTopic: ReadonlyMap<string, readonly ProductTopic[]>,
): string | undefined {
  const item = `${scenario.topic} ${scenario.id}`
  const homes = byTopic.get(scenario.topic) ?? []
  const [home] = homes
  if (home === undefined) return `${scenario.topic} 在产品区里没有对应的 topic 目录`
  if (homes.length > 1)
    return `${scenario.topic} 在产品区里对应了 ${homes.length} 个目录：${homes.map(topic => topic.dir).join('、')}`
  const rows = home.scenarios.get(scenario.id) ?? []
  if (rows.length === 0)
    return `${item} 在 ${home.dir}/acceptance.md 里没有带这个编号的场景行：场景改了含义会换新编号，这份验收要跟着改或删`
  if (rows.length > 1)
    return `${item} 在 ${home.dir}/acceptance.md 里出现了 ${rows.length} 次（第 ${rows.join('、')} 行），指不到唯一的一行`
  return undefined
}

/** 声明的值逐项拆开：写法、重复、场景在不在。 */
function itemsOf(
  value: string,
  byTopic: ReadonlyMap<string, readonly ProductTopic[]>,
): { readonly covers: CoveredScenario[]; readonly problems: string[] } {
  const covers: CoveredScenario[] = []
  const problems: string[] = []
  for (const raw of value.split(/[,，]/u)) {
    const item = raw.trim()
    const matched = ITEM.exec(item)
    const scenario = { topic: matched?.[1] ?? '', id: matched?.[2] ?? '' }
    if (matched === null || !SCENARIO_ID.test(scenario.id)) {
      problems.push(
        item === ''
          ? '覆盖声明里有一项是空的'
          : `覆盖声明的「${item}」要写成 PF-<三位> <场景编号>（如 PF-016 S5）`,
      )
      continue
    }
    if (covers.some(seen => seen.topic === scenario.topic && seen.id === scenario.id)) {
      problems.push(`覆盖声明里 ${item} 写了两次`)
      continue
    }
    covers.push(scenario)
    const problem = scenarioProblem(scenario, byTopic)
    if (problem !== undefined) problems.push(problem)
  }
  return { covers, problems }
}

/** 文件名以 `PF-<三位>.` 开头，且这个 topic 在它声明覆盖的 topic 里。 */
function fileNameProblem(path: string, covers: readonly CoveredScenario[]): string | undefined {
  const named = FILE_TOPIC.exec(path.split('/').at(-1) ?? '')?.[1]
  if (named === undefined)
    return `文件名要以它覆盖的 topic 编号开头：<topic 编号>.<一句话>${SUFFIX}`
  if (covers.length === 0 || covers.some(scenario => scenario.topic === named)) return undefined
  const declared = [...new Set(covers.map(scenario => scenario.topic))].join('、')
  return `文件名的 ${named} 不在它声明覆盖的 topic 里（${declared}）`
}

export interface CoverageInput {
  readonly files: readonly AcceptanceFile[]
  readonly topics: readonly ProductTopic[]
  /** 成员目录 → 它有没有 `acceptance` 脚本。 */
  readonly hasScript: (member: string) => boolean
  readonly config: AcceptanceLockConfig
}

/** 纯函数：逐份核覆盖声明，返回违反与读出来的声明。 */
export function judgeCoverage(input: CoverageInput): {
  readonly violations: Violation[]
  readonly declarations: Declaration[]
} {
  const violations: Violation[] = []
  const declarations: Declaration[] = []
  const report = (path: string, line: number, message: string) =>
    violations.push({ rule: ACCEPTANCE_COVERS_RULE, path, line, message })
  const byTopic = new Map<string, ProductTopic[]>()
  for (const topic of input.topics)
    byTopic.set(topic.topic, [...(byTopic.get(topic.topic) ?? []), topic])

  for (const file of input.files) {
    const { declared, problems } = declarationOf(file.text)
    for (const problem of problems) report(file.path, problem.line, problem.message)
    const { covers, problems: itemProblems } =
      declared === undefined ? { covers: [], problems: [] } : itemsOf(declared.value, byTopic)
    for (const message of itemProblems) report(file.path, declared?.line ?? 1, message)
    const nameProblem = fileNameProblem(file.path, covers)
    if (nameProblem !== undefined) report(file.path, 1, nameProblem)
    declarations.push({ path: file.path, covers })
  }

  const members = [...new Set(input.files.map(file => memberOfAcceptance(file.path, input.config)))]
  for (const member of members.sort())
    if (!input.hasScript(member))
      report(
        `${member}/package.json`,
        0,
        `成员有可执行验收，却没有 \`${ACCEPTANCE_SCRIPT}\` 脚本：这些验收不会被任何入口运行`,
      )
  return { violations, declarations }
}

function hasAcceptanceScript(root: string, member: string): boolean {
  const manifest = join(root, member, 'package.json')
  if (statSync(manifest, { throwIfNoEntry: false })?.isFile() !== true) return false
  const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as {
    scripts?: Record<string, unknown>
  }
  return typeof parsed.scripts?.[ACCEPTANCE_SCRIPT] === 'string'
}

/** 读仓库：找出全部验收、读产品区，核一遍。产品区不存在当作没有任何 topic。 */
export function inspectCoverage(
  root: string,
  productRoot: string,
  config: AcceptanceLockConfig,
): { readonly violations: Violation[]; readonly declarations: Declaration[] } {
  return judgeCoverage({
    files: listAcceptanceFiles(root, config).map(path => ({
      path,
      text: readFileSync(join(root, path), 'utf8'),
    })),
    topics: readProductTopics(join(root, productRoot)) ?? [],
    hasScript: member => hasAcceptanceScript(root, member),
    config,
  })
}
