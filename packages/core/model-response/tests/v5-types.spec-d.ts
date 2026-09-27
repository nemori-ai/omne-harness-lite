import { expectTypeOf, it } from 'vitest'
import {
  LosslessNumber,
  type JsonNumber,
  type JsonValue,
  type ContentBlock,
} from '@omne-harness-lite/content-blocks'
import type {
  Cost,
  Usage,
  RunId,
  AttemptId,
  ModelCallId,
  ResponseId as AccountResponseId,
} from '@omne-harness-lite/call-accounts'
import type { FailureCause } from '@omne-harness-lite/loop-extension'
import type {
  AssistantMessage,
  ResponseId as MessageResponseId,
  SelectedBy as MessageSelectedBy,
  CredentialScope as MessageCredentialScope,
  ParameterAdjustment as MessageParameterAdjustment,
} from '@omne-harness-lite/messages'
import type { TenantId } from '@omne-harness-lite/identity-values'
import {
  judgeModelResponse,
  validate,
  type SchemaDefName,
  type ResponseId,
  type ModelResponse,
  type ModelCallRef,
  type ReplyDisposition,
  type SelectedBy,
  type CredentialScope,
  type Route,
  type ParameterAdjustment,
  type ResponseOutcome,
  type UpstreamError,
  type Failure,
  type Timing,
  type RawResponse,
  type RawHeaders,
  type ModelResponseJudgment,
} from '@omne-harness-lite/model-response/v5'
import type { RawResponse as RawResponseV4 } from '@omne-harness-lite/model-response'
import type { RawResponse as RawResponseV3 } from '@omne-harness-lite/model-response/v3'

it('TYPE-HOMES: imported types and the six copy paths remain compatible', () => {
  expectTypeOf<ResponseId>().toEqualTypeOf<AccountResponseId>()
  expectTypeOf<ResponseId>().toEqualTypeOf<MessageResponseId>()
  expectTypeOf<SelectedBy>().toEqualTypeOf<MessageSelectedBy>()
  expectTypeOf<CredentialScope>().toEqualTypeOf<MessageCredentialScope>()
  expectTypeOf<ParameterAdjustment>().toEqualTypeOf<MessageParameterAdjustment>()
  expectTypeOf<ModelResponse['usage']>().toEqualTypeOf<Usage>()
  expectTypeOf<ModelResponse['cost']>().toEqualTypeOf<Cost>()
  expectTypeOf<ModelResponse['dispatch']>().toEqualTypeOf<JsonNumber>()
  expectTypeOf<ModelResponse['attemptId']>().toEqualTypeOf<AttemptId | undefined>()
  expectTypeOf<ModelCallRef['callId']>().toEqualTypeOf<ModelCallId>()
  expectTypeOf<ModelCallRef['runId']>().toEqualTypeOf<RunId | undefined>()
  expectTypeOf<Failure['cause']>().toEqualTypeOf<FailureCause>()
  expectTypeOf<ParameterAdjustment['sent']>().toEqualTypeOf<JsonValue>()
  expectTypeOf(judgeModelResponse(null)).toEqualTypeOf<ModelResponseJudgment>()
  // @ts-expect-error fixed sixteen-definition entry, not an arbitrary caller schema
  const invented: SchemaDefName = 'NewDefinition'
  // @ts-expect-error shape validator requires a definition name and an explicit value
  validate('Failure')
  // @ts-expect-error identifiers are strings, no number IDs
  const responseId: ResponseId = 1
  // @ts-expect-error the canonical FailureCause set is closed
  const cause: Failure['cause'] = 'rate_limited'
  // @ts-expect-error existing TenantId brand cannot be forged by raw identifiers
  const rawTenant: TenantId = { organization: 'org_a', account: 'acc_a' }
  expectTypeOf(invented).toEqualTypeOf<SchemaDefName>()
  expectTypeOf(responseId).toEqualTypeOf<ResponseId>()
  expectTypeOf(cause).toEqualTypeOf<FailureCause>()
  expectTypeOf(rawTenant).toEqualTypeOf<TenantId>()
})

