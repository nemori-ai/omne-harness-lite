// The registered contract baseline of a milestone: the `json omne-contract-baseline:v1` blocks in
// the comments of its baseline card, merged by comment time. This module only reads GitHub.
//
// The block format belongs to `omne-contract-api` in @omne-harness/repo-toolchain
// (src/declarations/api-baseline.ts). The pinned 0.0.15 does not export it yet, so this module
// validates the same v1 shape. Replace the copy with the package import when the pin moves to a
// version that has it.
import { REST_HEADERS, type GhRead } from './github-read.ts'
import { array, InputError, record, text } from './protocol.ts'

export const BASELINE_MARKER = 'omne-contract-baseline:v1'
const TIMEOUT_MS = 15_000
const PAGE_LIMIT = 20

/** The baseline of one contract member. */
export type BaselineMember = { path: string; commit: string; sha256: string; apiTree: string }
export type ContractBaseline = {
  milestone: string | null
  /** Sorted by `path`; each `path` once. */
  members: BaselineMember[]
  breakingCards?: string[]
}
/** One comment of the baseline card. `id` orders comments that share a creation time. */
export type BaselineComment = { id: number; url: string; createdAt: string; body: string }

export const baselineProblemCodes = [
  'baseline-missing',
  'baseline-duplicate',
  'baseline-invalid',
  'baseline-milestone-mismatch',
] as const
export type BaselineProblemCode = (typeof baselineProblemCodes)[number]
/** One defect of the registrations. `comment` is null when no comment holds the defect. */
export type BaselineProblem = {
  code: BaselineProblemCode
  comment: string | null
  message: string
}
/** One comment that registers members, oldest first. */
export type Registration = { url: string; createdAt: string; members: string[] }
export type BaselineRead =
  | { kind: 'merged'; baseline: ContractBaseline; registrations: Registration[] }
  | { kind: 'refused'; problems: BaselineProblem[] }

class FormatError extends Error {}
function fail(message: string): never {
  throw new FormatError(message)
}
const OBJECT_ID = /^[0-9a-f]{40}$/u
const SHA256 = /^[0-9a-f]{64}$/u

function keys(value: unknown, where: string, allowed: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${where} 须为对象`)
  const extra = Object.keys(value).filter(key => !allowed.includes(key))
  if (extra.length > 0) fail(`${where} 有认不出的键 ${extra.join('、')}`)
  return value as Record<string, unknown>
}
function nonEmpty(value: unknown, where: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || value === '') fail(`${where} 须为非空字符串`)
  if (pattern !== undefined && !pattern.test(value)) fail(`${where} 的格式不对：${value}`)
  return value
}
function relativePath(value: unknown, where: string): string {
  const path = nonEmpty(value, where)
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some(part => part === '' || part === '.' || part === '..')
  )
    fail(`${where} 须为仓库相对路径：${path}`)
  return path
}
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Validates the JSON value of one block, the v1 shape of `omne-contract-api`. */
function parseBaseline(value: unknown): ContractBaseline {
  const raw = keys(value, '区块', ['milestone', 'members', 'breakingCards'])
  if (!('milestone' in raw)) fail('缺 milestone（没有里程碑时写 null）')
  const milestone = raw.milestone === null ? null : nonEmpty(raw.milestone, 'milestone')
  if (!Array.isArray(raw.members) || raw.members.length === 0) fail('members 须为非空数组')
  const members = raw.members.map((item: unknown, index: number): BaselineMember => {
    const where = `members[${index}]`,
      m = keys(item, where, ['path', 'commit', 'sha256', 'apiTree'])
    return {
      path: relativePath(m.path, `${where}.path`),
      commit: nonEmpty(m.commit, `${where}.commit`, OBJECT_ID),
      sha256: nonEmpty(m.sha256, `${where}.sha256`, SHA256),
      apiTree: nonEmpty(m.apiTree, `${where}.apiTree`, OBJECT_ID),
    }
  })
  const paths = members.map(item => item.path),
    repeated = paths.find((path, index) => paths.indexOf(path) !== index)
  if (repeated !== undefined) fail(`成员 ${repeated} 出现两次`)
  members.sort((a, b) => byCodeUnit(a.path, b.path))
  if (!('breakingCards' in raw)) return { milestone, members }
  if (!Array.isArray(raw.breakingCards)) fail('breakingCards 须为数组')
  const cards = raw.breakingCards.map((card: unknown, index: number) =>
    nonEmpty(card, `breakingCards[${index}]`),
  )
  if (new Set(cards).size !== cards.length) fail('breakingCards 有重复项')
  return { milestone, members, breakingCards: cards }
}

const FENCE = new RegExp(`^\`\`\`json ${BASELINE_MARKER}\\s*$`, 'u')
/** The text inside each block of `body`, in order. An unterminated block is a format error. */
function blocksOf(body: string): string[] {
  const lines = body.split(/\r?\n/u),
    blocks: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    if (!FENCE.test(lines[index] ?? '')) continue
    const end = lines.findIndex((line, at) => at > index && line.trim() === '```')
    if (end < 0) fail('区块没有结束的 ```')
    blocks.push(lines.slice(index + 1, end).join('\n'))
    index = end
  }
  return blocks
}
function parseJson(input: string): unknown {
  try {
    return JSON.parse(input)
  } catch (error) {
    return fail(`不是 JSON：${error instanceof Error ? error.message : String(error)}`)
  }
}
/**
 * Reads a baseline the way `omne-contract-api --baseline` does: text that is a JSON object, or
 * text with exactly one block. Throws `InputError` on any other text.
 */
