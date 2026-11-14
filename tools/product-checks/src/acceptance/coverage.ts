import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { isLegacyDirectory } from '@omne-harness/repo-toolchain/core/check-scope'
import type { Violation } from '@omne-harness/repo-toolchain/core/rule'
import {
  readProductTopics,
  SCENARIO_ID,
  type ProductTopic,
} from '@omne-harness/repo-toolchain/product/scenarios'
import type { RunScript } from '@omne-harness/repo-toolchain/core/test-ledger'
import {
  isAcceptancePath,
  type AcceptanceLockConfig,
} from '@omne-harness/repo-toolchain/acceptance/lock'

export const ACCEPTANCE_COVERS_RULE = 'acceptance-covers'
export const ACCEPTANCE_SCRIPT: RunScript = 'acceptance'

const SUFFIX = '.acceptance.ts'
const COVERS = /^\s*\/\/\s*covers\s*:(.*)$/u
const ITEM = /^(PD-[a-z][a-z0-9]*(?:-[a-z0-9]+)*)\s+(\S+)$/u
const FILE_TOPIC = /^(PD-[a-z][a-z0-9]*(?:-[a-z0-9]+)*)\./u
const SKIP = new Set(['node_modules', 'dist', '.git'])

export interface AcceptanceFile {
  readonly path: string
  readonly text: string
}

export interface CoveredScenario {
  readonly topic: string
  readonly id: string
}

export interface Declaration {
  readonly path: string
  readonly covers: readonly CoveredScenario[]
}

export function memberOfAcceptance(path: string, config: AcceptanceLockConfig): string {
  const segments = path.split('/')
  return segments.slice(0, segments.indexOf(config.directory, 1)).join('/')
}

export function listAcceptanceFiles(root: string, config: AcceptanceLockConfig): string[] {
  const found: string[] = []
  const walk = (relative: string): void => {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue
      const path = `${relative}/${entry.name}`
      if (entry.isDirectory()) {
        if (!isLegacyDirectory(path)) walk(path)
      } else if (entry.name.endsWith(SUFFIX) && isAcceptancePath(path, config)) found.push(path)
    }
  }
  for (const memberRoot of config.memberRoots)
    if (
      !isLegacyDirectory(memberRoot) &&
      statSync(join(root, memberRoot), { throwIfNoEntry: false })?.isDirectory() === true
    )
      walk(memberRoot)
  return found.sort()
}

type Problem = { readonly line: number; readonly message: string }

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
        '开头的注释块里缺覆盖声明：恰好一行 `// covers: PD-<slug> <场景编号>`，多条用逗号隔开',
    })
  else if (second !== undefined)
    problems.push({
      line: second.line,
      message: `开头的注释块里有 ${header.length} 行覆盖声明（第 ${header.map(entry => entry.line).join('、')} 行），只能有一行`,
    })
  return second === undefined && only !== undefined ? { declared: only, problems } : { problems }
}

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
          : `覆盖声明的「${item}」要写成 PD-<slug> <场景编号>（如 PD-cli S5）`,
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

function fileNameProblem(path: string, covers: readonly CoveredScenario[]): string | undefined {
  const named = FILE_TOPIC.exec(path.split('/').at(-1) ?? '')?.[1]
  if (named === undefined)
    return `文件名要以它覆盖的 topic 完整身份开头：PD-<slug>.<一句话>${SUFFIX}`
  if (covers.length === 0 || covers.some(scenario => scenario.topic === named)) return undefined
  const declared = [...new Set(covers.map(scenario => scenario.topic))].join('、')
  return `文件名的 ${named} 不在它声明覆盖的 topic 里（${declared}）`
}

export interface CoverageInput {
  readonly files: readonly AcceptanceFile[]
  readonly topics: readonly ProductTopic[]
  readonly hasScript: (member: string) => boolean
  readonly config: AcceptanceLockConfig
}

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

export function inspectCoverage(
  root: string,
  productRoot: string,
  config: AcceptanceLockConfig,
): {
  readonly violations: Violation[]
  readonly declarations: Declaration[]
  readonly topics: ProductTopic[]
} {
  const topics = readProductTopics(join(root, productRoot))
  return {
    topics,
    ...judgeCoverage({
      files: listAcceptanceFiles(root, config).map(path => ({
        path,
        text: readFileSync(join(root, path), 'utf8'),
      })),
      topics,
      hasScript: member => hasAcceptanceScript(root, member),
      config,
    }),
  }
}
