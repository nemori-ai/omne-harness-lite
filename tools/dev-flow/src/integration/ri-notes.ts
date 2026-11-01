import {
  judgeAttributes,
  type CardAttributes,
  type ContractChange,
  type Nature,
} from '../delivery/attributes.ts'
import { INTEGRATION_LINE, targetTrack, type DeliveryLines } from '../delivery/lines.ts'
import type { Policy, Track } from './policy.ts'
import {
  CARDS_SECTION,
  CONTRACTS_SECTION,
  formatCardLine,
  parsePullSections,
  type CardDeclaration,
  type ContractEntry,
  type PullSections,
  UNKNOWN_MARK,
} from './pr-sections.ts'

const RANK = { none: 0, additive: 1, breaking: 2 } as const satisfies Record<ContractChange, number>

/** An `omne-gate-record:v1` unit record, reduced to the fields this report reads. */
export type UnitRecord = { target: string; result: string; pr: number | null }
export type CommitUnit =
  | { kind: 'found'; record: UnitRecord }
  | { kind: 'missing' }
  | { kind: 'invalid'; reason: string }
/** A first-parent commit of the source track that its upstream does not contain. */
export type TrackCommit = {
  commit: string
  subject: string
  /** `before-lower-bound` commits precede the gate's coverage check and need no unit. */
  coverage: 'checked' | 'before-lower-bound'
  unit: CommitUnit
}
export type TrackParent = { name: string; branch: string; head: string }
export type LowerBound = {
  commit: string
  source: 'cutover' | 'start-tag'
  /** False when the lower bound is not an ancestor of the track head; the gate refuses then. */
  ancestor: boolean
}
/** The Git facts of one track; `ri-source.ts` reads them. */
export type TrackFacts = {
  track: Track
  head: string
  /** The trusted upstream, in the gate's order. */
  parent: TrackParent
  /** The registry `parent` of the track, a projection of the trusted upstream. */
  registryParent: string
  /** The merge base of the track head and the upstream head. */
  mergeBase: string
  lowerBound: LowerBound | null
  /** Oldest first. */
  commits: TrackCommit[]
}
export type PullFact = {
  number: number
  url: string
  headRef: string
  baseRef: string
  body: string
}
export type PullRead = { kind: 'read'; pull: PullFact } | { kind: 'unreadable'; reason: string }
export type CardBinding =
  | { kind: 'found'; revision: number; attempt: string }
  | { kind: 'absent' }
  | { kind: 'invalid'; reason: string }
export type CardFact = { url: string; attributes: CardAttributes; binding: CardBinding }
export type CardRead = { kind: 'read'; card: CardFact } | { kind: 'unreadable'; reason: string }
/** How a contract API snapshot changes for one member: no change, additions only, or other. */
export const SNAPSHOT_CHANGES = ['none', 'additive', 'review'] as const
export type SnapshotChange = (typeof SNAPSHOT_CHANGES)[number]
/** The declared level each snapshot change matches. `review` does not decide direction. */
const SNAPSHOT_MATCH = {
  none: 'none',
  additive: 'additive',
  review: 'breaking',
} as const satisfies Record<SnapshotChange, ContractChange>
/** The snapshot difference between two commits, by contract member path, or why there is none. */
export type ContractDiff =
  | { kind: 'unavailable'; reason: string }
  | { kind: 'available'; base: string; head: string; members: ReadonlyMap<string, SnapshotChange> }
export type DiffContracts = (range: { base: string; head: string }) => ContractDiff
/** Builds the snapshot difference for a checkout root, with the policy's timeout. */
export type ContractDiffProvider = (context: { root: string; timeoutMs: number }) => DiffContracts

