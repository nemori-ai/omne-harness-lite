import {
  judgeBlockIdentity,
  type BlockId,
  type BlockIdentityRejection,
  type Visibility,
} from '@omne-harness/content-block'
import { closedFields, hasDuplicates, nonEmpty, readDataItems } from './values.ts'

export const REASONING_STATE_PAYLOAD_MAX_LENGTH = 1048576

export const REPLAY_TAG_MAX_LENGTH = 256

export type ReasoningStatePart = Readonly<{
  kind: 'reasoning_state'
  id: BlockId
  visibility: Visibility
  payload: string
  pairs: readonly BlockId[]
}>

export type ReasoningReplay = Readonly<{
  scope: string
  format: string
  at: readonly number[]
}>

export type ReasoningStateField = 'id' | 'visibility' | 'payload' | 'pairs'

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

const REPLAY_KEYS = ['scope', 'format', 'at'] as const satisfies readonly (keyof ReasoningReplay)[]

function isBlockRef(raw: string): raw is BlockId {
  return raw.length > 0
}

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

export function judgeReplay(raw: unknown): ReasoningReplay | undefined {
  const fields = closedFields(raw, REPLAY_KEYS)
  if (fields === undefined) return undefined
  const { scope, format } = fields
  if (!isReplayTag(scope) || !isReplayTag(format)) return undefined
  const at = readAt(fields.at)
  if (at === undefined) return undefined
  return Object.freeze({ scope, format, at })
}
