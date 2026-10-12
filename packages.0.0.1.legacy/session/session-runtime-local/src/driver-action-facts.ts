import { z } from 'zod'
import { copyJsonValue, judgeContentBlock, validate } from '@omne-harness-lite/content-blocks'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { judgeDefinition } from '@omne-harness-lite/loop-extension'
import type { RunnerPiece } from '@omne-harness-lite/loop-extension-runner'
import { requiredOwn } from '@omne-harness-lite/asset-registry'
import type { ActionBatchCompletion, ActionOrigin } from '@omne-harness-lite/tool-admission'
import {
  checkKey,
  checkLogPayload,
  compareInteger,
  positiveInteger,
  type CheckedPrefix,
  type LogEntry,
} from '@omne-harness-lite/session-log'
import type { RuntimeOptions } from './runtime-types.ts'
import { requireHistory } from './driver-model-history.ts'

export const sessionActionBatchOwner = 'session-runtime-action-batches'
export type ReadActionConclusions = NonNullable<RuntimeOptions['toolDelivery']>['readConclusions']
export interface DriverActionBatchFact {
  readonly kind: 'actions_completed'
  readonly origin: ActionOrigin
  readonly adoption: string
  readonly chain: readonly RunnerPiece[]
  readonly completion: ActionBatchCompletion
}
export interface DriverActionBatchRecord {
  readonly entry: LogEntry
  readonly key: string
  readonly value: DriverActionBatchFact
}
const key = z.string().refine(checkKey)
const decision = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('allow'), conclusion: key }).strict(),
  z
    .object({
      kind: z.literal('denied'),
      conclusion: key,
      reason: z.custom<
        Extract<ActionBatchCompletion['items'][number]['decision'], { kind: 'denied' }>['reason']
      >(value => validate('ActionDenialReason', value).valid),
    })
    .strict(),
  z
    .object({
      kind: z.literal('notExecutable'),
      reason: z.enum(['unparseable', 'no_such_entry']),
      conclusion: key.optional(),
    })
    .strict(),
])
const schema = z
  .object({
    kind: z.literal('actions_completed'),
    origin: z
      .object({
        run: key,
        attempt: z.custom<ActionOrigin['attempt']>(positiveInteger),
        assistantMessage: key,
      })
      .strict(),
    adoption: key,
    chain: z.array(
      z
        .object({
          definition: z.custom<RunnerPiece['definition']>(value => 'ok' in judgeDefinition(value)),
          power: z.enum(['observe', 'rewrite', 'veto']),
          onError: z.enum(['ignore', 'record', 'treat_as_veto']).optional(),
          fallback: z.enum(['modality', 'retry', 'admission', 'loop', 'offload']).optional(),
        })
        .strict(),
    ),
    completion: z
      .object({
        key,
        gate: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('available') }).strict(),
          z
            .object({ kind: z.literal('missing'), reason: z.enum(['chain', 'contribution']) })
            .strict(),
        ]),
        items: z
          .array(
            z
              .object({
                callId: key,
                effectiveCall: z.custom<ActionBatchCompletion['items'][number]['effectiveCall']>(
                  value => {
                    const judged = judgeContentBlock(value)
                    return (
                      'ok' in judged &&
                      judged.ok.kind === 'tool_call' &&
                      judged.ok.complete === true
                    )
                  },
                ),
                anchor: key.optional(),
                conclusions: z.array(key),
                decision,
              })
              .strict(),
          )
          .nonempty(),
      })
      .strict(),
  })
  .strict()

export function actionBatchKey(message: string) {
  return `${sessionActionBatchOwner}/1/${JSON.stringify(message)}`
}
export function actionAnchor(message: string, call: string) {
  return `${sessionActionBatchOwner}/1/pass/${JSON.stringify([message, call])}`
}
export function captureActionBatch(value: unknown): DriverActionBatchFact {
  const copied = copyJsonValue(value)
  requireHistory('ok' in copied, 'non-JSON completed action batch data')
  const parsed = schema.safeParse(copied.ok)
  requireHistory(parsed.success, 'invalid completed action batch data')
  const data = parsed.data
  const items = data.completion.items
  requireHistory(
    new Set(items.map(item => item.callId)).size === items.length &&
      items.every(item => item.effectiveCall.callId === item.callId),
    'completed batch repeats or changes call identity',
  )
  requireHistory(
    new Set(data.chain.map(piece => piece.definition.name)).size === data.chain.length,
    'completed batch repeats a chain piece',
  )
  requireHistory(
    data.completion.key === actionBatchKey(data.origin.assistantMessage),
    'completed batch key changes its original message',
  )
  return requiredOwn(data) as unknown as DriverActionBatchFact
}
export function inspectActionBatch(
  prefix: Pick<CheckedPrefix, 'scope'>,
  entry: LogEntry,
): DriverActionBatchRecord | undefined {
  const payload = checkLogPayload(entry.payload)
  requireHistory(!('failure' in payload), 'invalid action batch log payload')
  if (payload.kind !== 'fact' || payload.payload.owner !== sessionActionBatchOwner) return undefined
  requireHistory(payload.payload.version === '1', 'unknown action batch version')
  const value = captureActionBatch(payload.payload.value)
  requireHistory(
    entry.session === prefix.scope.session &&
      tenantIdEquals(entry.tenant, prefix.scope.tenant) &&
      entry.run === value.origin.run &&
      entry.attempt !== undefined &&
      compareInteger(entry.attempt, value.origin.attempt) === 0 &&
      entry.dedupeKey === value.completion.key &&
      entry.readKeys.length === 1 &&
      entry.readKeys[0] === entry.dedupeKey,
    'action batch shell changes original scope or identity',
  )
  return { entry, key: entry.dedupeKey, value }
}
