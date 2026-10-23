import {
  judgeAttributes,
  type CardAttributes,
  type ContractChange,
} from '../delivery/attributes.ts'
import { bodySections } from '../delivery/body.ts'
import { INTEGRATION_LINE, targetTrack, type DeliveryLines } from '../delivery/lines.ts'
import type { Policy, Track } from './policy.ts'

/**
 * The promotion PR sections of docs/engineering/integration.md「进轨道 PR 的说明」. The card line
 * format is copied from `gate/README.md`「提升 PR 的说明」 on `github-gate`, which owns it.
 */
export const CARDS_SECTION = '所含的卡'
export const CONTRACTS_SECTION = '契约变化'
const CARD_LINE = /^- #([1-9]\d*) revision ([1-9]\d*) attempt `([^`\s]+)`：(\S.*)$/
/** A card line with the right facts and a wrong separator; it is reported and still counted. */
const LOOSE_CARD_LINE =
  /^[-*]\s+#([1-9]\d*)\s+revision\s+([1-9]\d*)\s*[/，,]?\s*attempt\s+`([^`\s]+)`\s*[：:，,。；;]?\s*(.*)$/
/** A member path may be written as Markdown code. */
const CONTRACT_LINE = /^- (`?)([^\s：`]+)\1：(none|additive|breaking)(?:[。；，,;\s]\s*(.*))?$/
const ISSUE_BRANCH = /(?:^|\/)issue-([1-9]\d*)(?:-|$)/
const levels = ['none', 'additive', 'breaking'] as const satisfies readonly ContractChange[]
type Level = ContractChange
function rank(level: Level): number {
  return levels.indexOf(level)
}

/** One card line of「所含的卡」. */
export type CardDeclaration = {
  issue: number
  revision: number
  attempt: string
  condition: string
}
/** One member line of「契约变化」. */
export type ContractEntry = { path: string; level: Level; note: string }
/** A list line that does not match the format; `counted` when its facts were still read. */
export type InvalidLine = { line: string; counted: boolean }
/**
 * A section as declared: absent, without any list line, or its list lines. Prose lines are
 * commentary and do not count.
 */
type Declared<T> =
  | { kind: 'absent' }
  | { kind: 'empty' }
  | { kind: 'present'; entries: T[]; invalid: InvalidLine[] }
export type PullSections = {
  cards: Declared<CardDeclaration>
  /** `none` is the literal「无」: the PR changes no contract member. */
  contracts: Declared<ContractEntry> | { kind: 'none' }
}

