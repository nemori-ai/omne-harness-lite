import {
  decodeActionId,
  decodeAgentExecutionId,
  decodeAgentInstanceId,
  decodeAgentOperationId,
  decodeInputId,
  decodeStepId,
  type AcceptedInput,
  type AgentCheckpoint,
  type AgentExecutionId,
  type AgentInstanceId,
  type AgentState,
  type DurableEvidence,
  type OriginalInputAcceptance,
} from '@omne-harness/agent-contract'
import { judgeMessage } from '@omne-harness/message'
import { afterEach, describe, expect, it } from 'vitest'
import { caller, occupied, ok, openWorld, slotOf, turns, type World } from './host-support.ts'

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
    chain: null,
    priorConditions: null,
    currentHandoff: null,
    replyAdmissionRead: { kind: 'unverified' },
    voided: [],
  }
}

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
      checkpoint: checkpoint(),
    }),
  )
}

const unknownInstance = ok(decodeAgentInstanceId('not-a-host-instance'))

describe('the recovery entry', () => {
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

describe('the judgment of the runtime that holds an attachment (contact)', () => {
  async function provingWorld(lostContact: (instance: AgentInstanceId) => DurableEvidence | null) {
    const made = await openWorld({ factory: 'duties', lostContact })
    opened.push(made)
    return made
  }
  const ask = (host: World, authority: Awaited<ReturnType<typeof openExecution>>['authority']) =>
    host.recovery.contact({ ...caller('a'), execution: EXECUTION, authority })

  it('answers live for a runtime the host still runs, and does not ask the assembly', async () => {
    const asked: AgentInstanceId[] = []
    const host = await provingWorld(instance => {
      asked.push(instance)
      return evidence('lock')
    })
    const { instance } = ok(await host.provision.acquire(slotOf('a')))
    const held = await openExecution(host, instance)
    const holding = occupied(instance)
    if (holding.kind !== 'occupied') throw new Error('occupied state')
    host.handles.get(instance)?.report({ state: { ...holding, execution: EXECUTION } })
    expect(ok(await ask(host, held.authority))).toEqual({ kind: 'live' })
    expect(asked).toEqual([])
  })

  // The runtime the host runs said itself that it holds nothing, or another execution: that is
  // the host's own knowledge, not an inference from absence. A halted drive gives its slot back
  // (D-31), and this answer is what lets a recovering caller take the execution up.
  it.each([
    ['idle', (instance: AgentInstanceId): AgentState => ({ kind: 'idle', instance })],
    ['occupied by another execution', (instance: AgentInstanceId) => occupied(instance)],
  ] as const)(
    'answers lost with its own proof when its runtime reports %s',
    async (_name, stateOf) => {
      const asked: AgentInstanceId[] = []
      const host = await provingWorld(instance => {
        asked.push(instance)
        return evidence('lock')
      })
      const { instance } = ok(await host.provision.acquire(slotOf('a')))
      const held = await openExecution(host, instance)
      host.handles.get(instance)?.report({ state: stateOf(instance) })
      const answer = ok(await ask(host, held.authority))
      expect(answer).toMatchObject({
        kind: 'lost',
        evidence: { owner: 'agent-host', record: 'runtime-released' },
      })
      expect(asked).toEqual([])
    },
  )

  it('answers live while its runtime is between executions (reserved)', async () => {
    const host = await provingWorld(() => evidence('lock'))
    const { instance } = ok(await host.provision.acquire(slotOf('a')))
    const held = await openExecution(host, instance)
    host.handles.get(instance)?.report({ state: { kind: 'reserved', instance } })
    expect(ok(await ask(host, held.authority))).toEqual({ kind: 'live' })
  })

  it('answers lost with the proof of the assembly for an instance the host does not run', async () => {
    const host = await provingWorld(instance => evidence(`lock/${instance}`))
    const held = await openExecution(host, unknownInstance)
    expect(ok(await ask(host, held.authority))).toEqual({
      kind: 'lost',
      evidence: evidence(`lock/${unknownInstance}`),
    })
    expect(host.controls.access.check.calls.map(call => call.operation)).toEqual(['load'])
    const snapshot = ok(await host.recovery.load({ ...caller('a'), execution: EXECUTION }))
    expect(snapshot.executionAttachment).toEqual(held.authority)
  })

  it('answers unknown when the assembly has no proof now', async () => {
    const host = await provingWorld(() => null)
    const held = await openExecution(host, unknownInstance)
    expect(ok(await ask(host, held.authority))).toEqual({ kind: 'unknown' })
  })

  it('answers unknown when the assembly gave no proof source at all', async () => {
    const host = await world()
    const held = await openExecution(host, unknownInstance)
    expect(ok(await ask(host, held.authority))).toEqual({ kind: 'unknown' })
  })

  it('keeps a refusal of the access check and judges nothing', async () => {
    const host = await provingWorld(() => evidence('lock'))
    const held = await openExecution(host, unknownInstance)
    host.refuseNext('load')
    expect(await ask(host, held.authority)).toEqual({
      failure: { kind: 'denied', action: 'load' },
    })
  })
})

describe('the control entry without a live runtime', () => {
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

const nestedAsk = (tenant: 'a' | 'b') => ({
  ...caller(tenant),
  execution: EXECUTION,
  parent: ok(decodeActionId('action-parent')),
  ordinal: 1,
  target: {
    definition: { owner: 'host-test', name: 'Files', revision: '1', digest: 'test:Files' },
    name: 'Files',
    command: 'read',
    arguments: '{}',
  },
  signal: new AbortController().signal,
})

describe('AG-32 the nested action entry without a live runtime', () => {
  it('cannot answer now for an execution whose runtime is not on this host', async () => {
    const host = await world()
    await openExecution(host, unknownInstance)
    expect(await host.nested.admit(nestedAsk('a'))).toEqual({
      kind: 'unanswerable',
      diagnostic: 'no runtime here runs this execution',
    })
  })

  it('refuses a caller that may not read the execution, before any runtime is looked for', async () => {
    const host = await world()
    await openExecution(host, unknownInstance)
    host.refuseNext('load')
    expect(await host.nested.admit(nestedAsk('a'))).toEqual({
      kind: 'denied',
      reason: 'the caller may not ask for this execution',
    })
  })

  it('cannot answer for an execution that does not exist, and allows nothing', async () => {
    const host = await world()
    expect((await host.nested.admit(nestedAsk('a'))).kind).not.toBe('allowed')
  })

  it('cannot answer when the Journal throws, and says which read failed', async () => {
    const host = await openWorld({
      factory: 'duties',
      journal: port => ({
        ...port,
        load: () => {
          throw new Error('the store is away')
        },
      }),
    })
    opened.push(host)
    expect(await host.nested.admit(nestedAsk('a'))).toEqual({
      kind: 'unanswerable',
      diagnostic: 'the execution could not be read: unavailable',
    })
  })
})
