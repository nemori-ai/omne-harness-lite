import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { tenantCodec } from '@omne-harness/legal-identity'
import { judgeContentBlock } from '@omne-harness/content-block'
import { judgeMessage, parseMessageId, parseRecordEntryRef } from '@omne-harness/message'
import {
  OVER_LIMIT_METRICS,
  decodeModelCallId,
  judgeModelParameters,
  judgeToolDeclarations,
  profileResolutionValue,
  readProfileResolution,
} from '@omne-harness/model-contract'
import { z } from 'zod'
import type {
  CompactionHandoff,
  CompactionInput,
  CompactionOutcome,
  CompactionRequest,
  CompactionTaskRef,
  CompactionTaskState,
} from './compaction.ts'
import {
  decodeActionId,
  decodeCompactionOperationId,
  decodeCompactionTaskId,
  judgeAdoption,
  judgeEvidence,
  type StructureFailure,
} from './identity.ts'

function checked<T>(parse: (value: unknown) => Outcome<T, unknown>) {
  return z.unknown().transform((value, ctx) => {
    const parsed = parse(value)
    if ('ok' in parsed) return parsed.ok
    ctx.addIssue({ code: 'custom', message: 'invalid domain value' })
    return z.NEVER
  })
}
const text = z.string().min(1)
const integer = z.string().regex(/^(0|[1-9][0-9]*)$/u)
const adopted = checked(judgeAdoption)
const evidence = checked(judgeEvidence)
const entryRef = checked(value => {
  const parsed = typeof value === 'string' ? parseRecordEntryRef(value) : null
  return parsed === null ? fail('entry') : succeed(parsed)
})
const messageId = checked(value => {
  const parsed = typeof value === 'string' ? parseMessageId(value) : null
  return parsed?.ok ? succeed(parsed.value) : fail('message-id')
})
const message = checked(value => {
  const parsed = judgeMessage(value)
  return 'ok' in parsed ? parsed : fail(parsed.rejected)
})
const summary = checked(value => {
  const parsed = judgeMessage(value)
  return 'ok' in parsed && parsed.ok.role === 'compaction' ? succeed(parsed.ok) : fail('compaction')
})
const tenant = checked(value => {
  const parsed = typeof value === 'string' ? tenantCodec.parse(value) : null
  return parsed?.ok ? succeed(parsed.value) : fail('tenant')
})
const taskRef = z.strictObject({
  authority: text,
  tenant,
  task: checked(decodeCompactionTaskId),
  requestDigest: text,
})
const consumer = z.strictObject({ owner: text, work: text, position: text, purpose: text })
const pairing = z.strictObject({ result: entryRef, call: entryRef.nullable() })
const base = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('initial'), pairings: z.array(pairing) }),
  z.strictObject({ kind: z.literal('previous'), record: entryRef, pairings: z.array(pairing) }),
])
const history = z.strictObject({
  source: evidence,
  origin: entryRef,
  upper: entryRef,
  epoch: text,
  base,
  entries: z.array(
    z
      .strictObject({
        ref: entryRef,
        sequence: integer,
        message,
        sourceCall: checked(decodeModelCallId).optional(),
        represented: z.array(message),
      })
      .transform(({ sourceCall, ...entry }) =>
        sourceCall === undefined ? entry : { ...entry, sourceCall },
      ),
  ),
  logOrder: z.array(entryRef),
  barriers: z.array(entryRef),
  protected: z.array(entryRef),
})
const frame = z.strictObject({
  system: z.array(
    checked(value => {
      const parsed = judgeContentBlock(value)
      return 'ok' in parsed ? parsed : fail(parsed.rejected)
    }),
  ),
  tools: checked(judgeToolDeclarations),
})
const selectedProfile = checked(value => {
  const parsed = readProfileResolution(value, 'llm')
  return 'ok' in parsed && parsed.ok.kind === 'resolved' && parsed.ok.selectable
    ? succeed({ ...parsed.ok, selectable: true as const })
    : fail('profile')
})
const input = z.strictObject({
  outputMessageId: messageId,
  history,
  frame,
  target: z.strictObject({
    profile: selectedProfile,
    parameters: checked(judgeModelParameters),
    representation: adopted,
    measurement: adopted,
    goals: z.array(
      z.strictObject({
        metric: z.enum(OVER_LIMIT_METRICS),
        relation: z.enum(['less-than', 'at-most']),
        limit: integer,
      }),
    ),
  }),
})
const request = z.strictObject({
  ref: taskRef,
  provider: adopted,
  consumer,
  preparation: checked(decodeActionId),
  input,
})
const resultIdentity = z.strictObject({ version: text, evidence, digest: text })
const operation = checked(decodeCompactionOperationId)
const outcome = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('completed'), message: summary }),
  z.strictObject({
    kind: z.literal('cannot-fit'),
    reason: z.enum(['protected-floor', 'after-compaction']),
    diagnostic: text,
  }),
  z.strictObject({
    kind: z.literal('failed'),
    reason: z.enum(['execution-failed', 'execution-limit', 'invalid-output', 'source-lost']),
    diagnostic: text,
  }),
  z.strictObject({ kind: z.literal('cancelled'), operation }),
])
const head = {
  ref: taskRef,
  revision: integer,
  physical: z.enum(['pending', 'settled', 'unknown']),
}
const state = z.discriminatedUnion('phase', [
  z.strictObject({
    ...head,
    phase: z.literal('pending'),
    knowledge: z.enum(['accepted', 'uncertain']),
  }),
  z.strictObject({
    ...head,
    phase: z.literal('terminal'),
    result: resultIdentity,
    outcome,
    custody: z.literal('provider'),
  }),
  z.strictObject({
    ...head,
    phase: z.literal('handed-off'),
    result: resultIdentity,
    receipt: evidence,
  }),
])
const handoff = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('retained'), consumer, custody: evidence }),
  z.strictObject({
    kind: z.literal('processed'),
    consumer,
    disposition: z.enum(['adopted', 'excluded', 'failed']),
    completion: evidence,
  }),
])

