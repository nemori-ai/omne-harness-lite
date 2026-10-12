import { describe, expect, it } from 'vitest'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { LosslessNumber, type JsonObject } from '@omne-harness-lite/content-blocks'
import {
  judgeModelInvocationRecord,
  type ModelCallAccountingWitness,
  type ModelCallAcknowledgedRecord,
} from '@omne-harness-lite/messages'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'
import {
  acknowledgedAttempts,
  acknowledgedFactsFromHistory,
  attemptFromFinal,
  type AcknowledgedDispatch,
  type CallHistoryKnown,
} from '../src/index.ts'
import {
  capture,
  dispatched,
  jsonObject,
  located,
  opened,
  prepare,
  response,
  session,
  tenant,
} from './log-codec-fixture.ts'

function isResponse(value: unknown): value is ModelResponse {
  return 'ok' in judgeModelResponse(value)
}

function finalResponse(value: JsonObject = response): ModelResponse {
  if (!isResponse(value)) throw new Error('response fixture')
  return value
}

const entry = located(prepare('response', response, { kind: 'response' }), 3)
const final = attemptFromFinal(finalResponse(), entry)
const witness: ModelCallAccountingWitness = {
  response: 'response',
  dispatch: new LosslessNumber('1.00'),
  readyPosition: 3,
  payload: { kind: 'reply_ready', locator: 'ready', version: 'one', digest: 'a'.repeat(64) },
  origin: { tenant, session },
  outcome: 'complete',
  usage: final.usage,
  cost: final.cost,
  credentialScope: final.credentialScope,
  provider: final.provider,
  timing: {
    sentAt: '2026-09-27T00:00:00Z',
    firstTokenAt: '2026-09-27T00:00:01Z',
    endedAt: '2026-09-27T00:00:02Z',
  },
}

function ack(accountingWitness?: ModelCallAccountingWitness): ModelCallAcknowledgedRecord {
  const result = judgeModelInvocationRecord({
    kind: 'model_call_acknowledged',
    call: 'call',
    creationKey: 'creation',
    creationInput: { role: 'model-call-creation-semantic-sha256/v1', hex: 'b'.repeat(64) },
    acknowledgedAt: '2026-09-27T00:00:03Z',
    releasablePayloads: [],
    target: { kind: 'response', response: 'response' },
    terminalState: 'complete',
    ...(accountingWitness === undefined
      ? {}
      : {
          accountingWitness,
          retainedResultDigest: {
            role: 'model-call-retained-result-semantic-sha256/v1',
            hex: 'c'.repeat(64),
          },
        }),
  })
  if (!('ok' in result) || result.ok.kind !== 'model_call_acknowledged')
    throw new Error('ACK fixture')
  return result.ok
}

const dispatch: AcknowledgedDispatch = { response: 'response', dispatch: 1, final }
const source = { generation: Object.freeze({}), progress: 5 }
const ref = { session, callId: 'call' }

function history(record = ack(), responseValue: JsonObject | null = response): CallHistoryKnown {
  const d = capture('record', dispatched).record
  const r = capture('response', response).response
  const ready = capture('record', {
    kind: 'model_call_reply_ready',
    call: 'call',
    response: 'response',
    dispatch: 1,
    payload: witness.payload,
    readyAt: '2026-09-27T00:00:02Z',
  }).record
  if (ready?.kind !== 'model_call_reply_ready') throw new Error('ready fixture')
  if (d?.kind !== 'model_call_dispatched' || r === null) throw new Error('history fixture')
  return {
    session,
    callId: 'call',
    phase: 'complete',
    intent: null,
    ending: null,
    acknowledged: {
      record,
      entry: located(prepare('record', record, { kind: 'record' }), 5),
    },
    dispatches: [
      {
        ordinal: 1,
        record: d,
        dispatched: located(prepare('record', dispatched, { kind: 'record' }), 1),
        opened: located(prepare('record', opened, { kind: 'record' }), 2),
        ready: { record: ready, entry: located(prepare('record', ready, { kind: 'record' }), 3) },
        response:
          responseValue === null
            ? null
            : { value: responseValue, projection: r, entry: { ...entry, position: 4 } },
      },
    ],
  }
}

