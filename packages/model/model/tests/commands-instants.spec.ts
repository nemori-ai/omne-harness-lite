import { describe, expect, it } from 'vitest'
import {
  decodeDispatchId,
  type DispatchId,
  type DispatchRecord,
  type ModelOperationId,
} from '@omne-harness/model-contract'
import type { TransportFact, WriteContext } from '@omne-harness/model-contract/provider'
import { createMemoryModelCommands } from '@omne-harness/model/testing'
import { fixture, instance, op, proof, unbox } from './memory-fixture.ts'

const T0 = '2026-10-19T00:00:00.000Z'
const T1 = '2026-10-19T00:00:01.000Z'
const T2 = '2026-10-19T00:00:02.000Z'
const open: TransportFact = { kind: 'block-open', index: '0', mode: 'append', content: 'text' }
const delta = (text: string): TransportFact => ({ kind: 'block-delta', index: '0', delta: text })
const retry = (reason: string): TransportFact =>
  ({ kind: 'connect-retry', reason }) as TransportFact
const response = (request: unknown): TransportFact =>
  ({ kind: 'response', request }) as TransportFact

let operations = 0
const next = (): ModelOperationId => op(`instants-${String((operations += 1))}`)

async function prepared() {
  const f = fixture()
  const { commands } = createMemoryModelCommands(f.options)
  const access = { principal: f.principal, tenant: f.tenant, call: f.admit.call }
  unbox(await commands.admit(f.admit))
  const execution = unbox(
    await commands.claim({
      ...access,
      instance: instance(),
      operation: next(),
      continuity: proof(f.admit.call),
    }),
  )
  const write = async (): Promise<WriteContext> => ({
    ...execution,
    operation: next(),
    expected: unbox(await commands.loadRecovery(access)).state.revision,
  })
  const dispatch: DispatchId = unbox(decodeDispatchId('mdisp_instants'))
  const supplier = f.admit.request.suppliers[0]
  unbox(
    await commands.prepareDispatch({
      ...(await write()),
      dispatch,
      supplier,
      policyDecision: null,
    }),
  )
  const record = async (): Promise<DispatchRecord | undefined> =>
    unbox(await commands.dispatches(access)).find(item => item.dispatch === dispatch)
  const send = async (state: 'started' | 'unknown' | 'not-sent') =>
    commands.recordSend({ ...(await write()), dispatch, state })
  const materialize = async () =>
    unbox(
      await commands.recordMaterialization({
        ...(await write()),
        dispatch,
        receipt: {
          supplier: supplier.adoption,
          representation: f.admit.request.representation,
          payloadDigest: 'a'.repeat(64),
        },
        window: 'w-1',
      }),
    )
  const deliver = async (facts: readonly TransportFact[], arrivals?: readonly unknown[]) =>
    commands.preserve({
      ...(await write()),
      dispatch,
      window: 'w-1',
      facts,
      ...(arrivals === undefined ? {} : { arrivals: arrivals as readonly (string | null)[] }),
    })
  return { f, record, send, materialize, deliver }
}

async function started() {
  const subject = await prepared()
  await subject.materialize()
  unbox(await subject.send('started'))
  return subject
}

describe('the moments a batch of facts keeps', () => {
  it('takes the response moment from the response fact, not from an earlier fact of the batch', async () => {
    const s = await started()
    unbox(await s.deliver([retry('connect-failed'), response('gen-1')], [T1, T2]))
    expect((await s.record())?.instants?.responseStarted).toBe(T2)
  })

  it('keeps no first-content moment from a later fact when the fact that showed content had none', async () => {
    const s = await started()
    unbox(await s.deliver([open, delta('a'), delta('b')], [T1, null, T2]))
    expect((await s.record())?.instants?.firstContent).toBeNull()
  })

  it('keeps every connect retry in order', async () => {
    const s = await started()
    unbox(await s.deliver([retry('connect-failed'), retry('connect-timeout')]))
    expect((await s.record())?.connectRetries).toEqual(['connect-failed', 'connect-timeout'])
  })

  it('keeps a request identity of exactly 256 bytes', async () => {
    const s = await started()
    unbox(await s.deliver([response('g'.repeat(256))]))
    expect((await s.record())?.request).toBe('g'.repeat(256))
  })

  it.each([
    [
      'a connect retry of another reason',
      [retry('dns')],
      { field: 'connect-retry', reason: 'reason' },
    ],
    [
      'a response whose identity is not text',
      [response(42)],
      { field: 'response', reason: 'request' },
    ],
  ])('refuses %s', async (_name, facts, failure) => {
    const s = await started()
    expect(await s.deliver(facts)).toEqual({ failure: { kind: 'invalid', ...failure } })
  })

  it.each([
    ['one arrival that is not an instant among good ones', [T1, 'yesterday']],
    ['an arrival that is not text', [T1, 42]],
  ])('refuses %s, and keeps nothing of the batch', async (_name, arrivals) => {
    const s = await started()
    expect(await s.deliver([open, delta('a')], arrivals)).toEqual({
      failure: { kind: 'invalid', field: 'arrivals', reason: 'shape' },
    })
    expect((await s.record())?.firstContent).toBe('uncertain')
  })
})

describe('the send state and its moment', () => {
  it('keeps the first send moment when the start is recorded again', async () => {
    const s = await prepared()
    await s.materialize()
    s.f.advance(T1)
    unbox(await s.send('started'))
    s.f.advance(T2)
    unbox(await s.send('started'))
    expect((await s.record())?.instants).toMatchObject({ prepared: T0, sent: T1 })
  })

  it('refuses to move a started send back, and to start a send that was not materialized', async () => {
    const s = await started()
    expect(await s.send('unknown')).toEqual({
      failure: { kind: 'invalid', field: 'state', reason: 'started-cannot-regress' },
    })
    const fresh = await prepared()
    expect(await fresh.send('started')).toEqual({
      failure: { kind: 'invalid', field: 'dispatch', reason: 'not-materialized' },
    })
    expect((await fresh.record())?.instants?.sent).toBeNull()
  })
})
