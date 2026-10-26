import { IntegrationError, json, section } from '../integration/parse.ts'
import { BINDING_MARKERS, parseTaskBinding, readTaskBinding } from './binding.ts'
import { readIssueCard, REST_HEADERS, type GhCommand } from './github-read.ts'
import { isOpenScope, under, type DeliveryLines } from './lines.ts'
import { InputError, text } from './protocol.ts'

/**
 * One card's write scope, named by where it came from: `#<Issue number>` or a file path.
 * `closed` is true for a closed Issue; a file has no Issue state.
 */
export type ScopeCard = { source: string; writeScope: readonly string[]; closed?: boolean }
/** The counted and the open entries of one card; only counted entries take part in the check. */
export type ScopeEntries = { source: string; counted: string[]; open: string[] }
/** Two entries of two cards where one path is the other or lies below it. */
export type ScopeConflict = { first: string; second: string; firstPath: string; secondPath: string }
/** `excluded` lists the closed cards left out of the check. */
export type ScopeOverlap = { cards: ScopeEntries[]; excluded: string[]; conflicts: ScopeConflict[] }

/**
 * Intersects the write scopes of the cards pairwise. Two entries intersect when one path equals
 * the other or contains it as a directory prefix. Task tmp and the line table's shared paths
 * are open to every card, so they never intersect. A closed card no longer writes, so it is
 * left out and listed in `excluded`, unless `includeClosed` is set. A source given twice is an
 * input error: it would conflict with itself.
 */
export function scopeOverlap(
  cards: readonly ScopeCard[],
  table: DeliveryLines,
  { includeClosed = false }: { includeClosed?: boolean } = {},
): ScopeOverlap {
  const seen = new Set<string>()
  for (const card of cards) {
    if (seen.has(card.source))
      throw new IntegrationError('input-error', `${card.source} is given more than once`)
    seen.add(card.source)
  }
  const excluded = includeClosed ? [] : cards.filter(card => card.closed === true)
  const entries = cards
    .filter(card => !excluded.includes(card))
    .map(card => ({
      source: card.source,
      counted: card.writeScope.filter(path => !isOpenScope(table, path)),
      open: card.writeScope.filter(path => isOpenScope(table, path)),
    }))
  const conflicts = entries.flatMap((first, index) =>
    entries.slice(index + 1).flatMap(second =>
      first.counted.flatMap(firstPath =>
        second.counted
          .filter(secondPath => under(firstPath, secondPath) || under(secondPath, firstPath))
          .map(secondPath => ({
            first: first.source,
            second: second.source,
            firstPath,
            secondPath,
          })),
      ),
    ),
  )
  return { cards: entries, excluded: excluded.map(card => card.source), conflicts }
}

/** Reads the unique binding of one Issue in `repository`; an Issue without one is an input error. */
export function issueScope(repository: string, number: number, call: GhCommand): ScopeCard {
  const card = readIssueCard(
    call(
      ['api', '--method', 'GET', ...REST_HEADERS, `repos/${repository}/issues/${number}`],
      15_000,
    ),
    repository,
    number,
  )
  const binding = readTaskBinding(card.body, {
    repository,
    number,
    url: card.url,
    id: text(card.issue.node_id, 'Issue.node_id'),
  })
  if (binding === undefined) throw new InputError(`Issue #${number} has no binding`)
  return {
    source: `#${number}`,
    writeScope: binding.writeScope,
    closed: card.issue.state === 'closed',
  }
}
/**
 * Reads a binding file: a JSON binding object, or text that holds exactly one binding block,
 * such as a saved Issue body.
 */
export function fileScope(path: string, content: string): ScopeCard {
  const trimmed = content.trimStart()
  if (trimmed.startsWith('{'))
    return { source: path, writeScope: parseTaskBinding(json(content, path)).writeScope }
  const blocks = Object.values(BINDING_MARKERS).flatMap(marker => {
    const raw = section(content, marker)
    return raw === undefined ? [] : [raw]
  })
  const raw = blocks[0]
  if (blocks.length !== 1 || raw === undefined)
    throw new InputError(`${path} must hold one binding object or exactly one binding block`)
  return { source: path, writeScope: parseTaskBinding(raw).writeScope }
}
