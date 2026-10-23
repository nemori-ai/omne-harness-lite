import { contractChanges, type ContractChange } from '../delivery/attributes.ts'

/**
 * The two sections of a PR into a track, from docs/engineering/integration.md「进轨道 PR 的说明」.
 * The card line format is the one in `gate/README.md`「提升 PR 的说明」 on `github-gate`.
 */
export const CARDS_SECTION = '所含的卡'
export const CONTRACTS_SECTION = '契约变化'

/** One card line of「所含的卡」. */
export type CardDeclaration = {
  issue: number
  revision: number
  attempt: string
  condition: string
}
/** One member line of「契约变化」. */
export type ContractEntry = { path: string; level: ContractChange; note: string }
/** A list line that does not match the format; `counted` when its facts were still read. */
export type InvalidLine = { line: string; counted: boolean }
/**
 * A section as declared: absent, without a top-level list line, or its list lines. Lines that are
 * not top-level list items, such as prose and nested items, do not count.
 */
export type Section<T> =
  | { kind: 'absent' }
  | { kind: 'empty' }
  | { kind: 'listed'; entries: T[]; invalid: InvalidLine[] }
export type PullSections = {
  cards: Section<CardDeclaration>
  /** `none` is the line「无」 without any list line: the PR changes no contract member. */
  contracts: Section<ContractEntry> | { kind: 'none' }
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/
const BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const ITEM = /^ ?[-*+][ \t]+(.*)$/
/** Only the gate format: one space after each part and a full-width colon before the condition. */
const CARD_LINE = /^- #([1-9]\d*) revision ([1-9]\d*) attempt `([^`\s]+)`：(\S.*)$/
/** A card item with the gate's facts and other separators. */
const LOOSE_CARD =
  /^#([1-9]\d*)\s+revision\s+([1-9]\d*)\s*[/，,]?\s*attempt\s+`([^`\s]+)`\s*[：:，,。；;]?\s*(.*)$/
const LEVEL = '(none|additive|breaking)(?![A-Za-z0-9_-])'
/** `- <路径>：<级别>` and any text after the level. The path may be written as Markdown code. */
const CONTRACT_LINE = new RegExp(`^- (\`?)([^\\s：\`]+)\\1：${LEVEL}(.*)$`)
/**
 * A contract item with a path and a level and other separators. A level in parentheses keeps the
 * text after it, without the closing parenthesis, as the note.
 */
const LOOSE_CONTRACT = new RegExp(
  `^(\`?)([^\\s：:\`（(]+)\\1[\\s：:—-]*(?:[（(]\\s*${LEVEL}(.*?)[）)]|${LEVEL})(.*)$`,
)

/** The lines outside HTML comments and fenced code blocks. */
function visibleLines(body: string): string[] {
  const visible: string[] = []
  let fence: string | undefined
  for (const line of body.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/)) {
    const marker = FENCE.exec(line)?.[1]
    if (fence === undefined) {
      if (marker === undefined) visible.push(line)
      else fence = marker
    } else if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length)
      fence = undefined
  }
  return visible
}
/**
 * The lines of every `## name` section, one array per occurrence, without HTML comments and
 * fenced code. A heading of level 1 or 2, or a thematic break (`---`, `***` or `___` alone on a
 * line), ends a section.
 */
function occurrences(body: string, name: string): string[][] {
  const result: string[][] = []
  let current: string[] | undefined
  for (const line of visibleLines(body)) {
    const level = HEADING.exec(line)?.[1]?.length
    if (level !== undefined && level <= 2) {
      current = level === 2 && HEADING.exec(line)?.[2] === name ? [] : undefined
      if (current !== undefined) result.push(current)
    } else if (BREAK.test(line)) current = undefined
    else current?.push(line)
  }
  return result
}

/** A parsed list line: exact, read despite a format defect, or unreadable. */
type Parsed<T> = { kind: 'exact'; entry: T } | { kind: 'loose'; entry: T } | { kind: 'invalid' }
function listed<T>(found: string[][], parse: (line: string, item: string) => Parsed<T>) {
  const entries: T[] = [],
    invalid: InvalidLine[] = []
  for (const line of found.flat()) {
    const item = ITEM.exec(line)?.[1]?.trim()
    if (item === undefined) continue
    const parsed = parse(line.trim(), item)
    if (parsed.kind !== 'invalid') entries.push(parsed.entry)
    if (parsed.kind !== 'exact')
      invalid.push({ line: line.trim(), counted: parsed.kind === 'loose' })
  }
  return entries.length === 0 && invalid.length === 0
    ? ({ kind: 'empty' } as const)
    : ({ kind: 'listed', entries, invalid } as const)
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
/** Reads one card line. The condition of a loose line may be empty. */
function parseCard(line: string, item: string): Parsed<CardDeclaration> {
  const exact = cardOf(CARD_LINE.exec(line))
  if (exact !== undefined) return { kind: 'exact', entry: exact }
  const loose = cardOf(LOOSE_CARD.exec(item))
  return loose === undefined ? { kind: 'invalid' } : { kind: 'loose', entry: loose }
}
function note(text: string): string {
  return text.replace(/^[\s。；，,;:：]+/, '').trim()
}
function contractOf(match: RegExpExecArray | null): ContractEntry | undefined {
  const level = contractChanges.find(item => item === match?.[3])
  if (match?.[2] === undefined || level === undefined) return undefined
  return { path: match[2], level, note: note(match[4] ?? '') }
}
/** Groups: path, then a parenthesized level with its inner text, or a bare level. */
function looseContractOf(match: RegExpExecArray | null): ContractEntry | undefined {
  if (match?.[2] === undefined) return undefined
  const level = contractChanges.find(item => item === (match[3] ?? match[5]))
  if (level === undefined) return undefined
  const text = [match[4], match[6]].map(part => note(part ?? '')).filter(part => part !== '')
  return { path: match[2], level, note: text.join('。') }
}
function parseContract(line: string, item: string): Parsed<ContractEntry> {
  const exact = contractOf(CONTRACT_LINE.exec(line))
  if (exact !== undefined) return { kind: 'exact', entry: exact }
  const loose = looseContractOf(LOOSE_CONTRACT.exec(item))
  return loose === undefined ? { kind: 'invalid' } : { kind: 'loose', entry: loose }
}

/** Reads the two sections of a PR body. Every occurrence of a section counts. */
export function parsePullSections(body: string): PullSections {
  const cards = occurrences(body, CARDS_SECTION),
    contracts = occurrences(body, CONTRACTS_SECTION)
  const contractList = contracts.length === 0 ? undefined : listed(contracts, parseContract)
  return {
    cards: cards.length === 0 ? { kind: 'absent' } : listed(cards, parseCard),
    contracts:
      contractList === undefined
        ? { kind: 'absent' }
        : contractList.kind === 'empty' && contracts.flat().some(line => line.trim() === '无')
          ? { kind: 'none' }
          : contractList,
  }
}
/** One card line in the exact gate README format. */
export function formatCardLine(card: CardDeclaration): string {
  return `- #${card.issue} revision ${card.revision} attempt \`${card.attempt}\`：${card.condition}`
}
