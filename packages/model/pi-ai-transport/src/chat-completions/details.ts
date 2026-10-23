// The reasoning details of one response: streamed fragments join into whole items, and the
// visible reasoning text of a fragment. The joined items go to the reasoning hook at finish.
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { DetailFragment } from './chunk.ts'
import { object, sorted, text } from './json.ts'
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
 * Adds one fragment to the joined items. A fragment joins the last item only when both are
 * `reasoning.text` or both `reasoning.summary`, and:
 *
 * - the heads are equal: every member except the visible text member (and, for `reasoning.text`,
 *   `signature`) has the same sorted-key lossless JSON text, so `id`, `index`, `format` and unknown
 *   members must match;
 * - the identity is the same: neither has an `id` (absent or `null`), or both have the same
 *   non-empty string `id`. An empty or non-string `id` never joins.
 *
 * For `reasoning.text` also:
 *
 * - when a signature is present on either side, two items without an `id` join only when both
 *   have an `index`;
 * - the signature may arrive alone in the last fragment, without `text`;
 * - an unsigned item adopts the first signature; after that, only a fragment with the same
 *   signature joins, and any other fragment, an unsigned one included, starts a new item;
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

/** The sorted-key lossless JSON text of the members of a fragment, less the excluded ones. */
function headText(detail: DetailFragment, excluded: readonly string[]): string {
  const members = Object.entries(detail.raw).filter(([key]) => !excluded.includes(key))
  return writeJsonText(sorted(object(Object.fromEntries(members))))
}

function sameHead(last: DetailFragment, fragment: DetailFragment, ...excluded: string[]): boolean {
  return last.type === fragment.type && headText(last, excluded) === headText(fragment, excluded)
}

type Identity =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'id'; value: string }>
  | Readonly<{ kind: 'invalid' }>

/** The `id` member as it arrived: an empty string is not the same as no `id`. */
function identityOf(detail: DetailFragment): Identity {
  const value = detail.raw['id']
  if (value === undefined || value.kind === 'null') return { kind: 'none' }
  if (value.kind === 'string' && value.value.length > 0) return { kind: 'id', value: value.value }
  return { kind: 'invalid' }
}

/** True when both are one item. Without an `id`, a signed pair needs an `index` on both. */
function sameIdentity(last: DetailFragment, fragment: DetailFragment, signed: boolean): boolean {
  const before = identityOf(last)
  const after = identityOf(fragment)
  if (before.kind === 'none' && after.kind === 'none')
    return !signed || (last.index !== null && fragment.index !== null)
  return before.kind === 'id' && after.kind === 'id' && before.value === after.value
}

function joinedWith(last: JoinedDetail, fragment: DetailFragment): JoinedDetail | undefined {
  if (fragment.type === 'reasoning.summary') return withSummary(last, fragment)
  if (fragment.type === 'reasoning.text') return withText(last, fragment)
  return undefined
}

function withSummary(last: JoinedDetail, fragment: DetailFragment): JoinedDetail | undefined {
  if (!sameHead(last, fragment, 'summary') || !sameIdentity(last, fragment, false)) return undefined
  const before = stringMember(last, 'summary')
  const after = stringMember(fragment, 'summary')
  if (before === undefined || after === undefined) return undefined
  return replaced(last, { summary: text(before + after) })
}

function withText(last: JoinedDetail, fragment: DetailFragment): JoinedDetail | undefined {
  if (!sameHead(last, fragment, 'text', 'signature')) return undefined
  const earlier = signatureOf(last)
  const later = signatureOf(fragment)
  if (earlier.kind === 'invalid' || later.kind === 'invalid') return undefined
  const signed = earlier.kind === 'signed' || later.kind === 'signed'
  if (!sameIdentity(last, fragment, signed)) return undefined
  if (earlier.kind === 'signed' && (later.kind !== 'signed' || later.value !== earlier.value))
    return undefined
  const before = stringMember(last, 'text')
  // Only a fragment without a `text` member may bring a signature alone.
  const after =
    fragment.raw['text'] === undefined
      ? later.kind === 'signed'
        ? ''
        : undefined
      : stringMember(fragment, 'text')
  if (before === undefined || after === undefined) return undefined
  const members: Record<string, JsonValue> = { text: text(before + after) }
  if (earlier.kind === 'none' && later.kind === 'signed') members['signature'] = text(later.value)
  // An item without a `signature` member takes the explicit `null` of a later fragment.
  else if (last.raw['signature'] === undefined && fragment.raw['signature']?.kind === 'null')
    members['signature'] = { kind: 'null' }
  return replaced(last, members)
}

function replaced(
  detail: JoinedDetail,
  members: Readonly<Record<string, JsonValue>>,
): JoinedDetail {
  return { ...detail, raw: Object.freeze({ ...detail.raw, ...members }) }
}

/** The joined items as the reasoning hook reads them. */
export function hookDetails(items: readonly JoinedDetail[]): readonly ReasoningDetail[] {
  return items.map(item => Object.freeze({ type: item.type, format: item.format, raw: item.raw }))
}