/** Every finding code of `ri-notes`. */
export const findingCodes = [
  'parent-registry-drift',
  'lower-bound-unknown',
  'lower-bound-not-ancestor',
  'unit-missing',
  'unit-invalid',
  'unit-target-mismatch',
  'pr-unreadable',
  'pr-base-mismatch',
  'pr-section-missing',
  'cards-line-invalid',
  'cards-empty',
  'contract-line-invalid',
  'contract-path-unknown',
  'contract-level-exceeds-card',
  'contract-breaking-off-integration',
  'contracts-unknown',
  'contract-diff-stale',
  'contract-diff-mismatch',
  'card-inferred',
  'card-unresolved',
  'card-unreadable',
  'card-line-unknown',
  'card-other-line',
] as const
export type FindingCode = (typeof findingCodes)[number]
/**
 * The codes that make `ri-notes` exit 1: a declared contract change above the cards, a breaking
 * change off the integration track, and declarations that disagree with the snapshot difference.
 * The other codes only report. An unavailable snapshot difference gives no code.
 */
export const RI_REFUSING_CODES = [
  'contract-level-exceeds-card',
  'contract-breaking-off-integration',
  'contract-diff-mismatch',
] as const satisfies readonly FindingCode[]
/** 1 when any finding has a refusing code, otherwise 0. */
export function riNotesExitCode(notes: Pick<RiNotes, 'findings'>): 0 | 1 {
  const refusing: readonly FindingCode[] = RI_REFUSING_CODES
  return notes.findings.some(finding => refusing.includes(finding.code)) ? 1 : 0
}
/**
 * One finding. `at` locates it: a commit, a PR, a card, a section or a member. Its severity is
 * always `report`; `RI_REFUSING_CODES` decides the exit code of the command.
 */
export type RiFinding = {
  severity: 'report'
  code: FindingCode
  at: { commit?: string; pr?: string; issue?: string; section?: string; path?: string }
  message: string
}
export type PullKind = 'work' | 'sync' | 'promote'
/** Where a commit's PR number came from: its unit record or a merge commit subject. */
export type PullSource = 'unit' | 'subject'
export type CommitPull =
  | { kind: 'unreadable'; number: number; source: PullSource; reason: string }
  | { kind: PullKind; number: number; source: PullSource; url: string }
export type RiCommit = {
  commit: string
  subject: string
  coverage: TrackCommit['coverage']
  unit: CommitUnit['kind']
  pr: CommitPull | null
}
export type RiCard = CardDeclaration & {
  url: string
  /** True when no PR declared the card and it was taken from a branch name and the binding. */
  inferred: boolean
  /** PR numbers that declared or implied this card, oldest first. */
  pulls: number[]
  line: string | null
  nature: Nature | null
  contractChange: ContractChange | null
}
export type RiContract = {
  path: string
  level: ContractChange
  notes: { pr: number; note: string }[]
}
/** A commit whose contract changes are unknown, with the reason. */
export type ContractGap = { commit: string; pr: number | null; reason: string }
export type ContractCheck =
  | { kind: 'unavailable'; reason: string }
  | { kind: 'checked'; base: string; head: string }
export type RiNotes = {
  track: { id: string; branch: string; head: string }
  parent: TrackParent
  lowerBound: LowerBound | null
  commits: RiCommit[]
  cards: RiCard[]
  contracts: RiContract[]
  /** Empty only when every commit's contract changes are known. */
  contractGaps: ContractGap[]
  contractCheck: ContractCheck
  findings: RiFinding[]
  markdown: string
}
export type RiInput = TrackFacts & {
  repository: string
  lines: DeliveryLines
  registry: Pick<Policy, 'tracks'>
  readPull: (number: number) => PullRead
  readCard: (number: number) => CardRead
  diffContracts: DiffContracts
  /** The registry the input was read from; only the semantic review path reads it. */
  policy?: Policy
  /**
   * Set only by the semantic review path: the level each review member carries after a valid
   * conclusion, and the comment that holds it. A review member without an entry still needs a
   * breaking declaration.
   */
  semantic?: {
    levels: ReadonlyMap<string, 'additive' | 'breaking'>
    records: ReadonlyMap<string, string>
  }
}