export function parseBaselineText(input: string): ContractBaseline {
  try {
    const trimmed = input.trim()
    if (trimmed.startsWith('{')) return parseBaseline(parseJson(trimmed))
    const blocks = blocksOf(input)
    if (blocks.length !== 1) fail(`须恰好有一个 ${BASELINE_MARKER} 区块，找到 ${blocks.length} 个`)
    return parseBaseline(parseJson(blocks[0] ?? ''))
  } catch (error) {
    if (error instanceof FormatError) throw new InputError(`基线区块不合格：${error.message}`)
    throw error
  }
}
/** The block for a comment or a file; fixed key order, members sorted by `path`. */
export function renderBaselineBlock(baseline: ContractBaseline): string {
  const ordered = {
    milestone: baseline.milestone,
    members: [...baseline.members]
      .sort((a, b) => byCodeUnit(a.path, b.path))
      .map(({ path, commit, sha256, apiTree }) => ({ path, commit, sha256, apiTree })),
    ...(baseline.breakingCards === undefined ? {} : { breakingCards: baseline.breakingCards }),
  }
  return `\`\`\`json ${BASELINE_MARKER}\n${JSON.stringify(ordered, null, 2)}\n\`\`\`\n`
}

/** The one block of a comment, null without a block, or the problem of the comment. */
function registrationOf(comment: BaselineComment): ContractBaseline | null | BaselineProblem {
  const problem = (code: BaselineProblemCode, message: string): BaselineProblem => ({
    code,
    comment: comment.url,
    message,
  })
  try {
    const blocks = blocksOf(comment.body)
    if (blocks.length === 0) return null
    if (blocks.length > 1)
      return problem(
        'baseline-duplicate',
        `评论有 ${blocks.length} 个 ${BASELINE_MARKER} 区块，一条登记评论只能有一个。`,
      )
    return parseBaseline(parseJson(blocks[0] ?? ''))
  } catch (error) {
    if (error instanceof FormatError)
      return problem('baseline-invalid', `基线区块不合格：${error.message}`)
    throw error
  }
}
function isProblem(value: ContractBaseline | BaselineProblem): value is BaselineProblem {
  return 'code' in value
}