it('TYPE-DEFS: conditional objects, nonempty collections and null distinctions', () => {
  const number: JsonNumber = new LosslessNumber('1e400')
  const selected: SelectedBy = { extension: 'router' }
  const scope: CredentialScope = { layer: 'factory' }
  const adjustment: ParameterAdjustment = { name: 'x', requested: null, sent: number }
  const outcome: ResponseOutcome = 'truncated'
  const upstream: UpstreamError = { raw: null }
  const raw: RawResponse = { headers: {} }
  const failure: Failure = { cause: 'request_rejected', inBand: true, statusCode: number }
  const timing: Timing = { sentAt: '2026-09-26T00:00:00Z', endedAt: '2026-09-26T00:00:01Z' }
  const disposition: ReplyDisposition = { vetoed: { by: 'x' } }
  expectTypeOf(selected).toExtend<SelectedBy>()
  expectTypeOf(scope).toExtend<CredentialScope>()
  expectTypeOf(adjustment).toEqualTypeOf<ParameterAdjustment>()
  expectTypeOf(outcome).toExtend<ResponseOutcome>()
  expectTypeOf(upstream).toExtend<UpstreamError>()
  expectTypeOf(raw).toExtend<RawResponse>()
  expectTypeOf(failure).toExtend<Failure>()
  expectTypeOf(timing).toEqualTypeOf<Timing>()
  expectTypeOf(disposition).toExtend<ReplyDisposition>()
  // @ts-expect-error missing status cannot assert inBand
  const noStatus: Failure = { cause: 'request_rejected', inBand: true }
  // @ts-expect-error optional-never cannot be bypassed with own undefined
  const undefinedInBand: Failure = { cause: 'request_rejected', inBand: undefined }
  // @ts-expect-error upstream error must own at least one trace member
  const emptyUpstream: UpstreamError = {}
  // @ts-expect-error raw response must own at least one trace member
  const emptyRaw: RawResponse = {}
  // @ts-expect-error requested absent differs from requested null
  const noRequested: ParameterAdjustment = { name: 'x', sent: null }
  // @ts-expect-error scope has no organization-only credential branch
  const organizationScope: CredentialScope = { layer: 'organization', organization: 'org_a' }
  // @ts-expect-error all sixteen defs use JSON number representation, not bigint
  const invalidAmount: Failure = { cause: 'request_rejected', statusCode: 1n }
  expectTypeOf(noStatus).toExtend<Failure>()
  expectTypeOf(undefinedInBand).toExtend<Failure>()
  expectTypeOf(emptyUpstream).toExtend<UpstreamError>()
  expectTypeOf(emptyRaw).toExtend<RawResponse>()
  expectTypeOf(noRequested).toEqualTypeOf<ParameterAdjustment>()
  expectTypeOf(organizationScope).toExtend<CredentialScope>()
  expectTypeOf(invalidAmount).toExtend<Failure>()
})

