import { z } from 'zod'
import {
  positiveInteger,
  checkKey,
  checkSourceToken,
  compareInteger,
  type SourceToken,
} from '@omne-harness-lite/session-log'
import {
  checkOperationRef,
  type OperationRef,
  type Receipt,
  type SessionRuntime,
} from '@omne-harness-lite/session-runtime'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { SessionSubmissionReading } from './session-submission.ts'
import type { SessionTextReading } from './session-reading.ts'
import type { SessionHostRequest } from './session-host-protocol.ts'

export type SubmitRequest = Extract<SessionHostRequest, { command: 'submitInput' }>
type Submission = Extract<SessionSubmissionReading, { kind: 'submission' }>
const key = z.string().refine(checkKey)
const position = z.unknown().transform((value, ctx) => {
  if (positiveInteger(value)) return value
  ctx.addIssue({ code: 'custom', message: 'invalid position' })
  return z.NEVER
})
const source = z.unknown().transform((value, ctx) => {
  const checked = checkSourceToken(value)
  if ('ok' in checked) return checked.ok
  ctx.addIssue({ code: 'custom', message: 'invalid source' })
  return z.NEVER
})
const operation = z.unknown().transform((value, ctx) => {
  const checked = checkOperationRef(value)
  if ('operation' in checked) return checked.operation
  ctx.addIssue({ code: 'custom', message: 'invalid operation' })
  return z.NEVER
})
const receipt = z.strictObject({ operation, position, source }).readonly()
export function readSessionReceiptValue(value: unknown): Receipt | undefined {
  const checked = receipt.safeParse(value)
  return checked.success ? checked.data : undefined
}
const submitted: z.ZodType<Awaited<ReturnType<SessionRuntime['submitInput']>>> = z.union([
  z.strictObject({ kind: z.literal('accepted'), receipt }),
  z.strictObject({ kind: z.literal('unknownCommit'), operation }),
  z.strictObject({
    failure: z.enum([
      'invalidInput',
      'denied',
      'unavailable',
      'notFound',
      'notAccepting',
      'identityConflict',
    ]),
  }),
])
const submission: z.ZodType<SessionSubmissionReading> = z.union([
  z
    .strictObject({
      kind: z.literal('submission'),
      receipt,
      source,
      inputPosition: position,
      messageId: key,
      admission: z
        .strictObject({
          inputPosition: position,
          reason: z.enum(['loginRejected', 'confirmationUnavailable']),
        })
        .optional(),
      run: z
        .strictObject({ id: key, state: z.enum(['running', 'completed', 'failed', 'cancelled']) })
        .nullable(),
    })
    .transform(({ admission, ...value }) =>
      admission === undefined ? value : { ...value, admission },
    ),
  z.strictObject({ kind: z.literal('absent') }),
  z.strictObject({ failure: z.enum(['invalidInput', 'denied', 'notFound', 'unavailable']) }),
])
const messages: z.ZodType<SessionTextReading> = z.union([
  z.strictObject({
    kind: z.literal('messages'),
    source,
    messages: z.array(
      z.strictObject({
        position,
        run: key.nullable(),
        id: key,
        type: z.enum([
          'system',
          'user',
          'assistant',
          'tool',
          'tool_internal',
          'system_reminder',
          'compaction',
        ]),
        createdAt: z.string(),
        blocks: z.array(
          z.strictObject({ id: key, kind: z.enum(['text', 'thinking']), text: z.string() }),
        ),
      }),
    ),
  }),
  z.strictObject({ failure: z.enum(['invalidInput', 'denied', 'notFound', 'unavailable']) }),
])
function scoped(token: SourceToken, request: SubmitRequest) {
  return token.session === request.session && tenantIdEquals(token.tenant, request.binding.tenant)
}
function requested(operation: OperationRef, request: SubmitRequest) {
  return (
    operation.operation === 'submitInput' &&
    operation.session === request.session &&
    operation.operationKey === request.operationKey &&
    tenantIdEquals(operation.tenant, request.binding.tenant)
  )
}
function validReceipt(value: Receipt, request: SubmitRequest) {
  return (
    requested(value.operation, request) &&
    scoped(value.source, request) &&
    compareInteger(value.position, value.source.tail) <= 0
  )
}
export function readSubmittedReply(value: unknown, request: SubmitRequest) {
  const checked = submitted.safeParse(value)
  if (!checked.success) return undefined
  const result = checked.data
  if ('failure' in result) return result
  if (result.kind === 'unknownCommit')
    return requested(result.operation, request) ? result : undefined
  return validReceipt(result.receipt, request) ? result : undefined
}
export function readSubmissionReply(value: unknown, request: SubmitRequest, original: Receipt) {
  const checked = submission.safeParse(value)
  if (!checked.success) return undefined
  const result = checked.data
  if (!('kind' in result) || result.kind !== 'submission') return result
  if (!sameReceipt(result.receipt, original) || !validReceipt(result.receipt, request))
    return undefined
  if (
    result.messageId !== request.message.id ||
    !covers(result.source, original.source) ||
    compareInteger(result.inputPosition, original.position) >= 0 ||
    !validAdmission(result)
  )
    return undefined
  return result
}
function validAdmission(reading: Submission): boolean {
  if (!reading.admission) return true
  return (
    reading.run === null &&
    compareInteger(reading.admission.inputPosition, reading.inputPosition) === 0
  )
}
export function readMessagesReply(value: unknown, reading: Submission) {
  const checked = messages.safeParse(value)
  if (!checked.success) return undefined
  const result = checked.data
  if ('failure' in result) return result
  if (!covers(result.source, reading.source)) return undefined
  let previous = 0 as import('@omne-harness-lite/content-blocks').JsonNumber
  for (const message of result.messages) {
    if (
      compareInteger(message.position, previous) <= 0 ||
      compareInteger(message.position, result.source.tail) > 0
    )
      return undefined
    previous = message.position
  }
  return result
}
function covers(current: SourceToken, saved: SourceToken) {
  return (
    current.session === saved.session &&
    tenantIdEquals(current.tenant, saved.tenant) &&
    current.journalGeneration === saved.journalGeneration &&
    compareInteger(current.tail, saved.tail) >= 0
  )
}
function sameReceipt(current: Receipt, saved: Receipt) {
  const left = current.operation,
    right = saved.operation
  return (
    left.principal === right.principal &&
    left.operation === right.operation &&
    left.session === right.session &&
    left.operationKey === right.operationKey &&
    tenantIdEquals(left.tenant, right.tenant) &&
    compareInteger(current.position, saved.position) === 0 &&
    covers(current.source, saved.source) &&
    covers(saved.source, current.source)
  )
}