/**
 * Merges the registrations of a baseline card, oldest comment first (creation time, then id):
 *
 * - The first block is the registration of the milestone. A later block is a supplement with
 *   the same milestone. It can name a member that no earlier block has: a contract member added
 *   after the baseline gets its first snapshot this way.
 * - The latest block that names a member gives its baseline.
 * - `breakingCards` collects the cards of every block once, in the order of first appearance.
 *
 * Any defect refuses the whole read with every problem found.
 */
export function mergeRegistrations(comments: readonly BaselineComment[]): BaselineRead {
  const ordered = [...comments].sort((a, b) => byCodeUnit(a.createdAt, b.createdAt) || a.id - b.id)
  const problems: BaselineProblem[] = [],
    registrations: Registration[] = [],
    members = new Map<string, BaselineMember>(),
    cards: string[] = []
  let milestone: string | null | undefined
  for (const comment of ordered) {
    const read = registrationOf(comment)
    if (read === null) continue
    if (isProblem(read)) {
      problems.push(read)
      continue
    }
    if (milestone === undefined) milestone = read.milestone
    else if (read.milestone !== milestone)
      problems.push({
        code: 'baseline-milestone-mismatch',
        comment: comment.url,
        message: `补登记的 milestone 为 ${JSON.stringify(read.milestone)}，首次登记为 ${JSON.stringify(milestone)}。用 omne-contract-api --baseline-write 加 --milestone 重新生成区块。`,
      })
    for (const item of read.members) members.set(item.path, item)
    for (const card of read.breakingCards ?? []) if (!cards.includes(card)) cards.push(card)
    registrations.push({
      url: comment.url,
      createdAt: comment.createdAt,
      members: read.members.map(item => item.path),
    })
  }
  if (registrations.length === 0 && problems.length === 0)
    problems.push({
      code: 'baseline-missing',
      comment: null,
      message: `卡的评论里没有 ${BASELINE_MARKER} 区块。用 omne-contract-api --baseline-write 生成区块，贴进登记评论。`,
    })
  if (problems.length > 0 || milestone === undefined) return { kind: 'refused', problems }
  return {
    kind: 'merged',
    baseline: {
      milestone,
      members: [...members.values()].sort((a, b) => byCodeUnit(a.path, b.path)),
      ...(cards.length === 0 ? {} : { breakingCards: cards }),
    },
    registrations,
  }
}

function parseComment(value: unknown, index: number): BaselineComment {
  const c = record(value, `comments[${index}]`),
    id = c.id
  if (typeof id !== 'number' || !Number.isSafeInteger(id))
    throw new InputError(`comments[${index}].id must be an integer`)
  return {
    id,
    url: text(c.html_url, `comments[${index}].html_url`),
    createdAt: text(c.created_at, `comments[${index}].created_at`),
    body: c.body === null ? '' : text(c.body, `comments[${index}].body`),
  }
}
/** Every comment of `repository#issue` through REST GET, 100 to a page, at most 20 pages. */
export function readComments(repository: string, issue: number, call: GhRead): BaselineComment[] {
  const path = `repos/${repository}/issues/${issue}/comments`,
    items: unknown[] = []
  for (let page = 1; page <= PAGE_LIMIT; page += 1) {
    const result = array(
      call(
        ['api', '--method', 'GET', ...REST_HEADERS, `${path}?per_page=100&page=${page}`],
        TIMEOUT_MS,
      ),
      path,
    )
    items.push(...result)
    if (result.length < 100) return items.map(parseComment)
  }
  throw new InputError(`Page limit reached at ${path}`)
}
/** Reads the comments of the baseline card and merges its registrations. */
export function readBaseline({
  repository,
  issue,
  call,
}: {
  repository: string
  issue: number
  call: GhRead
}): BaselineRead {
  return mergeRegistrations(readComments(repository, issue, call))
}
