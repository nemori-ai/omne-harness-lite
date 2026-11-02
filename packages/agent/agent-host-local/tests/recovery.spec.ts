// The recovery entry (`agentExecutionRecovery`, AG-04) and the control entry without a live runtime
// (`agentExecutionControl`, AG-05) of the `agent-host` plugin on real Cordis 4.0.4. An execution is
// opened straight in the memory Journal, so no runtime of the host holds it unless a case says so.
// What is checked: both entries check the principal with the operation name of the call and the
// execution target before the Journal is asked; they read back by the original execution, need no
// handle, answer another tenant `denied`, and keep a refusal of the access check; detach of an
// attachment whose runtime the host still runs also needs takeover; reconcile answers a named
// `unavailable`. A sudden loss of a dependency detaches nothing: the attachment stays as it was.
import {
  decodeAgentExecutionId,
  decodeAgentInstanceId,
  decodeAgentOperationId,
  decodeInputId,
  decodeStepId,
  type AcceptedInput,
  type AgentCheckpoint,
  type AgentExecutionId,
  type AgentInstanceId,
  type DurableEvidence,
  type OriginalInputAcceptance,
} from '@omne-harness/agent-contract'
import { judgeMessage } from '@omne-harness/message'
import { afterEach, describe, expect, it } from 'vitest'
import { caller, ok, openWorld, slotOf, turns, type World } from './host-support.ts'

const opened: World[] = []
afterEach(async () => {
  for (const world of opened.splice(0)) await world.dispose()
})

async function world(): Promise<World> {
  const made = await openWorld({ factory: 'duties' })
  opened.push(made)
  return made
}

const evidence = (record: string): DurableEvidence => ({
  owner: 'host-test',
  record,
  revision: '1',
  digest: `test:${record}`,
})
const operation = (text: string) => ok(decodeAgentOperationId(text))
const EXECUTION: AgentExecutionId = ok(decodeAgentExecutionId('recovery-execution'))
const OPEN = operation('open-recovery-execution')

function input(): AcceptedInput {
  const judged = judgeMessage({
    id: `msg_${'b'.repeat(24)}`,
    role: 'user',
    blocks: [
      { kind: 'text', id: 'blk_1', visibility: { toHuman: true, toModel: true }, text: 'hi' },
    ],
  })
  if (!('ok' in judged)) throw new Error(`fixture message rejected: ${JSON.stringify(judged)}`)
  return {
    id: ok(decodeInputId('recovery-input')),
    content: judged.ok,
    source: null,
    priority: 'ordinary',
  }
}

function checkpoint(): AgentCheckpoint {
  return {
    schema: { owner: 'host-test', name: 'checkpoint', revision: '1', digest: 'test:checkpoint' },
    definition: { owner: 'host-test', name: 'definition', revision: '1', digest: 'test:def' },
    step: ok(decodeStepId('step-1')),
    position: 'E3',
    calls: [],
    passages: [],
    batch: null,
    inputBatch: null,
    requestPreparation: null,
    compaction: null,
    adoptedContext: null,
    guard: null,
    completedPassages: [],
    priorConditions: null,
    currentHandoff: null,
    replyAdmissionRead: { kind: 'unverified' },
  }
}

/** Opens the execution in the memory Journal, attached to `instance`. */
async function openExecution(host: World, instance: AgentInstanceId) {
  const initial = input()
  const runtime = {
    instance,
    scope: evidence('scope'),
    definition: checkpoint().definition,
    grant: null,
  }
  const entry = {
    kind: 'invoke' as const,
    operation: OPEN,
    execution: EXECUTION,
    initial,
    checkpoint: checkpoint(),
  }
  const handoff = { kind: 'input' as const, execution: EXECUTION, entry: OPEN, input: initial.id }
  const original: OriginalInputAcceptance = {
    entry,
    handoff,
    outcome: {
      request: {
        kind: 'input',
        reference: handoff,
        entry,
        source: { kind: 'external-input', input: initial.id },
      },
      origin: { kind: 'invoke', ...runtime },
      provider: { owner: 'host-test', name: 'handoff', revision: '1', digest: 'test:handoff' },
      qualification: evidence('qualification'),
      record: evidence('handoff-record'),
      decision: { kind: 'prepared', message: initial.content, admission: evidence('admission') },
    },
  }
  return ok(
    await host.controls.journal.port.open({
      ...caller('a'),
      execution: EXECUTION,
      operation: OPEN,
      original,
      runtime,
    }),
  )
}

const unknownInstance = ok(decodeAgentInstanceId('not-a-host-instance'))

