import { afterEach, describe, expect, it } from 'vitest'
import { writeJsonText } from '@omne-harness/json-text'
import type { ToolCallId, ToolWaitId } from '@omne-harness/tool-contract'
import { canonicalDigest } from '@omne-harness/tool'
import { createMemoryToolLedgerStore, type MemoryToolLedgerStore } from '@omne-harness/tool/testing'
import { snapshotOf } from '../src/ledger-decider.ts'
import { releaseBasisOf } from '../src/ledger-start.ts'
import { registrationOperation } from '../src/ledger-suspension.ts'
import { nextRevision } from '../src/evidence.ts'
import {
  askingAuthor,
  checkpointBinding,
  scriptedBridge,
  type BridgeScript,
} from './checkpoint-values.ts'
import { callId, evidence, ok, operationId, principalA, tenantA } from './runtime-values.ts'
import { question } from './scope-values.ts'
import {
  admitCall,
  auditQueues,
  startHarness,
  testAuthority,
  type StartOptions,
} from './start-values.ts'

afterEach(auditQueues)

function setup(script: BridgeScript = 'registers', options: StartOptions = {}) {
  const authority = testAuthority()
  const checkpoint = checkpointBinding(authority, askingAuthor())
  const bridge = scriptedBridge(script)
  const harness = startHarness({
    authority,
    bindingsPort: () => checkpoint.bindings,
    decisions: bridge,
    driverRetryDelayMs: 5,
    ...options,
  })
  return { harness, checkpoint, bridge, authority }
}

async function settle(harness: ReturnType<typeof setup>['harness']): Promise<void> {
  for (let quiet = 0, round = 0; quiet < 3 && round < 200; round += 1) {
    await new Promise(resolve => setTimeout(resolve, 2))
    quiet = (await harness.host.runScheduled()) === 0 ? quiet + 1 : 0
  }
}

async function recovery(harness: ReturnType<typeof setup>['harness'], call: string) {
  return ok(
    await harness.commands.loadRecovery({
      principal: principalA,
      tenant: tenantA,
      call: callId(call),
    }),
  )
}

async function suspendedCall(script: BridgeScript = 'registers', options: StartOptions = {}) {
  const built = setup(script, options)
  await admitCall(built.harness, 'c1')
  await built.harness.drive('c1')
  await settle(built.harness)
  return built
}