declare const route: Route
declare const usage: Usage
declare const cost: Cost
declare const assistant: Extract<AssistantMessage, { readonly ending: 'complete' }>
declare const content: ContentBlock
const opened = {
  sentAt: '2026-09-26T00:00:00Z',
  firstTokenAt: '2026-09-26T00:00:01Z',
  endedAt: '2026-09-26T00:00:02Z',
}
const unopened = { sentAt: '2026-09-26T00:00:00Z', endedAt: '2026-09-26T00:00:02Z' }
it('TYPE-S13: seven conditions and seven forbidden combinations', () => {
  const base = { id: 'r', call: { callId: 'c' }, dispatch: 1, route, usage, cost }
  const complete: ModelResponse = {
    ...base,
    outcome: 'complete',
    reply: { ...assistant, ending: 'complete' },
    replyDisposition: 'persisted',
    timing: opened,
  }
  const truncated: ModelResponse = {
    ...base,
    outcome: 'truncated',
    reply: { ...assistant, ending: 'truncated_at_limit' },
    replyDisposition: 'persisted',
    timing: opened,
  }
  const interruptedReply: ModelResponse = {
    ...base,
    outcome: 'interrupted',
    initiator: 'user',
    reply: { ...assistant, ending: 'interrupted_by_user' },
    replyDisposition: 'persisted',
    timing: opened,
  }
  const interruptedOpened: ModelResponse = {
    ...base,
    outcome: 'interrupted',
    initiator: 'runtime_lost',
    delivered: [content],
    timing: opened,
  }
  const interruptedUnopened: ModelResponse = {
    ...base,
    outcome: 'interrupted',
    initiator: 'run_cancelled',
    timing: unopened,
  }
  const failedBefore: ModelResponse = {
    ...base,
    outcome: 'failed',
    failure: { cause: 'request_rejected' },
    timing: unopened,
  }
  const failedAfter: ModelResponse = {
    ...base,
    outcome: 'failed',
    failure: { cause: 'interrupted_mid_reply' },
    delivered: [content],
    timing: opened,
  }
  for (const value of [
    complete,
    truncated,
    interruptedReply,
    interruptedOpened,
    interruptedUnopened,
    failedBefore,
    failedAfter,
  ])
    expectTypeOf(value).toExtend<ModelResponse>()
  // @ts-expect-error success must own a reply
  const noReply: ModelResponse = { ...base, outcome: 'complete', timing: opened }
  // @ts-expect-error runtime_lost cannot hold a reply
  const lostReply: ModelResponse = { ...interruptedReply, initiator: 'runtime_lost' }
  // @ts-expect-error failed-opened must own nonempty delivered
  const noDelivered: ModelResponse = {
    ...base,
    outcome: 'failed',
    failure: { cause: 'interrupted_mid_reply' },
    timing: opened,
  }
  // @ts-expect-error failure after first token must use interrupted_mid_reply
  const wrongCause: ModelResponse = {
    ...base,
    outcome: 'failed',
    failure: { cause: 'request_rejected' },
    delivered: [content],
    timing: opened,
  }
  // @ts-expect-error delivered cannot be retained without first token
  const unopenedDelivered: ModelResponse = { ...interruptedUnopened, delivered: [content] }
  // @ts-expect-error no-run response cannot assert own late even undefined
  const noRunLate: ModelResponse = { ...complete, late: undefined }
  // @ts-expect-error run context must supply an attempt
  const missingAttempt: ModelResponse = { ...complete, call: { callId: 'c', runId: 'r' } }
  // @ts-expect-error empty adjustment list is not absent
  const emptyAdjustments: Route = { ...route, parameterAdjustments: [] }
  // @ts-expect-error empty drop list is not absent
  const emptyDrops: Route = { ...route, droppedParameters: [] }
  for (const value of [
    noReply,
    lostReply,
    noDelivered,
    wrongCause,
    unopenedDelivered,
    noRunLate,
    missingAttempt,
  ])
    expectTypeOf(value).toExtend<ModelResponse>()
  expectTypeOf(emptyAdjustments).toEqualTypeOf<Route>()
  expectTypeOf(emptyDrops).toEqualTypeOf<Route>()
})

it('MR5 types preserve ordered mixed headers without widening retained versions', () => {
  const headers: RawHeaders = { one: 'a,b', many: ['second', 'first', 'first', ''], empty: [] }
  const raw: RawResponse = { headers }
  expectTypeOf(raw).toExtend<RawResponse>()
  // @ts-expect-error arbitrary numeric header values are not accepted
  const wrong: RawHeaders = { count: 2 }
  // @ts-expect-error mixed arrays must contain only strings
  const mixed: RawHeaders = { count: ['ok', 2] }
  // @ts-expect-error MR4 root still accepts only strings
  const oldRoot: RawResponseV4 = { headers: { count: ['ok'] } }
  // @ts-expect-error retained v3 still accepts only strings
  const oldV3: RawResponseV3 = { headers: { count: ['ok'] } }
  // @ts-expect-error raw cannot be empty, even with the new headers domain
  const empty: RawResponse = {}
  expectTypeOf(wrong).toExtend<RawHeaders>()
  expectTypeOf(mixed).toExtend<RawHeaders>()
  expectTypeOf(oldRoot).toExtend<RawResponseV4>()
  expectTypeOf(oldV3).toExtend<RawResponseV3>()
  expectTypeOf(empty).toExtend<RawResponse>()
})
