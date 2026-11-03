// The consumer owner's evidence of an ACK, read before the write fence (handoff-evidence.ts,
// R2-D257). An owner's adapter reads its own durable record, so it answers later: the commands
// await it outside the fence and the write keeps only that answer. Each case is red when the ACK
// takes a confirmation the adapter did not give, asks the adapter for an ACK the write refuses
// anyway, or loses what the adapter needs to find its record (the invocation reference).
import { expect, it } from 'vitest'
import {
  decodeDispatchId,
  type DurableEvidence,
  type ModelFailure,
} from '@omne-harness/model-contract'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { createMemoryModelCommands } from '@omne-harness/model/testing'
import type { HandoffEvidenceInput } from '../src/commands/index.ts'
import { fixture, instance, op, proof, unbox } from './memory-fixture.ts'

type Answer = { ok: DurableEvidence } | { failure: ModelFailure }

/** A settled call whose owner's adapter answers each ACK with what `answer` resolves to, later. */
async function settledWith(answer: (input: HandoffEvidenceInput) => Promise<Answer>) {
  const f = fixture()
  const asked: HandoffEvidenceInput[] = []
  const [adapter] = f.options.evidence
  if (adapter === undefined) throw new Error('fixture adapter')
  Object.assign(f.options, {
    evidence: [
      {
        ...adapter,
        handoff: (input: HandoffEvidenceInput) => {
          asked.push(structuredClone({ ...input, principal: null }))
          return answer(input)
        },
      },
    ],
  })
  const { commands } = createMemoryModelCommands(f.options)
  unbox(await commands.admit(f.admit))
  const execution = unbox(
    await commands.claim({
      ...f.admit,
      operation: op('claim'),
      instance: instance(),
      continuity: proof(f.admit.call),
    }),
  )
  const dispatch = unbox(decodeDispatchId('mdisp_one'))
  let serial = 0
  const write = async () => ({
    ...execution,
    operation: op(`write-${++serial}`),
    expected: unbox(await commands.loadRecovery(f.admit)).state.revision,
  })
  unbox(
    await commands.prepareDispatch({
      ...(await write()),
      dispatch,
      supplier: f.admit.request.suppliers[0],
      policyDecision: null,
    }),
  )
  unbox(await commands.openReceiveWindow({ ...(await write()), dispatch, window: 'window' }))
  const facts: TransportFact[] = [
    { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
    { kind: 'block-delta', index: '0', delta: 'saved' },
    { kind: 'ended', termination: { kind: 'completed', reason: 'limit' } },
  ]
  unbox(await commands.preserve({ ...(await write()), dispatch, window: 'window', facts }))
  const settlement = unbox(
    await commands.settle({
      ...(await write()),
      termination: { kind: 'completed', reason: 'limit' },
    }),
  )
  const custody = proof(`${f.admit.call}/${settlement.version}`, 'consumer')
  const ack = {
    ...f.admit,
    operation: op('ack'),
    result: settlement.version,
    evidence: { kind: 'retained' as const, custody },
  }
  const state = async () => unbox(await commands.loadRecovery(f.admit)).state.custody
  return { f, commands, asked, ack, custody, settlement, state }
}

it('acknowledges on a confirmation the adapter gives later, with the reference of the call', async () => {
  const s = await settledWith(async input => {
    await new Promise(resolve => setTimeout(resolve, 5))
    return input.evidence.kind === 'retained'
      ? { ok: input.evidence.custody }
      : { failure: { kind: 'handoff-invalid', reason: 'kind' } }
  })
  const receipt = unbox(await s.commands.handoff(s.ack))
  expect(receipt.custody).toMatchObject({ kind: 'acknowledged', receipt: s.custody })
  // The adapter is asked once, with what names the saved delivery: the invocation reference of the
  // call and its result version.
  expect(s.asked).toHaveLength(1)
  expect(s.asked[0]).toMatchObject({
    call: s.f.admit.call,
    reference: s.f.reference,
    result: s.settlement.version,
    consumer: s.f.admit.consumer,
  })
})

it('keeps the custody when the adapter answers unavailable later, and the same operation acknowledges once it confirms', async () => {
  let available = false
  const s = await settledWith(input =>
    Promise.resolve(
      available && input.evidence.kind === 'retained'
        ? { ok: input.evidence.custody }
        : {
            failure: {
              kind: 'unavailable',
              dependency: 'consumer-evidence',
              diagnostic: 'record-unreadable',
            },
          },
    ),
  )
  expect(await s.commands.handoff(s.ack)).toEqual({
    failure: {
      kind: 'unavailable',
      dependency: 'consumer-evidence',
      diagnostic: 'record-unreadable',
    },
  })
  expect(await s.state()).toEqual({ kind: 'producer' })
  available = true
  expect(unbox(await s.commands.handoff(s.ack)).custody.kind).toBe('acknowledged')
})

it('does not ask the adapter for an ACK the write refuses before the evidence', async () => {
  const s = await settledWith(input =>
    Promise.resolve(
      input.evidence.kind === 'retained'
        ? { ok: input.evidence.custody }
        : { failure: { kind: 'handoff-invalid', reason: 'kind' } },
    ),
  )
  const other = { ...s.custody, owner: 'another-owner' }
  expect(
    await s.commands.handoff({
      ...s.ack,
      operation: op('ack-foreign'),
      evidence: { kind: 'retained', custody: other },
    }),
  ).toEqual({ failure: { kind: 'handoff-invalid', reason: 'consumer-owner' } })
  s.f.denied.add('handoff')
  expect(await s.commands.handoff({ ...s.ack, operation: op('ack-denied') })).toMatchObject({
    failure: { kind: 'denied' },
  })
  expect(s.asked).toEqual([])
  expect(await s.state()).toEqual({ kind: 'producer' })
})