describe('a checkpointed segment that returns suspended', () => {
  it('commits suspended with the checkpoint and the closed timing segment, and opens the wait on its registration', async () => {
    const { harness, checkpoint, bridge } = await suspendedCall()
    const read = await recovery(harness, 'c1')
    const start = read.start
    if (start === null) throw new Error('c1 has no start record')
    const wait = `${start.operation}/wait`
    const registration = evidence(`registration/${wait}`, 'test-decisions')
    const state = await harness.state('c1')
    expect(state).toMatchObject({
      phase: 'suspended',
      checkpoint: { owner: 'test-host', record: `checkpoint/${start.operation}` },
      execution: { kind: 'suspended' },
      timing: { kind: 'paused', accumulatedMs: '25' },
      wait: { kind: 'ask', wait, registration, decision: null },
    })
    expect(read.waits).toMatchObject([{ phase: 'open', intent: { kind: 'ask', wait } }])
    expect(read.checkpointState).toEqual({
      payload: read.checkpoint,
      state: Buffer.from('{"asked":"which file?"}').toString('base64'),
    })
    expect(read.checkpoint?.digest).toBe(canonicalDigest(read.checkpointState?.state))
    const original = writeJsonText(question('which file?'))
    expect(read.waitRequest).toEqual({ wait, request: original })
    expect(read.waits[0]?.intent.request.digest).toBe(canonicalDigest(original))
    expect(checkpoint.segments).toEqual([start.operation])
    expect(read.tasks.map(task => task.kind)).not.toContain('suspend')
    expect(read.tasks.map(task => task.kind)).not.toContain('wait-registration')
    expect(read.tasks.map(task => task.kind)).not.toContain('facts')
    expect(bridge.ensured).toEqual([
      { operation: `${wait}/ensure`, wait, request: read.waits[0]?.intent.request },
    ])
  })

  it('parks the queue entry, so another call of the same tool takes the one slot', async () => {
    const { harness, authority } = await suspendedCall()
    expect(await harness.queue()).toEqual([{ call: 'c1', ordinal: '1', stage: 'parked' }])
    await admitCall(harness, 'c2')
    await harness.drive('c2')
    await settle(harness)
    expect(authority.accepted).toEqual(['c1', 'c2'])
    expect((await harness.state('c2')).phase).toBe('suspended')
    expect(await harness.queue()).toEqual([
      { call: 'c1', ordinal: '1', stage: 'parked' },
      { call: 'c2', ordinal: '2', stage: 'parked' },
    ])
  })

  it('counts a parked entry toward queueCapacity: a new admission is refused', async () => {
    const { harness } = await suspendedCall('registers', { queueCapacity: 1 })
    expect(await harness.queue()).toEqual([{ call: 'c1', ordinal: '1', stage: 'parked' }])
    await expect(admitCall(harness, 'c2')).rejects.toThrow('tool-queue')
  })

  it('recalls a registration whose answer was lost through inspectOperation, and never ensures again', async () => {
    const { harness, bridge } = await suspendedCall('answer-lost')
    const read = await recovery(harness, 'c1')
    const wait = read.waits[0]?.intent.wait
    expect(bridge.ensured.map(entry => entry.operation)).toEqual([`${wait}/ensure`])
    expect(bridge.inspected).toEqual([`${wait}/ensure`])
    expect((await harness.state('c1')).wait).toMatchObject({
      kind: 'ask',
      registration: evidence(`registration/${wait}`, 'test-decisions'),
    })
    expect(read.waits).toMatchObject([{ phase: 'open' }])
  })

  it('keeps the wait opening and its duty when the decision owner refuses the registration', async () => {
    const { harness, bridge } = await suspendedCall('refuses')
    const read = await recovery(harness, 'c1')
    expect(bridge.ensured).toHaveLength(1)
    expect(bridge.inspected).toEqual([])
    expect(read.waits).toMatchObject([{ phase: 'opening' }])
    expect((await harness.state('c1')).wait).toEqual({ kind: 'none' })
    expect(read.tasks.filter(task => task.kind === 'wait-registration')).toMatchObject([
      { state: 'blocked', diagnostic: 'registration-refused: denied' },
    ])
    expect(await harness.queue()).toEqual([{ call: 'c1', ordinal: '1', stage: 'parked' }])
  })

  it('does not park when the wait reached responding before the park ran: the call keeps its slot', async () => {
    const memory = createMemoryToolLedgerStore()
    const { harness } = await suspendedCall('registers', {
      memory,
      commands: base => ({
        ...base,
        suspend: async input => {
          const suspended = await base.suspend(input)
          if ('ok' in suspended) await respond(memory, input.call)
          return suspended
        },
      }),
    })
    const read = await recovery(harness, 'c1')
    expect(read.waits).toMatchObject([{ phase: 'responding' }])
    expect(await harness.queue()).toEqual([{ call: 'c1', ordinal: '1', stage: 'held' }])
    expect(read.tasks.map(task => task.kind)).not.toContain('suspend')
  })
})

describe('a checkpoint that the ledger refuses', () => {
  it('stops the run on the refusal: the stream that ended at the wait is not read and planned again', async () => {
    const authority = testAuthority()
    const checkpoint = checkpointBinding(authority, askingAuthor())
    const plans = { count: 0 }
    const harness = startHarness({
      authority,
      decisions: scriptedBridge(),
      driverRetryDelayMs: 5,
      commands: base => ({
        ...base,
        planSuspension: input => {
          plans.count += 1
          if (plans.count > 50) throw new Error('the driver plans the suspension again and again')
          return base.planSuspension(input)
        },
      }),
      bindingsPort: () => ({
        ...checkpoint.bindings,
        resolve: async input => {
          const resolved = await checkpoint.bindings.resolve(input)
          if ('failure' in resolved || resolved.ok.kind !== 'checkpointed') return resolved
          const binding = resolved.ok
          return {
            ok: {
              ...binding,
              suspend: async suspension => {
                const proof = await binding.suspend(suspension)
                return 'ok' in proof && proof.ok.kind === 'suspended'
                  ? {
                      ok: {
                        ...proof.ok,
                        checkpoint: { ...proof.ok.checkpoint, payload: evidence('elsewhere') },
                      },
                    }
                  : proof
              },
            },
          }
        },
      }),
    })
    await admitCall(harness, 'c1')
    await harness.drive('c1')
    await settle(harness)
    expect(plans.count).toBeLessThanOrEqual(2)
    const read = await recovery(harness, 'c1')
    expect(read.tasks.filter(task => task.kind === 'suspend')).toHaveLength(1)
    expect((await harness.state('c1')).phase).toBe('running')
  })
})

