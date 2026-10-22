// The reasoning details of one response: streamed fragments join into whole items, and the
// visible reasoning text of a fragment. The joined items go to the reasoning hook at finish.
import type { JsonValue } from '@omne-harness/json-text'
import type { DetailFragment } from './chunk.ts'
import type { ReasoningDetail } from './vocabulary.ts'

/** The text that a gateway writes in place of reasoning it withholds. It is never visible text. */
export const REDACTED = '[REDACTED]'

/** One joined item: the fragment head of its first fragment and the joined members. */
export type JoinedDetail = DetailFragment

/** The member of a fragment that carries its visible text, by fragment type. */
const VISIBLE_MEMBER = {
  'reasoning.text': 'text',
  'reasoning.summary': 'summary',
} as const

type Signature =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'signed'; value: string }>
  | Readonly<{ kind: 'invalid' }>

function signatureOf(detail: DetailFragment): Signature {
  const value = detail.raw['signature']
  if (value === undefined || value.kind === 'null') return { kind: 'none' }
  if (value.kind === 'string' && value.value.length > 0)
    return { kind: 'signed', value: value.value }
  return { kind: 'invalid' }
}

function stringMember(detail: DetailFragment, key: string): string | undefined {
  const value = detail.raw[key]
  return value?.kind === 'string' ? value.value : undefined
}

/**
 * The visible text of one fragment: the `text` of a `reasoning.text` item or the `summary` of a
 * `reasoning.summary` item. `null` when it is absent, empty or the redaction marker.
 */
export function visibleTextOf(fragment: DetailFragment): string | null {
  if (fragment.type !== 'reasoning.text' && fragment.type !== 'reasoning.summary') return null
  const text = stringMember(fragment, VISIBLE_MEMBER[fragment.type])
  return text === undefined || text.length === 0 || text === REDACTED ? null : text
}

/** The UTF-16 length of the string members of a fragment: what the buffer holds for it. */
export function bufferedLength(fragment: DetailFragment): number {
  let length = 0
  for (const value of Object.values(fragment.raw))
    if (value.kind === 'string') length += value.value.length
  return length
}

/**
 * Adds one fragment to the joined items. A fragment joins the last item when both are
 * `reasoning.text` or both `reasoning.summary`, neither has an `id`, both have the same `index` and
 * the same `format`. For `reasoning.text`:
 *
 * - the signature may arrive alone in the last fragment, without `text`;
 * - an unsigned item adopts the first signature;
 * - after that, only a fragment with the same signature joins; any other starts a new item;
 * - an empty or non-string signature never joins.
 *
 * Any other fragment, `reasoning.encrypted` included, is a new item.
 */
export function joinDetail(
  items: readonly JoinedDetail[],
  fragment: DetailFragment,
): readonly JoinedDetail[] {
  const last = items.at(-1)
  const joined = last === undefined ? undefined : joinedWith(last, fragment)
  return joined === undefined ? [...items, fragment] : [...items.slice(0, -1), joined]
}

function sameHead(last: DetailFragment, fragment: DetailFragment): boolean {
  return (
    last.type === fragment.type &&
    last.id === null &&
    fragment.id === null &&
    last.index !== null &&
    last.index === fragment.index &&
    last.format === fragment.format
  )
}

function joinedWith(last: JoinedDetail, fragment: DetailFragment): JoinedDetail | undefined {
  if (!sameHead(last, fragment)) return undefined
  if (fragment.type === 'reasoning.summary') return withSummary(last, fragment)
  if (fragment.type === 'reasoning.text') return withText(last, fragment)
  return undefined
}

function withSummary(last: JoinedDetail, fragment: DetailFragment): JoinedDetail | undefined {
  const before = stringMember(last, 'summary')
  const after = stringMember(fragment, 'summary')
  if (before === undefined || after === undefined) return undefined
  return replaced(last, { summary: text(before + after) })
}

function withText(last: JoinedDetail, fragment: DetailFragment): JoinedDetail | undefined {
  const earlier = signatureOf(last)
  const later = signatureOf(fragment)
  if (earlier.kind === 'invalid' || later.kind === 'invalid') return undefined
  if (earlier.kind === 'signed' && (later.kind !== 'signed' || later.value !== earlier.value))
    return undefined
  const before = stringMember(last, 'text')
  const after = stringMember(fragment, 'text') ?? (later.kind === 'signed' ? '' : undefined)
  if (before === undefined || after === undefined) return undefined
  const members: Record<string, JsonValue> = { text: text(before + after) }
  if (earlier.kind === 'none' && later.kind === 'signed') members['signature'] = text(later.value)
  return replaced(last, members)
}

function replaced(
  detail: JoinedDetail,
  members: Readonly<Record<string, JsonValue>>,
): JoinedDetail {
  return { ...detail, raw: Object.freeze({ ...detail.raw, ...members }) }
}

function text(value: string): JsonValue {
  return { kind: 'string', value }
}

/** The joined items as the reasoning hook reads them. */
export function hookDetails(items: readonly JoinedDetail[]): readonly ReasoningDetail[] {
  return items.map(item => Object.freeze({ type: item.type, format: item.format, raw: item.raw }))
}