describe('the recovery entry (AG-04)', () => {
  it('reads back by the original execution without a live runtime', async () => {
    const host = await world()
    const opened = await openExecution(host, unknownInstance)
    const snapshot = ok(await host.recovery.load({ ...caller('a'), execution: EXECUTION }))
    expect(snapshot.execution).toBe(EXECUTION)
    expect(snapshot.revision).toBe(opened.receipt.revision)
    expect(
      await host.recovery.query({ ...caller('a'), execution: EXECUTION, operation: OPEN }),
    ).toEqual({ ok: { kind: 'committed', receipt: opened.receipt } })
    const checks = host.controls.access.check.calls.map(call => [call.operation, call.target])
    expect(checks).toEqual([
      ['load', { kind: 'execution', execution: EXECUTION }],
      ['query', { kind: 'execution', execution: EXECUTION }],
    ])
  })

  it('answers another tenant denied', async () => {
    const host = await world()
    await openExecution(host, unknownInstance)
    expect(await host.recovery.load({ ...caller('b'), execution: EXECUTION })).toMatchObject({
      failure: { kind: 'denied' },
    })
  })

  it('keeps a refusal of the access check and does not read the Journal', async () => {
    const host = await world()
    await openExecution(host, unknownInstance)
    host.refuseNext('load')
    expect(await host.recovery.load({ ...caller('a'), execution: EXECUTION })).toEqual({
      failure: { kind: 'denied', action: 'load' },
    })
  })

  it('answers reconcile with a named unavailable after the check', async () => {
    const host = await world()
    await openExecution(host, unknownInstance)
    expect(
      await host.recovery.reconcile({ ...caller('a'), execution: EXECUTION, operation: OPEN }),
    ).toMatchObject({ failure: { kind: 'unavailable', owner: 'agent-host' } })
    host.refuseNext('reconcile')
    expect(
      await host.recovery.reconcile({ ...caller('a'), execution: EXECUTION, operation: OPEN }),
    ).toEqual({ failure: { kind: 'denied', action: 'reconcile' } })
  })

  it('detaches an attachment that no live runtime holds with the detach check only', async () => {
    const host = await world()
    const opened = await openExecution(host, unknownInstance)
    const detached = await host.recovery.detach({
      ...caller('a'),
      execution: EXECUTION,
      operation: operation('detach-1'),
      authority: opened.authority,
      reason: evidence('handover'),
    })
    expect(detached).toHaveProperty('ok')
    expect(host.controls.access.check.calls.map(call => call.operation)).toEqual(['detach'])
  })

  it('needs takeover to detach the attachment of a runtime that the host still runs', async () => {
    const host = await world()
    const { instance } = ok(await host.provision.acquire(slotOf('a')))
    const opened = await openExecution(host, instance)
    host.refuseNext('takeover')
    const refused = await host.recovery.detach({
      ...caller('a'),
      execution: EXECUTION,
      operation: operation('detach-live'),
      authority: opened.authority,
      reason: evidence('handover'),
    })
    expect(refused).toEqual({ failure: { kind: 'denied', action: 'takeover' } })
    const snapshot = ok(await host.recovery.load({ ...caller('a'), execution: EXECUTION }))
    expect(snapshot.executionAttachment).toEqual(opened.authority)
  })
})

describe('the control entry without a live runtime (AG-05)', () => {
  const cancel = (tenant: 'a' | 'b', name: string) => ({
    ...caller(tenant),
    execution: EXECUTION,
    operation: operation(name),
    command: { kind: 'cancel' as const, reason: evidence('stop') },
  })

  it('accepts a control by execution, with no handle and no attachment', async () => {
    const host = await world()
    await openExecution(host, unknownInstance)
    const receipt = ok(await host.control.control(cancel('a', 'cancel-1')))
    expect(receipt.execution).toBe(EXECUTION)
    expect(receipt.operation).toBe(operation('cancel-1'))
    const snapshot = ok(await host.recovery.load({ ...caller('a'), execution: EXECUTION }))
    expect(snapshot.controls.map(record => record.operation)).toEqual([operation('cancel-1')])
    expect(host.controls.access.check.calls[0]).toMatchObject({
      operation: 'control',
      target: { kind: 'execution', execution: EXECUTION },
    })
  })

  it('answers another tenant denied and records nothing', async () => {
    const host = await world()
    await openExecution(host, unknownInstance)
    expect(await host.control.control(cancel('b', 'cancel-b'))).toMatchObject({
      failure: { kind: 'denied' },
    })
    const snapshot = ok(await host.recovery.load({ ...caller('a'), execution: EXECUTION }))
    expect(snapshot.controls).toEqual([])
  })

  it('keeps a refusal of the access check and records nothing', async () => {
    const host = await world()
    await openExecution(host, unknownInstance)
    host.refuseNext('control')
    expect(await host.control.control(cancel('a', 'cancel-refused'))).toEqual({
      failure: { kind: 'denied', action: 'control' },
    })
    const snapshot = ok(await host.recovery.load({ ...caller('a'), execution: EXECUTION }))
    expect(snapshot.controls).toEqual([])
  })
})

describe('a sudden loss of a dependency', () => {
  it('detaches nothing: the attachment of the lost runtime stays active in the Journal', async () => {
    const host = await world()
    const { instance } = ok(await host.provision.acquire(slotOf('a')))
    const opened = await openExecution(host, instance)
    await host.fibers.agentClock?.dispose()
    await turns()
    expect(host.retired).toEqual([
      expect.objectContaining({ instance, reason: 'contributor-removed' }),
    ])
    expect(host.quiesced).toEqual([])
    const snapshot = ok(
      await host.controls.journal.port.load({ ...caller('a'), execution: EXECUTION }),
    )
    expect(snapshot.executionAttachment).toEqual(opened.authority)
  })
})