function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
function decode<T>(schema: z.ZodType<T>, text: string): Outcome<T, StructureFailure> {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return fail({ field: '', reason: 'type' })
  }
  const parsed = schema.safeParse(value)
  return parsed.success
    ? succeed(freeze(parsed.data))
    : fail({
        field: parsed.error.issues[0]?.path.join('/') ?? '',
        reason: 'type',
      })
}
function refValue(ref: CompactionTaskRef): Outcome<unknown, StructureFailure> {
  const tenant = tenantCodec.encode(ref.tenant)
  return tenant.ok
    ? succeed({ ...ref, tenant: tenant.value })
    : fail({ field: 'ref/tenant', reason: 'identity' })
}
function inputValue(input: CompactionInput): Outcome<unknown, StructureFailure> {
  const profile = profileResolutionValue(input.target.profile)
  return 'ok' in profile
    ? succeed({ ...input, target: { ...input.target, profile: profile.ok } })
    : fail({ field: `target/profile/${profile.failure.field}`, reason: 'type' })
}

export function encodeCompactionRequest(
  request: CompactionRequest,
): Outcome<string, StructureFailure> {
  const ref = refValue(request.ref)
  if ('failure' in ref) return ref
  const input = inputValue(request.input)
  return 'failure' in input
    ? input
    : succeed(JSON.stringify({ ...request, ref: ref.ok, input: input.ok }))
}
export function decodeCompactionRequest(
  text: string,
): Outcome<CompactionRequest, StructureFailure> {
  return decode(request, text)
}
export function encodeCompactionInput(input: CompactionInput): Outcome<string, StructureFailure> {
  const value = inputValue(input)
  return 'failure' in value ? value : succeed(JSON.stringify(value.ok))
}
export function decodeCompactionInput(text: string): Outcome<CompactionInput, StructureFailure> {
  return decode(input, text)
}
export function encodeCompactionTaskState(
  state: CompactionTaskState,
): Outcome<string, StructureFailure> {
  const ref = refValue(state.ref)
  return 'failure' in ref ? ref : succeed(JSON.stringify({ ...state, ref: ref.ok }))
}
export function decodeCompactionTaskState(
  text: string,
): Outcome<CompactionTaskState, StructureFailure> {
  return decode(state, text)
}
export function encodeCompactionTaskRef(ref: CompactionTaskRef): Outcome<string, StructureFailure> {
  const value = refValue(ref)
  return 'failure' in value ? value : succeed(JSON.stringify(value.ok))
}
export function decodeCompactionTaskRef(
  text: string,
): Outcome<CompactionTaskRef, StructureFailure> {
  return decode(taskRef, text)
}
export function decodeCompactionHandoff(
  text: string,
): Outcome<CompactionHandoff, StructureFailure> {
  return decode(handoff, text)
}
export function decodeCompactionOutcome(
  text: string,
): Outcome<CompactionOutcome, StructureFailure> {
  return decode(outcome, text)
}