function expectSmall(attempt: unknown) {
  for (const key of [
    'reply',
    'delivered',
    'raw',
    'route',
    'inputCalibration',
    'parameters',
    'profile',
    'profileSnapshot',
    'payload',
    'retainedResultDigest',
  ])
    expect(attempt).not.toHaveProperty(key)
}

describe('SPEC ACK small-account view and unique original-account selection', () => {
  it('preserves complete final account facts and exact cost without leaking response content', () => {
    const value = attemptFromFinal(finalResponse(), entry)
    expect(value).toEqual({
      response: 'response',
      dispatch: 1,
      origin: { tenant, session },
      usage: {
        input_tokens: 11,
        output_tokens: 5,
        cache_read_tokens: 'unknown',
        cache_write_tokens: 0,
        source: 'upstream',
      },
      cost: {
        cost_usd: new LosslessNumber('0.0000000000000000000000000310'),
        source: 'upstream_usage',
      },
      credentialScope: { layer: 'factory' },
      provider: 'first',
      timing: witness.timing,
      outcome: 'complete',
      disposition: 'final',
      replyDisposition: 'persisted',
    })
    if (value.cost.cost_usd === 'unknown') throw new Error('known fixture cost')
    expect(
      ExactDecimal.from(value.cost.cost_usd).compare(
        ExactDecimal.from(new LosslessNumber('31e-27')),
      ),
    ).toBe(0)
    expect(Object.isFrozen(value)).toBe(true)
    expect(Object.isFrozen(value.origin)).toBe(true)
    expectSmall(value)
  })

  it('retains interrupted initiator, late status, original Run shell and upstream request identity', () => {
    const raw: JsonObject = {
      ...response,
      call: { callId: 'call', runId: 'original-run' },
      attemptId: 2,
      late: true,
      outcome: 'interrupted',
      initiator: 'user',
      reply: { ...jsonObject(response.reply), ending: 'interrupted_by_user' },
      route: { ...jsonObject(response.route), upstreamRequestId: 'original-request' },
    }
    const value = attemptFromFinal(finalResponse(raw), {
      ...entry,
      run: 'original-run',
      attempt: 2,
    })
    expect(value).toMatchObject({
      outcome: 'interrupted',
      initiator: 'user',
      late: true,
      upstreamRequestId: 'original-request',
      origin: { tenant, session, run: 'original-run', attempt: 2 },
      disposition: 'final',
      replyDisposition: 'persisted',
    })
    expectSmall(value)
  })

  it('keeps failed dispatches before the final reply without inventing disposition or losing their costs', () => {
    const { reply: _reply, replyDisposition: _disposition, ...base } = response
    const failed = attemptFromFinal(
      finalResponse({
        ...base,
        id: 'earlier-failure',
        dispatch: 1,
        outcome: 'failed',
        failure: { cause: 'upstream_unavailable' },
        timing: { sentAt: '2026-09-27T00:00:00Z', endedAt: '2026-09-27T00:00:00Z' },
      }),
      entry,
    )
    const result = acknowledgedAttempts(ack(), [
      { response: 'earlier-failure', dispatch: 1, final: failed },
      { response: 'response', dispatch: 2, final: { ...final, dispatch: 2 } },
    ])
    expect(result).toEqual([failed, { ...final, dispatch: 2 }])
    expect(result?.[0]?.outcome).toBe('failed')
    expect(result?.[0]).not.toHaveProperty('replyDisposition')
    expect(result?.[0]?.cost).toEqual(final.cost)
    expectSmall(result?.[0])
    expect(Object.isFrozen(result)).toBe(true)
  })

  it('selects the durable final once and permits different legal account shells', () => {
    const readyWitness = { ...witness, origin: { tenant, session, run: 'earlier-run', attempt: 1 } }
    const result = acknowledgedAttempts(ack(readyWitness), [dispatch])
    expect(result).toEqual([final])
    expect(result?.[0]).toBe(final)
    expect(result).toHaveLength(1)
    expect(result?.[0]?.origin).toEqual({ tenant, session })
    expect(result?.[0]?.disposition).toBe('final')
  })

  it('uses matching ACK accounting facts for a released ready result and preserves only its small pending view', () => {
    const result = acknowledgedAttempts(ack(witness), [{ ...dispatch, final: null }])
    expect(result).toHaveLength(1)
    expect(result?.[0]).toMatchObject({
      response: 'response',
      dispatch: new LosslessNumber('1.00'),
      outcome: 'complete',
      disposition: 'disposition_pending',
      origin: { tenant, session },
      cost: { cost_usd: new LosslessNumber('0.0000000000000000000000000310') },
    })
    expect(result?.[0]).not.toHaveProperty('replyDisposition')
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result?.[0])).toBe(true)
    expectSmall(result?.[0])
  })

  it('rejects the entire sequence when a later dispatch has no final or accounting witness', () => {
    expect(
      acknowledgedAttempts(ack(), [dispatch, { response: 'missing', dispatch: 2, final: null }]),
    ).toBeUndefined()
    expect(
      acknowledgedAttempts(ack(witness), [{ response: 'other', dispatch: 1, final: null }]),
    ).toBeUndefined()
    expect(
      acknowledgedAttempts(ack(witness), [{ ...dispatch, dispatch: 2, final: null }]),
    ).toBeUndefined()
    expect(acknowledgedAttempts(ack(witness), [])).toBeUndefined()
    expect(acknowledgedAttempts(ack(), [])).toEqual([])
  })

  it('rejects final identity, dispatch and original-account contradictions before applying final priority', () => {
    expect(
      acknowledgedAttempts(ack(), [{ ...dispatch, final: { ...final, response: 'different' } }]),
    ).toBeUndefined()
    expect(
      acknowledgedAttempts(ack(), [{ ...dispatch, final: { ...final, dispatch: 2 } }]),
    ).toBeUndefined()
    const conflicting = {
      ...witness,
      cost: { ...witness.cost, cost_usd: new LosslessNumber('0.0000000000000000000000000311') },
    }
    expect(acknowledgedAttempts(ack(conflicting), [dispatch])).toBeUndefined()
    expect(
      acknowledgedAttempts(ack(witness), [
        { response: 'other', dispatch: 1, final: { ...final, response: 'other' } },
      ]),
    ).toBeUndefined()
  })

  it('compares dispatch ordinals exactly instead of rounding adjacent integers above the safe-number limit', () => {
    const large = new LosslessNumber('9007199254740992')
    const next = new LosslessNumber('9007199254740993')
    const record = ack({ ...witness, dispatch: large })
    expect(
      acknowledgedAttempts(record, [{ ...dispatch, dispatch: next, final: null }]),
    ).toBeUndefined()
    const matching = acknowledgedAttempts(record, [
      { ...dispatch, dispatch: new LosslessNumber('9007199254740992.0'), final: null },
    ])
    expect(matching?.[0]?.dispatch).toEqual(large)
    expect(matching?.[0]?.disposition).toBe('disposition_pending')
  })

  it('projects acknowledged history to frozen small facts while retaining the exact source and original ACK time', () => {
    const record = ack()
    const value = acknowledgedFactsFromHistory(ref, history(record), source)
    expect(value).toEqual({
      ref,
      record,
      origin: { tenant, session },
      terminalState: 'complete',
      source,
      attempts: [final],
    })
    expect(value?.source).toBe(source)
    expect(value?.record).toBe(record)
    expect(value?.record.acknowledgedAt).toBe('2026-09-27T00:00:03Z')
    expect(value?.ref).not.toBe(ref)
    expect(Object.isFrozen(value?.ref)).toBe(true)
    expect(Object.isFrozen(value)).toBe(true)
    expectSmall(value?.attempts[0])
    expect(value).not.toHaveProperty('dispatches')
    expect(value).not.toHaveProperty('response')
  })

  it('uses the witness after content release and refuses absent ACK, absent accounts or malformed finals', () => {
    const ready = acknowledgedFactsFromHistory(ref, history(ack(witness), null), source)
    expect(ready?.attempts).toHaveLength(1)
    expect(ready?.attempts[0]?.disposition).toBe('disposition_pending')
    expect(ready?.record.accountingWitness?.cost).toEqual(witness.cost)
    expectSmall(ready?.attempts[0])
    expect(
      acknowledgedFactsFromHistory(ref, { ...history(), acknowledged: null }, source),
    ).toBeUndefined()
    expect(acknowledgedFactsFromHistory(ref, history(ack(), null), source)).toBeUndefined()
    expect(
      acknowledgedFactsFromHistory(ref, history(ack(), { id: 'response' }), source),
    ).toBeUndefined()
  })
})