function finding(code: FindingCode, at: RiFinding['at'], message: string): RiFinding {
  return { severity: 'report', code, at, message }
}
function pullUrl(input: RiInput, n: number): string {
  return `https://github.com/${input.repository}/pull/${n}`
}
function issueUrl(input: RiInput, n: number): string {
  return `https://github.com/${input.repository}/issues/${n}`
}

/** Findings about the range itself: its upstream and its lower bound. */
function rangeFindings(input: RiInput): RiFinding[] {
  const findings: RiFinding[] = []
  if (input.registryParent !== input.parent.name)
    findings.push(
      finding(
        'parent-registry-drift',
        {},
        `registry 登记 ${input.track.id} 的上游为 ${input.registryParent}，起点标签或切换点给出 ${input.parent.name}，范围按后者计算。`,
      ),
    )
  if (input.lowerBound === null)
    findings.push(
      finding(
        'lower-bound-unknown',
        {},
        `${input.track.branch} 在 gate/cutover.json 中没有切换点，也没有起点标签。全部提交都按有 unit 核对。`,
      ),
    )
  else if (!input.lowerBound.ancestor)
    findings.push(
      finding(
        'lower-bound-not-ancestor',
        { commit: input.lowerBound.commit },
        `核对下限 ${input.lowerBound.commit} 不是 ${input.track.branch} 头的祖先，gate 会拒绝这次提升。全部提交都按有 unit 核对。`,
      ),
    )
  return findings
}

/** Findings about one commit's unit record. */
function unitFindings(input: RiInput, commit: TrackCommit): RiFinding[] {
  const at = { commit: commit.commit },
    { unit } = commit
  if (unit.kind === 'missing')
    return commit.coverage === 'checked'
      ? [
          finding(
            'unit-missing',
            at,
            `first-parent 提交 ${commit.commit}（${commit.subject}）没有 unit 记录。`,
          ),
        ]
      : []
  if (unit.kind === 'invalid')
    return [finding('unit-invalid', at, `提交 ${commit.commit} 的 unit 记录不合格：${unit.reason}`)]
  const { record } = unit,
    findings: RiFinding[] = []
  if (record.target !== `refs/heads/${input.track.branch}` || record.result !== commit.commit)
    findings.push(
      finding(
        'unit-target-mismatch',
        at,
        `unit 记录的目标为 ${record.target}、结果为 ${record.result}，应为 refs/heads/${input.track.branch} 与 ${commit.commit}。`,
      ),
    )
  if (record.pr === null)
    findings.push(finding('unit-invalid', at, `提交 ${commit.commit} 的 unit 记录没有 pr。`))
  return findings
}