function sectionLines(body: string, name: string): string[] | undefined {
  const found = bodySections(body).get(name)
  if (found === undefined) return undefined
  const lines = found
    .join('\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/\r?\n/)
    .map(line => line.trim())
  // A thematic break ends the section, such as the footer a host appends to the last one.
  const end = lines.findIndex(line => /^(?:-{3,}|\*{3,}|_{3,})$/.test(line))
  return (end === -1 ? lines : lines.slice(0, end)).filter(line => line !== '')
}
/** A parsed list line: exact, read despite a format defect, or unreadable. */
type Parsed<T> = { kind: 'exact'; entry: T } | { kind: 'loose'; entry: T } | { kind: 'invalid' }
function declared<T>(lines: string[] | undefined, parse: (line: string) => Parsed<T>) {
  if (lines === undefined) return { kind: 'absent' } as const
  const items = lines.filter(line => /^[-*]\s/.test(line))
  if (items.length === 0) return { kind: 'empty' } as const
  const entries: T[] = [],
    invalid: InvalidLine[] = []
  for (const line of items) {
    const parsed = parse(line)
    if (parsed.kind !== 'invalid') entries.push(parsed.entry)
    if (parsed.kind !== 'exact') invalid.push({ line, counted: parsed.kind === 'loose' })
  }
  return { kind: 'present', entries, invalid } as const
}
function cardOf(match: RegExpExecArray | null): CardDeclaration | undefined {
  const [, issue, revision, attempt, condition] = match ?? []
  if (issue === undefined || revision === undefined || attempt === undefined) return undefined
  return {
    issue: Number(issue),
    revision: Number(revision),
    attempt,
    condition: (condition ?? '').trim(),
  }
}
/** Reads one card line; the condition of a loose line may be empty. */
export function parseCardLine(line: string): Parsed<CardDeclaration> {
  const exact = cardOf(CARD_LINE.exec(line))
  if (exact !== undefined) return { kind: 'exact', entry: exact }
  const loose = cardOf(LOOSE_CARD_LINE.exec(line))
  return loose === undefined ? { kind: 'invalid' } : { kind: 'loose', entry: loose }
}
function parseContractLine(line: string): Parsed<ContractEntry> {
  const match = CONTRACT_LINE.exec(line)
  const level = levels.find(item => item === match?.[3])
  if (match?.[2] === undefined || level === undefined) return { kind: 'invalid' }
  return { kind: 'exact', entry: { path: match[2], level, note: (match[4] ?? '').trim() } }
}
/** Reads the two sections of a PR body. HTML comments, such as template hints, do not count. */
export function parsePullSections(body: string): PullSections {
  const contracts = sectionLines(body, CONTRACTS_SECTION)
  return {
    cards: declared(sectionLines(body, CARDS_SECTION), parseCardLine),
    contracts:
      contracts?.length === 1 && contracts[0] === '无'
        ? { kind: 'none' }
        : declared(contracts, parseContractLine),
  }
}
/** One card line in the exact gate README format. */
export function formatCardLine(card: CardDeclaration): string {
  return `- #${card.issue} revision ${card.revision} attempt \`${card.attempt}\`：${card.condition}`
}

/** A `omne-gate-record:v1` unit record, reduced to the fields this report reads. */
export type UnitRecord = { target: string; result: string; pr: number | null }
/** A first-parent commit of the source track that the parent does not contain. */
export type TrackCommit = {
  commit: string
  subject: string
  /** `before-lower-bound` commits precede the gate's coverage check and need no unit. */
  coverage: 'checked' | 'before-lower-bound'
  unit:
    | { kind: 'found'; record: UnitRecord }
    | { kind: 'missing' }
    | { kind: 'invalid'; reason: string }
}
export type PullFact = {
  number: number
  url: string
  headRef: string
  baseRef: string
  body: string
}
export type PullRead = { kind: 'read'; pull: PullFact } | { kind: 'unreadable'; reason: string }
export type CardFact = {
  url: string
  attributes: CardAttributes
  /** Revision and attempt of the body's binding, or undefined without a readable binding. */
  binding: { revision: number; attempt: string } | undefined
}
export type CardRead = { kind: 'read'; card: CardFact } | { kind: 'unreadable'; reason: string }
/**
 * The P1-2 contract snapshot difference between two commits, by contract member path. P1-2
 * classifies each member as none, additive or review. `unavailable` until P1-2 is wired.
 */
export type ContractDiff =
  | { kind: 'unavailable'; reason: string }
  | {
      kind: 'available'
      base: string
      head: string
      members: { path: string; level: 'none' | 'additive' | 'review' }[]
    }

export type FindingCode =
  | 'lower-bound-unknown'
  | 'unit-missing'
  | 'unit-invalid'
  | 'unit-target-mismatch'
  | 'pr-unreadable'
  | 'pr-base-mismatch'
  | 'pr-section-missing'
  | 'cards-line-invalid'
  | 'cards-empty'
  | 'contract-line-invalid'
  | 'contract-path-unknown'
  | 'contract-level-exceeds-card'
  | 'contract-breaking-off-integration'
  | 'contract-diff-mismatch'
  | 'card-inferred'
  | 'card-unresolved'
  | 'card-unreadable'
  | 'card-line-unknown'
  | 'card-other-line'
/** A report-only finding. `at` locates it: a commit, a PR, a card or a contract member. */
export type RiFinding = {
  severity: 'report'
  code: FindingCode
  at: { commit?: string; pr?: string; issue?: string; section?: string; path?: string }
  message: string
}
export type PullKind = 'work' | 'sync' | 'promote'
export type RiCommit = {
  commit: string
  subject: string
  coverage: TrackCommit['coverage']
  unit: TrackCommit['unit']['kind']
  pr: { number: number; url?: string; kind?: PullKind; source: 'unit' | 'subject' } | null
}
export type RiCard = CardDeclaration & {
  url: string
  /** True when no PR declared the card and it was taken from a branch name and the binding. */
  inferred: boolean
  /** PR numbers that declared or implied this card, oldest first. */
  pulls: number[]
  line: string | null
  nature: string | null
  contractChange: string | null
}
export type RiContract = { path: string; level: Level; notes: { pr: number; note: string }[] }
export type RiNotes = {
  track: { id: string; branch: string; head: string }
  parent: { name: string; branch: string; head: string }
  lowerBound: { commit: string; source: 'cutover' | 'start-tag' } | null
  commits: RiCommit[]
  cards: RiCard[]
  contracts: RiContract[]
  contractCheck:
    | { status: 'unavailable'; reason: string }
    | { status: 'checked'; base: string; head: string }
  findings: RiFinding[]
  markdown: string
}
export type RiInput = {
  repository: string
  track: Track
  parent: { name: string; branch: string; head: string }
  head: string
  lowerBound: RiNotes['lowerBound']
  /** Oldest first. */
  commits: readonly TrackCommit[]
  lines: DeliveryLines
  registry: Pick<Policy, 'tracks'>
  readPull: (number: number) => PullRead
  readCard: (number: number) => CardRead
  contractDiff: ContractDiff
}

function pullOf(commit: TrackCommit): RiCommit['pr'] {
  if (commit.unit.kind === 'found')
    return commit.unit.record.pr === null ? null : { number: commit.unit.record.pr, source: 'unit' }
  const match = /^Merge pull request #([1-9]\d*) from /.exec(commit.subject)
  return match?.[1] === undefined ? null : { number: Number(match[1]), source: 'subject' }
}
function pullKind(head: string, input: RiInput): PullKind {
  if (head === input.parent.branch) return 'sync'
  const child = input.registry.tracks.find(track => track.branch === head)
  return child !== undefined && child.parent === input.track.id ? 'promote' : 'work'
}
/** The source track and every registered track below it. */
function subtree(input: RiInput): Set<string> {
  const ids = new Set([input.track.id])
  for (let grew = true; grew;) {
    grew = false
    for (const track of input.registry.tracks)
      if (!ids.has(track.id) && ids.has(track.parent)) {
        ids.add(track.id)
        grew = true
      }
  }
  return ids
}

type Pending = { declaration: CardDeclaration; inferred: boolean; pulls: number[] }

/**
 * Builds the promotion PR sections for one track from its first-parent commits, their unit
 * records and the PRs they name. It only reports: every defect becomes a finding.
 */
export function riNotes(input: RiInput): RiNotes {
  const findings: RiFinding[] = [],
    report = (code: FindingCode, at: RiFinding['at'], message: string) =>
      findings.push({ severity: 'report', code, at, message })
  const pullUrl = (n: number) => `https://github.com/${input.repository}/pull/${n}`,
    issueUrl = (n: number) => `https://github.com/${input.repository}/issues/${n}`
  if (input.lowerBound === null)
    report(
      'lower-bound-unknown',
      {},
      `轨道 ${input.track.branch} 在 gate/cutover.json 中没有切换点，也没有起点标签；按全部提交核对 unit。`,
    )
  const cards = new Map<number, Pending>(),
    cardReads = new Map<number, CardRead>(),
    readCard = (n: number) => {
      let read = cardReads.get(n)
      if (read === undefined) {
        read = input.readCard(n)
        cardReads.set(n, read)
      }
      return read
    }
  const declaredBy = new Map<number, CardDeclaration[]>(),
    contractsBy: { pr: number; entries: ContractEntry[] }[] = []
  const commits = input.commits.map((commit): RiCommit => {
    const at = { commit: commit.commit }
    if (commit.coverage === 'checked') {
      if (commit.unit.kind === 'missing')
        report(
          'unit-missing',
          at,
          `first-parent 提交 ${commit.commit}（${commit.subject}）没有 unit 记录。`,
        )
      else if (commit.unit.kind === 'invalid')
        report(
          'unit-invalid',
          at,
          `提交 ${commit.commit} 的 unit 记录不可读：${commit.unit.reason}`,
        )
    }
    if (commit.unit.kind === 'found') {
      const { record } = commit.unit
      if (record.target !== `refs/heads/${input.track.branch}` || record.result !== commit.commit)
        report(
          'unit-target-mismatch',
          at,
          `unit 记录的目标为 ${record.target}、结果为 ${record.result}，应为 refs/heads/${input.track.branch} 与 ${commit.commit}。`,
        )
      if (record.pr === null)
        report('unit-invalid', at, `提交 ${commit.commit} 的 unit 记录没有 pr。`)
    }
    const listed = {
      commit: commit.commit,
      subject: commit.subject,
      coverage: commit.coverage,
      unit: commit.unit.kind,
    }
    const pr = pullOf(commit)
    if (pr === null) return { ...listed, pr }
    const read = input.readPull(pr.number),
      prAt = { commit: commit.commit, pr: pullUrl(pr.number) }
    if (read.kind === 'unreadable') {
      report('pr-unreadable', prAt, `读不到 PR #${pr.number}：${read.reason}`)
      return { ...listed, pr }
    }
    const pull = read.pull,
      kind = pullKind(pull.headRef, input)
    if (pull.baseRef !== input.track.branch)
      report(
        'pr-base-mismatch',
        prAt,
        `PR #${pull.number} 的 base 为 ${pull.baseRef}，不是 ${input.track.branch}。`,
      )
    if (kind !== 'sync') collectPull(pull, prAt)
    return { ...listed, pr: { ...pr, url: pull.url, kind } }
  })

  function collectPull(pull: PullFact, at: RiFinding['at']): void {
    const sections = parsePullSections(pull.body)
    const missing = (section: string, empty: boolean) =>
      report(
        'pr-section-missing',
        { ...at, section },
        empty
          ? `PR #${pull.number} 的「${section}」没有列表行。`
          : `PR #${pull.number} 没有声明「${section}」。`,
      )
    if (sections.cards.kind === 'present') {
      for (const { line, counted } of sections.cards.invalid)
        report(
          'cards-line-invalid',
          { ...at, section: CARDS_SECTION },
          `PR #${pull.number}「${CARDS_SECTION}」的行不符合 gate README 的格式${counted ? '，已按其中的编号、修订与 attempt 计入' : '，未计入'}：${line}`,
        )
      const entries = sections.cards.entries.map(entry =>
        entry.condition === ''
          ? { ...entry, condition: `待确认（PR #${pull.number} 的行没有写条件）` }
          : entry,
      )
      declaredBy.set(pull.number, entries)
      for (const declaration of entries) {
        const current = cards.get(declaration.issue)
        // A later PR at the same or a newer revision carries the latest attempt.
        if (
          current === undefined ||
          current.inferred ||
          declaration.revision >= current.declaration.revision
        )
          cards.set(declaration.issue, {
            declaration,
            inferred: false,
            pulls: [...(current?.pulls ?? []), pull.number],
          })
        else current.pulls.push(pull.number)
      }
      // No line could be read: the card is unknown, as if the section were missing.
      if (entries.length === 0) inferCard(pull, at)
    } else {
      missing(CARDS_SECTION, sections.cards.kind === 'empty')
      inferCard(pull, at)
    }
    if (sections.contracts.kind === 'absent' || sections.contracts.kind === 'empty')
      missing(CONTRACTS_SECTION, sections.contracts.kind === 'empty')
    else if (sections.contracts.kind === 'present') {
      for (const { line } of sections.contracts.invalid)
        report(
          'contract-line-invalid',
          { ...at, section: CONTRACTS_SECTION },
          `PR #${pull.number}「${CONTRACTS_SECTION}」的行不符合「- <路径>：none、additive 或 breaking」：${line}`,
        )
      contractsBy.push({ pr: pull.number, entries: sections.contracts.entries })
    }
  }
  function inferCard(pull: PullFact, at: RiFinding['at']): void {
    const number = Number(ISSUE_BRANCH.exec(pull.headRef)?.[1] ?? Number.NaN)
    if (!Number.isSafeInteger(number)) {
      report(
        'card-unresolved',
        at,
        `PR #${pull.number} 的分支 ${pull.headRef} 不含 issue-<N>，推测不出卡。`,
      )
      return
    }
    if (cards.get(number)?.inferred === false) {
      cards.get(number)?.pulls.push(pull.number)
      return
    }
    const read = readCard(number),
      binding = read.kind === 'read' ? read.card.binding : undefined
    if (binding === undefined) {
      report(
        'card-unresolved',
        { ...at, issue: issueUrl(number) },
        `PR #${pull.number} 按分支 ${pull.headRef} 推测为 #${number}，但读不到该卡 binding 的修订与 attempt，须手工补行。`,
      )
      return
    }
    const previous = cards.get(number)
    cards.set(number, {
      declaration: {
        issue: number,
        revision: binding.revision,
        attempt: binding.attempt,
        condition: `待确认（PR #${pull.number} 未声明，按分支推测）`,
      },
      inferred: true,
      pulls: [...(previous?.pulls ?? []), pull.number],
    })
  }

  const area = subtree(input)
  const riCards = [...cards.values()]
    .sort((a, b) => a.declaration.issue - b.declaration.issue)
    .map(({ declaration, inferred, pulls }): RiCard => {
      const url = issueUrl(declaration.issue),
        at = { issue: url }
      if (inferred)
        report(
          'card-inferred',
          at,
          `#${declaration.issue} 由 PR ${pulls.map(n => `#${n}`).join('、')} 的分支名推测，修订与 attempt 取自卡的当前 binding，条件待确认。`,
        )
      const read = readCard(declaration.issue)
      const base = {
        ...declaration,
        url,
        inferred,
        pulls,
        line: null,
        nature: null,
        contractChange: null,
      }
      if (read.kind === 'unreadable') {
        report('card-unreadable', at, `读不到 #${declaration.issue}：${read.reason}`)
        return base
      }
      const { attributes } = judgeAttributes(read.card.attributes, input.lines)
      const card = {
        ...base,
        line: attributes.line ?? null,
        nature: attributes.nature ?? null,
        contractChange: attributes.contractChange ?? null,
      }
      if (attributes.line === undefined)
        report(
          'card-line-unknown',
          at,
          `#${declaration.issue} 的「身份与责任」没有合法的交付线，不能核对归属。`,
        )
      else if (attributes.line !== INTEGRATION_LINE) {
        const target = targetTrack(input.lines, attributes.line)
        if (!area.has(target))
          report(
            'card-other-line',
            at,
            `#${declaration.issue} 属于线 ${attributes.line}，应进入轨道 ${target}，不在 ${input.track.branch} 或其子轨道中。`,
          )
      }
      return card
    })

  const contractPaths = new Set(input.lines.lines.flatMap(line => line.contracts)),
    cardChange = new Map(riCards.map(card => [card.issue, card.contractChange]))
  const merged = new Map<string, RiContract>()
  for (const { pr, entries } of contractsBy) {
    const at = { pr: pullUrl(pr), section: CONTRACTS_SECTION }
    const changes = (declaredBy.get(pr) ?? []).map(card => cardChange.get(card.issue) ?? null)
    const ceiling = changes.every(change => levels.some(level => level === change))
      ? Math.max(-1, ...changes.map(change => levels.findIndex(level => level === change)))
      : undefined
    for (const entry of entries) {
      const entryAt = { ...at, path: entry.path }
      if (!contractPaths.has(entry.path))
        report(
          'contract-path-unknown',
          entryAt,
          `PR #${pr} 列出的 ${entry.path} 不是线归属表 contracts 中的契约成员。`,
        )
      if (ceiling !== undefined && ceiling >= 0 && rank(entry.level) > ceiling)
        report(
          'contract-level-exceeds-card',
          entryAt,
          `PR #${pr} 对 ${entry.path} 声明 ${entry.level}，高于所含卡的契约变更 ${levels[ceiling]}。`,
        )
      if (entry.level === 'breaking' && input.track.id !== input.lines.integration.track)
        report(
          'contract-breaking-off-integration',
          entryAt,
          `breaking 只出现在进入联调轨道或 main 的 PR 中，PR #${pr} 进入 ${input.track.branch}。`,
        )
      const current = merged.get(entry.path) ?? { path: entry.path, level: 'none', notes: [] }
      if (rank(entry.level) > rank(current.level)) current.level = entry.level
      if (entry.note !== '') current.notes.push({ pr, note: entry.note })
      merged.set(entry.path, current)
    }
  }
  const contracts = [...merged.values()].sort((a, b) => a.path.localeCompare(b.path))
  const contractCheck = checkContracts(input.contractDiff, contracts, report)
  if (riCards.length === 0)
    report(
      'cards-empty',
      { section: CARDS_SECTION },
      `自上次提升以来进入 ${input.track.branch} 的 PR 没有可列出的卡。`,
    )
  return {
    track: { id: input.track.id, branch: input.track.branch, head: input.head },
    parent: input.parent,
    lowerBound: input.lowerBound,
    commits,
    cards: riCards,
    contracts,
    contractCheck,
    findings,
    markdown: renderMarkdown(riCards, contracts),
  }
}

/**
 * C4 seam: compares the aggregated declarations with the P1-2 snapshot difference. P1-2 does not
 * decide direction, so `review` matches a declared `breaking` and nothing lower.
 */
function checkContracts(
  diff: ContractDiff,
  declared: readonly RiContract[],
  report: (code: FindingCode, at: RiFinding['at'], message: string) => void,
): RiNotes['contractCheck'] {
  if (diff.kind === 'unavailable') return { status: 'unavailable', reason: diff.reason }
  const expected = { none: 'none', additive: 'additive', review: 'breaking' } as const
  const paths = new Set([
    ...declared.map(item => item.path),
    ...diff.members.map(item => item.path),
  ])
  for (const path of [...paths].sort()) {
    const observed = diff.members.find(item => item.path === path)?.level ?? 'none',
      written = declared.find(item => item.path === path)?.level ?? 'none'
    if (expected[observed] !== written)
      report(
        'contract-diff-mismatch',
        { section: CONTRACTS_SECTION, path },
        `快照差异把 ${path} 分为 ${observed}，PR 声明汇总为 ${written}。`,
      )
  }
  return { status: 'checked', base: diff.base, head: diff.head }
}

function renderMarkdown(cards: readonly RiCard[], contracts: readonly RiContract[]): string {
  const contractLines = contracts.map(item => {
    const notes = item.notes.map(({ pr, note }) => `#${pr}：${note}`).join('；')
    return `- ${item.path}：${item.level}${notes === '' ? '' : `。${notes}`}`
  })
  return [
    `## ${CARDS_SECTION}`,
    '',
    ...cards.map(formatCardLine),
    '',
    `## ${CONTRACTS_SECTION}`,
    '',
    ...(contractLines.length === 0 ? ['无'] : contractLines),
    '',
  ].join('\n')
}
