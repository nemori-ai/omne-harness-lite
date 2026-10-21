import {
  judgeBlockIdentity,
  type BlockId,
  type BlockIdentityRejection,
  type Visibility,
} from '@omne-harness/content-block'
import { closedFields, hasDuplicates, nonEmpty, readDataItems } from './values.ts'

/** The most UTF-16 code units that the payload of a reasoning state part may have. */
export const REASONING_STATE_PAYLOAD_MAX_LENGTH = 1048576

/** The most UTF-16 code units that `scope` or `format` of a replay description may have. */
export const REPLAY_TAG_MAX_LENGTH = 256

/** An opaque state that a provider handed back with its reasoning. Only an assistant message has it. */
export type ReasoningStatePart = Readonly<{
  kind: 'reasoning_state'
  id: BlockId
  visibility: Visibility
  payload: string
  pairs: readonly BlockId[]
}>

/** Who produced the reasoning of an assistant message, in what format, and where its state parts are. */
export type ReasoningReplay = Readonly<{
  scope: string
  format: string
  at: readonly number[]
}>

export type ReasoningStateField = 'id' | 'visibility' | 'payload' | 'pairs'

/** The fields of a reasoning state part besides `kind`. The keys are closed. */
export const REASONING_STATE_FIELDS: readonly ReasoningStateField[] = [
  'id',
  'visibility',
  'payload',
  'pairs',
]

export type ReasoningStateRejection = BlockIdentityRejection | 'payload' | 'pairs'

export type ReasoningStateJudgment =
  | { readonly ok: ReasoningStatePart }
  | { readonly rejected: ReasoningStateRejection }

// A listed key that the type lacks fails to compile. A key that the type has and the list lacks
// fails where `judgeReplay` builds the value.
const REPLAY_KEYS = ['scope', 'format', 'at'] as const satisfies readonly (keyof ReasoningReplay)[]

/** A block identity is any non-empty string, as in `@omne-harness/content-block`. */
function isBlockRef(raw: string): raw is BlockId {
  return raw.length > 0
}

/** Only the length of the payload is read, never its content. */
function isPayload(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= REASONING_STATE_PAYLOAD_MAX_LENGTH
  )
}

function readPairs(raw: unknown): readonly BlockId[] | undefined {
  const ids = readDataItems(raw, item =>
    typeof item === 'string' && isBlockRef(item) ? item : undefined,
  )
  return ids === undefined || hasDuplicates(ids) ? undefined : Object.freeze(ids)
}

/**
 * A part of kind `reasoning_state` whose keys are already closed. The checks run in this order:
 * `id`, `visibility`, `payload`, `pairs`. `pairs` is a frozen copy. This function does not look at
 * the other blocks of the message: whether each pair names one is the message's check.
 */
export function judgeReasoningState(value: Record<string, unknown>): ReasoningStateJudgment {
  const identity = judgeBlockIdentity(value)
  if ('rejected' in identity) return { rejected: identity.rejected }
  if (identity.ok.visibility.toHuman) return { rejected: 'visibility' }
  const { payload } = value
  if (!isPayload(payload)) return { rejected: 'payload' }
  const pairs = readPairs(value.pairs)
  if (pairs === undefined) return { rejected: 'pairs' }
  return { ok: { kind: 'reasoning_state', ...identity.ok, payload, pairs } }
}

/** True for a replay `scope` or `format`: a non-empty string of at most `REPLAY_TAG_MAX_LENGTH` code units. */
export function isReplayTag(value: unknown): value is string {
  return nonEmpty(value) && value.length <= REPLAY_TAG_MAX_LENGTH
}

function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function readAt(raw: unknown): readonly number[] | undefined {
  const at = readDataItems(raw, item => (isIndex(item) ? item : undefined))
  if (at === undefined) return undefined
  let previous = -1
  for (const index of at) {
    if (index <= previous) return undefined
    previous = index
  }
  return Object.freeze(at)
}

/**
 * The `replay` key of an assistant message: a plain object with exactly `scope`, `format` and
 * `at`, or `undefined`. The success value is a frozen copy, and `at` in it is one too.
 */
export function judgeReplay(raw: unknown): ReasoningReplay | undefined {
  const fields = closedFields(raw, REPLAY_KEYS)
  if (fields === undefined) return undefined
  const { scope, format } = fields
  if (!isReplayTag(scope) || !isReplayTag(format)) return undefined
  const at = readAt(fields.at)
  if (at === undefined) return undefined
  return Object.freeze({ scope, format, at })
}