/** A read non-sync PR and the commit that brought it. */
type CarriedPull = { commit: string; pull: PullFact }
/** One commit's PR: read, classified and checked against the source track. */
type CommitPullRead = {
  pr: CommitPull | null
  carried: CarriedPull | undefined
  gap: ContractGap | undefined
  findings: RiFinding[]
}
function readCommitPull(input: RiInput, commit: TrackCommit): CommitPullRead {
  const number = pullNumber(commit)
  if (number === null)
    return {
      pr: null,
      carried: undefined,
      gap: { commit: commit.commit, pr: null, reason: '提交没有对应的 PR' },
      findings: [],
    }
  const source: PullSource = commit.unit.kind === 'found' ? 'unit' : 'subject',
    read = input.readPull(number)
  if (read.kind === 'unreadable')
    return {
      pr: { kind: 'unreadable', number, source, reason: read.reason },
      carried: undefined,
      gap: { commit: commit.commit, pr: number, reason: 'PR 读不到' },
      findings: [
        finding(
          'pr-unreadable',
          { commit: commit.commit, pr: pullUrl(input, number) },
          `读不到 PR #${number}：${read.reason}`,
        ),
      ],
    }
  const { pull } = read,
    kind = pullKind(pull.headRef, input)
  return {
    pr: { kind, number, source, url: pull.url },
    carried: kind === 'sync' ? undefined : { commit: commit.commit, pull },
    gap: undefined,
    findings:
      pull.baseRef === input.track.branch
        ? []
        : [
            finding(
              'pr-base-mismatch',
              { commit: commit.commit, pr: pull.url },
              `PR #${pull.number} 的 base 为 ${pull.baseRef}，不是 ${input.track.branch}。`,
            ),
          ],
  }
}
/** Lists every commit with its unit and PR, and reads the PRs. */
function listCommits(input: RiInput): {
  commits: RiCommit[]
  pulls: CarriedPull[]
  gaps: ContractGap[]
  findings: RiFinding[]
} {
  const commits: RiCommit[] = [],
    pulls: CarriedPull[] = [],
    gaps: ContractGap[] = [],
    findings: RiFinding[] = []
  for (const commit of input.commits) {
    const read = readCommitPull(input, commit)
    findings.push(...unitFindings(input, commit), ...read.findings)
    if (read.carried !== undefined) pulls.push(read.carried)
    if (read.gap !== undefined) gaps.push(read.gap)
    commits.push({
      commit: commit.commit,
      subject: commit.subject,
      coverage: commit.coverage,
      unit: commit.unit.kind,
      pr: read.pr,
    })
  }
  return { commits, pulls, gaps, findings }
}
function pullNumber(commit: TrackCommit): number | null {
  if (commit.unit.kind === 'found') return commit.unit.record.pr
  const match = /^Merge pull request #([1-9]\d*) from /.exec(commit.subject)
  return match?.[1] === undefined ? null : Number(match[1])
}
function pullKind(head: string, input: RiInput): PullKind {
  if (head === input.parent.branch) return 'sync'
  const child = input.registry.tracks.find(track => track.branch === head)
  return child !== undefined && child.parent === input.track.id ? 'promote' : 'work'
}

type Pending = { declaration: CardDeclaration; inferred: boolean; pulls: number[] }
/** The cards of the range by Issue number. A declaration replaces an inference. */
class CardBook {
  readonly #cards = new Map<number, Pending>()
  /** A later PR at the same or a newer revision carries the latest attempt. */
  declare(declaration: CardDeclaration, pr: number): void {
    const current = this.#cards.get(declaration.issue)
    if (
      current !== undefined &&
      !current.inferred &&
      declaration.revision < current.declaration.revision
    ) {
      current.pulls.push(pr)
      return
    }
    this.#cards.set(declaration.issue, {
      declaration,
      inferred: false,
      pulls: [...(current?.pulls ?? []), pr],
    })
  }
  /** True when a PR declared the card; the PR is then recorded on it. */
  joinDeclared(issue: number, pr: number): boolean {
    const current = this.#cards.get(issue)
    if (current === undefined || current.inferred) return false
    current.pulls.push(pr)
    return true
  }
  infer(declaration: CardDeclaration, pr: number): void {
    const current = this.#cards.get(declaration.issue)
    this.#cards.set(declaration.issue, {
      declaration,
      inferred: true,
      pulls: [...(current?.pulls ?? []), pr],
    })
  }
  list(): Pending[] {
    return [...this.#cards.values()]
  }
}