describe('the identities and the release basis of a suspension', () => {
  it('derives the registration operation from the wait alone: stable for one wait, another for the next', () => {
    const first = ok(registrationOperation('op-c1/start/wait' as ToolWaitId))
    expect(ok(registrationOperation('op-c1/start/wait' as ToolWaitId))).toBe(first)
    expect(ok(registrationOperation('op-c1/resume-1/wait' as ToolWaitId))).not.toBe(first)
  })

  it('gives a call that settled while suspended the suspended-exclusion basis, and none without its committed checkpoint', async () => {
    const { harness } = await suspendedCall()
    const domain = { kind: 'call', tenant: tenantA, call: callId('c1') } as const
    const before = await harness.memory.read(domain)
    if (before.kind !== 'complete') throw new Error('the call domain is unreadable')
    expect(releaseBasisOf(snapshotOf(domain, before))).toBe(null)
    const checkpoint = (await harness.state('c1')).execution
    if (checkpoint.kind !== 'suspended') throw new Error('c1 is not suspended')
    ok(
      await harness.commands.control({
        principal: principalA,
        tenant: tenantA,
        call: callId('c1'),
        operation: operationId('stop-c1'),
        intent: { kind: 'stop' },
      }),
    )
    const read = await harness.memory.read(domain)
    if (read.kind !== 'complete') throw new Error('the call domain is unreadable')
    expect((await harness.state('c1')).phase).toBe('settled')
    expect(releaseBasisOf(snapshotOf(domain, read))).toMatchObject({
      kind: 'suspended-exclusion',
      checkpoint: checkpoint.checkpoint,
      exclusion: { record: expect.stringMatching(/^returned\//u) },
    })
    const uncommitted = read.records.filter(record => record.kind !== 'suspension')
    expect(releaseBasisOf(snapshotOf(domain, { ...read, records: uncommitted }))).toBe(null)
  })
})

async function respond(memory: MemoryToolLedgerStore, call: ToolCallId): Promise<void> {
  const domain = { kind: 'call', tenant: tenantA, call } as const
  const read = await memory.read(domain)
  if (read.kind !== 'complete') throw new Error('the call domain is unreadable')
  const writes = read.records.flatMap(record => {
    if (record.kind !== 'wait' || record.wait.record.phase !== 'opening') return []
    const { intent } = record.wait.record
    const value = {
      kind: 'ask',
      wait: intent.wait,
      registration: evidence('registration'),
      resume: intent.resume,
      decision: evidence('decision'),
    } as const
    const response = {
      tenant: tenantA,
      call,
      operation: 'op-c1/accept' as never,
      adoption: evidence('adoption') as never,
      inputDigest: 'sha256:accept',
      start: read.records.flatMap(other =>
        other.kind === 'call' ? [other.call.start] : [],
      )[0] as never,
      wait: intent.wait,
      response: { kind: 'decision', value: { kind: 'no-answer' }, source: evidence('source') },
    } as const
    return [
      {
        kind: 'put',
        record: {
          ...record,
          wait: {
            ...record.wait,
            record: {
              intent,
              phase: 'responding',
              value,
              response,
              progress: { kind: 'accepted', receipt: evidence('receipt') },
            },
          },
        },
      } as const,
    ]
  })
  const committed = await memory.commit({
    domain,
    expected: read.revision,
    revision: nextRevision(read.revision),
    writes,
  })
  if (committed.kind !== 'committed')
    throw new Error(`the responding wait did not land: ${committed.kind}`)
  expect(writes).toHaveLength(1)
}
