// The evidence adapter of the Agent consumer owner for a Model ACK (R2-D257). It confirms the
// retained evidence of an ACK only from the record this owner's receiver committed for the same
// delivery. Red when the adapter and the receiver disagree on where the record is (the derived
// reception operation), when it confirms a record that differs in any part, or when a failed or
// missing read becomes a confirmation.
import { describe, expect, it } from 'vitest'
import {
  createAgentCustodyEvidence,
  createAgentModelReceiver,
  createModelReceiverState,
  agentEvaluator,
  type AgentCustodyQuestion,
  type ModelReceiverDependencies,
} from '@omne-harness/agent'
import {
  decodeResultVersion,
  resolveModelInvocationRef,
  type DurableEvidence,
} from '@omne-harness/model-contract'
import type { AgentReceivedRecords } from '@omne-harness/agent-contract'
import { createExecutionCoordinator } from '../src/loop/coordinator.ts'
import { acceptedInput, evidence, execution, ok, operation } from './journal-support.ts'
import { alice, loopAssembly } from './loop-support.ts'
import { options } from './factory-support.ts'

/** One Agent call waiting on the Model, its frozen result delivery and the receiver of this owner. */
async function setup() {
  const assembly = await loopAssembly([execution()])
  // The assembly's own receiver is refused while the call runs, so the delivery waits for this one.
  assembly.controls.access.check.always(input =>
    input.operation === 'receive-result'
      ? { kind: 'denied' }
      : { kind: 'allowed', evidence: evidence('access') },
  )
  const coordinator = createExecutionCoordinator({
    ports: assembly.dependencies,
    binding: options().binding,
    evaluator: agentEvaluator,
    access: alice,
    execution: execution(),
    operation: operation('invoke-custody'),
    initial: acceptedInput('input-custody'),
    grant: null,
    idle() {},
  })
  ok(await coordinator.accept())
  assembly.release.open()
  ok(await coordinator.runExecution())
  const snapshot = ok(
    await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
  )
  const pending = snapshot.checkpoint.calls[0]
  if (!pending || pending.kind !== 'model') throw new Error('model pending expected')
  const pusher = assembly.controls.pusher
  if (!pusher) throw new Error('public pusher required')
  const reference = ok(resolveModelInvocationRef(pending.reference, alice.tenant))
  const pushed = await pusher.settled({ tenant: alice.tenant, call: reference.call })
  const delivery = pushed.delivery
  if (delivery === null || delivery.kind !== 'result') throw new Error('frozen result required')
  assembly.controls.access.check.always(() => ({ kind: 'allowed', evidence: evidence('access') }))
  const provider = assembly.controls.journal.provider
  const dependencies: ModelReceiverDependencies<string> = {
    provider,
    access: assembly.controls.access.port,
    targets: assembly.controls.journal.targets,
    models: assembly.dependencies.models.calls,
    capacity: () => ({ records: 10, bytes: 1000000, attachments: 10, inFlight: 2 }),
    outlet: { deliver: async () => ({ kind: 'received' }) },
  }
  const receiver = ok(createAgentModelReceiver(dependencies, createModelReceiverState<string>()))
  const push = async (): Promise<DurableEvidence> =>
    ok(await receiver.push({ access: alice, delivery, signal: new AbortController().signal }))
      .evidence
  const question = (custody: DurableEvidence): AgentCustodyQuestion<string> => ({
    principal: alice.principal,
    tenant: alice.tenant,
    call: reference.call,
    consumer: delivery.consumer,
    reference: delivery.key.reference,
    result: delivery.key.result,
    evidence: { kind: 'retained', custody },
  })
  return { records: provider.received as AgentReceivedRecords<string>, push, question }
}

describe('the Agent custody evidence of a Model ACK', () => {
  it('confirms the evidence of the record the receiver committed for the delivery', async () => {
    const s = await setup()
    const saved = await s.push()
    const adapter = createAgentCustodyEvidence(s.records)
    expect(await adapter.verify(s.question(saved))).toEqual({ ok: saved })
  })

  it('answers unavailable before the receiver committed the record', async () => {
    const s = await setup()
    const adapter = createAgentCustodyEvidence(s.records)
    const guessed = { owner: '@omne-harness/agent', record: 'x', revision: '1', digest: '0' }
    expect(await adapter.verify(s.question(guessed))).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'consumer-evidence' },
    })
  })

  it('answers unavailable for a record that differs in its evidence, result, consumer or kind', async () => {
    const s = await setup()
    const saved = await s.push()
    const adapter = createAgentCustodyEvidence(s.records)
    const base = s.question(saved)
    const variants: AgentCustodyQuestion<string>[] = [
      { ...base, evidence: { kind: 'retained', custody: { ...saved, digest: 'f'.repeat(64) } } },
      { ...base, result: ok(decodeResultVersion('mrver_another')) },
      { ...base, consumer: { ...base.consumer, purpose: 'another' } },
      { ...base, evidence: { kind: 'processed', completion: saved } },
    ]
    for (const variant of variants)
      expect(await adapter.verify(variant)).toMatchObject({
        failure: { kind: 'unavailable', dependency: 'consumer-evidence' },
      })
  })

  it('answers unavailable, never a confirmation, when the record cannot be read', async () => {
    const s = await setup()
    const saved = await s.push()
    const failing = createAgentCustodyEvidence<string>({
      query: () =>
        Promise.resolve({
          failure: { kind: 'unavailable', owner: 'journal', diagnostic: 'offline' },
        }),
    })
    expect(await failing.verify(s.question(saved))).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'received-record-unavailable' },
    })
    const throwing = createAgentCustodyEvidence<string>({
      query: () => Promise.reject(new Error('broken')),
    })
    expect(await throwing.verify(s.question(saved))).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'consumer-evidence' },
    })
  })
})