function sectionMissing(pull: PullFact, at: RiFinding['at'], section: string, empty: boolean) {
  return finding(
    'pr-section-missing',
    { ...at, section },
    empty
      ? `PR #${pull.number} 的「${section}」没有列表行。`
      : `PR #${pull.number} 没有声明「${section}」。`,
  )
}
/** The card lines of one PR, and whether its card must be inferred from the branch. */
function cardLines(
  pull: PullFact,
  section: PullSections['cards'],
  at: RiFinding['at'],
): { entries: CardDeclaration[]; infer: boolean; findings: RiFinding[] } {
  if (section.kind !== 'listed')
    return {
      entries: [],
      infer: true,
      findings: [sectionMissing(pull, at, CARDS_SECTION, section.kind === 'empty')],
    }
  const entries = section.entries.map(entry =>
    entry.condition === ''
      ? { ...entry, condition: `待确认（PR #${pull.number} 的行没有写条件）` }
      : entry,
  )
  return {
    entries,
    // No line could be read: the card is unknown, as if the section were missing.
    infer: entries.length === 0,
    findings: section.invalid.map(({ line, counted }) =>
      finding(
        'cards-line-invalid',
        { ...at, section: CARDS_SECTION },
        `PR #${pull.number}「${CARDS_SECTION}」的行不符合 gate README 的格式，${counted ? '已按其中的编号、修订与 attempt 计入' : '未计入'}：${line}`,
      ),
    ),
  }
}
/** The contract lines of one PR, and the gap when its contract changes are unknown. */
function contractLines(
  pull: PullFact,
  section: PullSections['contracts'],
  carried: CarriedPull,
  at: RiFinding['at'],
): { entries: ContractEntry[]; gap: ContractGap | undefined; findings: RiFinding[] } {
  const gap = (reason: string) => ({ commit: carried.commit, pr: pull.number, reason })
  if (section.kind === 'none') return { entries: [], gap: undefined, findings: [] }
  if (section.kind !== 'listed')
    return {
      entries: [],
      gap: gap(`PR 没有声明「${CONTRACTS_SECTION}」`),
      findings: [sectionMissing(pull, at, CONTRACTS_SECTION, section.kind === 'empty')],
    }
  return {
    entries: section.entries,
    gap: section.invalid.some(item => !item.counted)
      ? gap(`「${CONTRACTS_SECTION}」有未计入的行`)
      : undefined,
    findings: section.invalid.map(({ line, counted }) =>
      finding(
        'contract-line-invalid',
        { ...at, section: CONTRACTS_SECTION },
        line.startsWith(`- ${UNKNOWN_MARK}`)
          ? `PR #${pull.number}「${CONTRACTS_SECTION}」仍有「${UNKNOWN_MARK}」行，所列来源的契约变化未知，未计入：${line}`
          : `PR #${pull.number}「${CONTRACTS_SECTION}」的行不符合「- <路径>：<none、additive 或 breaking>」，${counted ? '已按其中的路径与级别计入' : '未计入'}：${line}`,
      ),
    ),
  }
}
/** Infers the card of a PR from its branch `issue-<N>` and the card's current binding. */
function inferCard(
  input: RiInput,
  pull: PullFact,
  at: RiFinding['at'],
  book: CardBook,
  readCard: (n: number) => CardRead,
): RiFinding[] {
  const number = Number(/(?:^|\/)issue-([1-9]\d*)(?:-|$)/.exec(pull.headRef)?.[1] ?? Number.NaN)
  if (!Number.isSafeInteger(number))
    return [
      finding(
        'card-unresolved',
        at,
        `PR #${pull.number} 的分支 ${pull.headRef} 不含 issue-<N>，推测不出卡。`,
      ),
    ]
  if (book.joinDeclared(number, pull.number)) return []
  const read = readCard(number)
  const binding: CardBinding =
    read.kind === 'read' ? read.card.binding : { kind: 'invalid', reason: read.reason }
  if (binding.kind !== 'found') {
    const why =
      binding.kind === 'absent' ? '该卡正文没有 binding' : `读不到该卡的 binding：${binding.reason}`
    return [
      finding(
        'card-unresolved',
        { ...at, issue: issueUrl(input, number) },
        `PR #${pull.number} 按分支 ${pull.headRef} 推测为 #${number}，但${why}，须手工补行。`,
      ),
    ]
  }
  book.infer(
    {
      issue: number,
      revision: binding.revision,
      attempt: binding.attempt,
      condition: `待确认（PR #${pull.number} 未声明，按分支推测）`,
    },
    pull.number,
  )
  return []
}
/** Reads the two sections of every carried PR and collects the declared or inferred cards. */
function readDeclarations(
  input: RiInput,
  pulls: readonly CarriedPull[],
  readCard: (n: number) => CardRead,
): {
  cards: Pending[]
  declaredBy: Map<number, CardDeclaration[]>
  contractsBy: { pr: number; entries: ContractEntry[] }[]
  gaps: ContractGap[]
  findings: RiFinding[]
} {
  const book = new CardBook(),
    declaredBy = new Map<number, CardDeclaration[]>(),
    contractsBy: { pr: number; entries: ContractEntry[] }[] = [],
    gaps: ContractGap[] = [],
    findings: RiFinding[] = []
  for (const carried of pulls) {
    const { pull } = carried,
      at = { commit: carried.commit, pr: pull.url },
      sections = parsePullSections(pull.body)
    const cards = cardLines(pull, sections.cards, at)
    findings.push(...cards.findings)
    declaredBy.set(pull.number, cards.entries)
    for (const entry of cards.entries) book.declare(entry, pull.number)
    if (cards.infer) findings.push(...inferCard(input, pull, at, book, readCard))
    const contracts = contractLines(pull, sections.contracts, carried, at)
    findings.push(...contracts.findings)
    if (contracts.gap !== undefined) gaps.push(contracts.gap)
    if (sections.contracts.kind === 'listed')
      contractsBy.push({ pr: pull.number, entries: contracts.entries })
  }
  return { cards: book.list(), declaredBy, contractsBy, gaps, findings }
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
/** The line finding of one card whose attributes were read. */
function lineFinding(
  input: RiInput,
  area: ReadonlySet<string>,
  issue: number,
  line: string | undefined,
): RiFinding[] {
  const at = { issue: issueUrl(input, issue) }
  if (line === undefined)
    return [
      finding(
        'card-line-unknown',
        at,
        `#${issue} 的「身份与责任」没有合法的交付线，不能核对归属。`,
      ),
    ]
  if (line === INTEGRATION_LINE) return []
  const target = targetTrack(input.lines, line)
  return area.has(target)
    ? []
    : [
        finding(
          'card-other-line',
          at,
          `#${issue} 属于线 ${line}，应进入轨道 ${target}，不在 ${input.track.branch} 或其子轨道中。`,
        ),
      ]
}
/** Reads each card's attributes and checks that its line belongs to the source track. */
function judgeCards(
  input: RiInput,
  pending: readonly Pending[],
  readCard: (n: number) => CardRead,
): { cards: RiCard[]; findings: RiFinding[] } {
  const area = subtree(input),
    findings: RiFinding[] = []
  const cards = [...pending]
    .sort((a, b) => a.declaration.issue - b.declaration.issue)
    .map(({ declaration, inferred, pulls }): RiCard => {
      const url = issueUrl(input, declaration.issue),
        at = { issue: url }
      if (inferred)
        findings.push(
          finding(
            'card-inferred',
            at,
            `#${declaration.issue} 由 PR ${pulls.map(n => `#${n}`).join('、')} 的分支名推测，修订与 attempt 取自卡的当前 binding，条件待确认。`,
          ),
        )
      const card = {
        ...declaration,
        url,
        inferred,
        pulls,
        line: null,
        nature: null,
        contractChange: null,
      }
      const read = readCard(declaration.issue)
      if (read.kind === 'unreadable') {
        findings.push(
          finding('card-unreadable', at, `读不到 #${declaration.issue}：${read.reason}`),
        )
        return card
      }
      const { attributes } = judgeAttributes(read.card.attributes, input.lines)
      findings.push(...lineFinding(input, area, declaration.issue, attributes.line))
      return {
        ...card,
        line: attributes.line ?? null,
        nature: attributes.nature ?? null,
        contractChange: attributes.contractChange ?? null,
      }
    })
  return { cards, findings }
}

/** The highest contract change of a PR's cards; undefined unless every card's change is known. */
function ceilingOf(changes: readonly (ContractChange | null)[]): number | undefined {
  const known = changes.filter((item): item is ContractChange => item !== null)
  if (known.length === 0 || known.length !== changes.length) return undefined
  return Math.max(...known.map(item => RANK[item]))
}
/** Findings about one contract entry of a PR. */
function entryFindings(
  input: RiInput,
  pr: number,
  entry: ContractEntry,
  ceiling: number | undefined,
): RiFinding[] {
  const at = { pr: pullUrl(input, pr), section: CONTRACTS_SECTION, path: entry.path },
    findings: RiFinding[] = []
  if (!input.lines.lines.some(line => line.contracts.includes(entry.path)))
    findings.push(
      finding(
        'contract-path-unknown',
        at,
        `PR #${pr} 列出的 ${entry.path} 不是线归属表 contracts 中的契约成员。`,
      ),
    )
  if (ceiling !== undefined && RANK[entry.level] > ceiling)
    findings.push(
      finding(
        'contract-level-exceeds-card',
        at,
        `PR #${pr} 对 ${entry.path} 声明 ${entry.level}，高于所含卡的最高契约变更。`,
      ),
    )
  if (entry.level === 'breaking' && input.track.id !== input.lines.integration.track)
    findings.push(
      finding(
        'contract-breaking-off-integration',
        at,
        `breaking 只出现在进入联调轨道或 main 的 PR 中，PR #${pr} 进入 ${input.track.branch}。`,
      ),
    )
  return findings
}
/** Merges the declared contract changes per member to the highest level, keeping each note. */
function mergeContracts(
  input: RiInput,
  contractsBy: readonly { pr: number; entries: ContractEntry[] }[],
  declaredBy: ReadonlyMap<number, CardDeclaration[]>,
  cards: readonly RiCard[],
): { contracts: RiContract[]; findings: RiFinding[] } {
  const change = new Map(cards.map(card => [card.issue, card.contractChange])),
    merged = new Map<string, RiContract>(),
    findings: RiFinding[] = []
  for (const { pr, entries } of contractsBy) {
    const ceiling = ceilingOf(
      (declaredBy.get(pr) ?? []).map(card => change.get(card.issue) ?? null),
    )
    for (const entry of entries) {
      findings.push(...entryFindings(input, pr, entry, ceiling))
      const current = merged.get(entry.path) ?? { path: entry.path, level: 'none', notes: [] }
      if (RANK[entry.level] > RANK[current.level]) current.level = entry.level
      if (entry.note !== '') current.notes.push({ pr, note: entry.note })
      merged.set(entry.path, current)
    }
  }
  return { contracts: [...merged.values()].sort((a, b) => a.path.localeCompare(b.path)), findings }
}

/**
 * Compares the merged declarations with a snapshot difference over the promoted range. The
 * difference must cover exactly the range from the merge base to the track head.
 */
function checkContracts(
  input: RiInput,
  contracts: readonly RiContract[],
): { contractCheck: ContractCheck; findings: RiFinding[] } {
  const range = { base: input.mergeBase, head: input.head },
    diff = input.diffContracts(range)
  if (diff.kind === 'unavailable')
    return { contractCheck: { kind: 'unavailable', reason: diff.reason }, findings: [] }
  if (diff.base !== range.base || diff.head !== range.head) {
    const reason = `快照差异覆盖 ${diff.base}..${diff.head}，不是本次范围 ${range.base}..${range.head}。`
    return {
      contractCheck: { kind: 'unavailable', reason },
      findings: [finding('contract-diff-stale', { section: CONTRACTS_SECTION }, reason)],
    }
  }
  const declared = new Map(contracts.map(item => [item.path, item.level])),
    findings: RiFinding[] = []
  for (const path of [...new Set([...declared.keys(), ...diff.members.keys()])].sort()) {
    const observed = diff.members.get(path) ?? 'none',
      written = declared.get(path) ?? 'none'
    const expected =
      observed === 'review'
        ? (input.semantic?.levels.get(path) ?? SNAPSHOT_MATCH.review)
        : SNAPSHOT_MATCH[observed]
    if (expected !== written)
      findings.push(
        finding(
          'contract-diff-mismatch',
          { section: CONTRACTS_SECTION, path },
          `快照差异把 ${path} 分为 ${observed}，PR 声明汇总为 ${written}。`,
        ),
      )
  }
  return { contractCheck: { kind: 'checked', ...range }, findings }
}

function renderMarkdown(
  cards: readonly RiCard[],
  contracts: readonly RiContract[],
  gaps: readonly ContractGap[],
  records: ReadonlyMap<string, string> = new Map(),
): string {
  const members = contracts.map(item => {
    const record = records.get(item.path)
    const notes = [
      ...item.notes.map(({ pr, note }) => `#${pr}：${note}`),
      ...(record === undefined ? [] : [`语义复核：${record}`]),
    ].join('；')
    return `- ${item.path}：${item.level}${notes === '' ? '' : `。${notes}`}`
  })
  const unknown = gaps.map(gap =>
    gap.pr === null ? `提交 ${gap.commit.slice(0, 9)}` : `PR #${gap.pr}`,
  )
  const contractLines =
    gaps.length > 0
      ? [
          ...members,
          `- ${UNKNOWN_MARK}：${[...new Set(unknown)].join('、')} 的契约变化未知，逐个核对后改写本节。`,
        ]
      : members.length > 0
        ? members
        : ['无']
  return [
    `## ${CARDS_SECTION}`,
    '',
    ...cards.map(formatCardLine),
    '',
    `## ${CONTRACTS_SECTION}`,
    '',
    ...contractLines,
    '',
  ].join('\n')
}

/** Reads each card at most once. */
function cachedCards(read: (n: number) => CardRead): (n: number) => CardRead {
  const cache = new Map<number, CardRead>()
  return n => {
    const hit = cache.get(n)
    if (hit !== undefined) return hit
    const result = read(n)
    cache.set(n, result)
    return result
  }
}

/**
 * Builds the promotion PR sections for one track from its first-parent commits, their unit
 * records and the PRs they name. Every defect becomes a finding; `riNotesExitCode` reads them.
 */
export function riNotes(input: RiInput): RiNotes {
  const readCard = cachedCards(input.readCard)
  const listedCommits = listCommits(input),
    declarations = readDeclarations(input, listedCommits.pulls, readCard),
    judged = judgeCards(input, declarations.cards, readCard),
    merged = mergeContracts(input, declarations.contractsBy, declarations.declaredBy, judged.cards),
    checked = checkContracts(input, merged.contracts)
  const contractGaps = [...listedCommits.gaps, ...declarations.gaps]
  const findings = [
    ...rangeFindings(input),
    ...listedCommits.findings,
    ...declarations.findings,
    ...judged.findings,
    ...merged.findings,
    ...checked.findings,
  ]
  if (judged.cards.length === 0)
    findings.push(
      finding(
        'cards-empty',
        { section: CARDS_SECTION },
        `自上次提升以来进入 ${input.track.branch} 的 PR 没有可列出的卡。`,
      ),
    )
  if (contractGaps.length > 0)
    findings.push(
      finding(
        'contracts-unknown',
        { section: CONTRACTS_SECTION },
        `${contractGaps.length} 个提交的契约变化未知，「${CONTRACTS_SECTION}」输出「待确认」。`,
      ),
    )
  return {
    track: { id: input.track.id, branch: input.track.branch, head: input.head },
    parent: input.parent,
    lowerBound: input.lowerBound,
    commits: listedCommits.commits,
    cards: judged.cards,
    contracts: merged.contracts,
    contractGaps,
    contractCheck: checked.contractCheck,
    findings,
    markdown: renderMarkdown(judged.cards, merged.contracts, contractGaps, input.semantic?.records),
  }
}
