import { describe, expect, it } from 'vitest'
import { judgePart } from '@omne-harness/message'
import type { ModelLiveness } from '@omne-harness/model'
import {
  decodeDispatchId,
  type CallContact,
  type DurableEvidence,
} from '@omne-harness/model-contract'
import type { ConformanceSubject } from '@omne-harness/model-contract/conformance'
import { createScriptedConformanceSubject } from '@omne-harness/model-contract/testing'
import { runtimeFixture } from './runtime-fixture.ts'
import { runtimeConformanceSubject } from './runtime-conformance-fixture.ts'
import { settleRuntime } from './runtime-consumption-fixture.ts'
import { callId, op, proof, request, unbox } from './memory-fixture.ts'
import { invocationReference } from './reference-input.ts'

const LOCK: DurableEvidence = {
  owner: '@omne-harness/harness-server',
  record: 'state-lock',
  revision: '1',
  digest: 'instance:mcall_one',
}

function world(options: { liveness?: boolean } = {}) {
  const live = {
    held: null as ReturnType<ModelLiveness['holds']>,
    evidence: null as DurableEvidence | null,
    asked: [] as string[],
    judged: [] as string[],
  }
  const liveness: ModelLiveness = {
    holds: target => {
      live.asked.push(target.call)
      return live.held
    },
    lostContact: call => {
      live.judged.push(call)
      return live.evidence
    },
  }
  const reads = { count: 0 }
  const f = runtimeFixture(
    {},
    commands => ({
      ...commands,
      recall: input => {
        reads.count += 1
        return commands.recall(input)
      },
    }),
    undefined,
    options.liveness === false ? undefined : liveness,
  )
  const ask = () =>
    f.provider.runtime.calls.contact({
      principal: f.principal,
      tenant: f.tenant,
      reference: f.reference,
    })
  return { f, live, reads, ask }
}

async function acknowledged(f: ReturnType<typeof runtimeFixture>) {
  const settlement = await settleRuntime(f)
  unbox(
    await f.provider.runtime.consumption.acknowledge({
      ...f.admit,
      operation: op('ack'),
      result: settlement.version,
      evidence: {
        kind: 'processed',
        completion: proof(`${f.admit.call}/${settlement.version}`, 'consumer'),
      },
    }),
  )
}

describe('the contact answer of the runtime, by the record and the live body', () => {
  it('answers not-accepted for a call without a record', async () => {
    const { f, ask } = world()
    expect(unbox(await ask())).toEqual({ kind: 'not-accepted' })
    await f.dispose()
  })

  it('answers holding for a call the live body drives, without reading the records', async () => {
    const { f, live, reads, ask } = world()
    unbox(await f.provider.runtime.calls.admit(f.admit))
    live.held = 'drive'
    live.evidence = LOCK
    reads.count = 0
    expect(unbox(await ask())).toEqual({ kind: 'holding' })
    expect(reads.count).toBe(0)
    expect(live.asked).toEqual([f.admit.call])
    expect(live.judged).toEqual([])
    await f.dispose()
  })

  it('answers lost with the evidence for an open call the live body does not hold', async () => {
    const { f, live, ask } = world()
    unbox(await f.provider.runtime.calls.admit(f.admit))
    live.evidence = LOCK
    expect(unbox(await ask())).toEqual({ kind: 'lost', evidence: LOCK })
    expect(live.judged).toEqual([f.admit.call])
    await f.dispose()
  })

  it('answers unknown for an open call the live body does not hold when there is no evidence', async () => {
    const { f, ask } = world()
    unbox(await f.provider.runtime.calls.admit(f.admit))
    expect(unbox(await ask())).toEqual({ kind: 'unknown' })
    await f.dispose()
  })

  it('answers unknown for an open call when the runtime has no live body to ask', async () => {
    const { f, ask } = world({ liveness: false })
    unbox(await f.provider.runtime.calls.admit(f.admit))
    expect(unbox(await ask())).toEqual({ kind: 'unknown' })
    await f.dispose()
  })

  it('answers settled for a settled call whose result push is queued', async () => {
    const { f, live, ask } = world()
    await settleRuntime(f)
    live.held = 'push'
    live.evidence = LOCK
    expect(unbox(await ask())).toEqual({ kind: 'settled' })
    await f.dispose()
  })

  it('does not count a push of the late accounts of an open call as holding it', async () => {
    const { f, live, ask } = world()
    unbox(await f.provider.runtime.calls.admit(f.admit))
    live.held = 'push'
    live.evidence = LOCK
    expect(unbox(await ask())).toEqual({ kind: 'lost', evidence: LOCK })
    await f.dispose()
  })

  it('answers lost for a settled call whose result is not confirmed and that the live body does not hold', async () => {
    const { f, live, ask } = world()
    await settleRuntime(f)
    live.evidence = LOCK
    expect(unbox(await ask())).toEqual({ kind: 'lost', evidence: LOCK })
    live.evidence = null
    expect(unbox(await ask())).toEqual({ kind: 'unknown' })
    await f.dispose()
  })

  it('answers settled for a call whose result is confirmed, held or not', async () => {
    const { f, live, ask } = world()
    await acknowledged(f)
    live.evidence = LOCK
    expect(unbox(await ask())).toEqual({ kind: 'settled' })
    live.held = 'push'
    expect(unbox(await ask())).toEqual({ kind: 'settled' })
    await f.dispose()
  })

  it('refuses a principal without the right to inspect a call the live body does not hold', async () => {
    const { f, live, ask } = world()
    unbox(await f.provider.runtime.calls.admit(f.admit))
    live.evidence = LOCK
    f.denied.add('inspect')
    expect(await ask()).toEqual({ failure: { kind: 'denied', action: 'inspect' } })
    await f.dispose()
  })
})

function sealedText() {
  const part = judgePart({
    kind: 'text',
    id: 'answer',
    text: 'kept',
    visibility: { toHuman: true, toModel: true },
  })
  if ('rejected' in part || part.ok.kind !== 'text') throw new Error('invalid text block')
  return part.ok
}

async function scene<P>(subject: ConformanceSubject<P>) {
  const { provider, principal, tenant } = subject
  const hooks = subject.hooks!
  const calls = provider.runtime.calls
  const consumer = { owner: 'consumer', work: 'work', position: 'position', purpose: 'test' }
  const answer = async (name: string): Promise<CallContact | string> => {
    const reply = await calls.contact({
      principal,
      tenant,
      reference: invocationReference({ tenant, call: callId(name), admission: op(`a-${name}`) }),
    })
    return 'ok' in reply ? reply.ok : JSON.stringify(reply.failure)
  }
  const admit = (name: string) =>
    calls.admit({
      principal,
      tenant,
      call: callId(name),
      operation: op(`a-${name}`),
      request,
      consumer,
    })
  unbox(await admit('open'))
  unbox(await admit('done'))
  const done = { tenant, call: callId('done') }
  await hooks.startRun!({ ...done, dispatch: unbox(decodeDispatchId('mdisp_done')) })
  await hooks.settleCall!({
    ...done,
    termination: { kind: 'completed', reason: 'stop' },
    parts: [{ kind: 'sealed', block: sealedText(), trims: [] }],
    pageSize: 1,
    pageTargetBytes: 1024,
  })
  const found = unbox(
    await calls.inspect({
      principal,
      tenant,
      reference: invocationReference({ ...done, admission: op('a-done') }),
    }),
  )
  if (found.kind !== 'found' || found.state.phase !== 'settled') throw new Error('not settled')
  unbox(
    await provider.runtime.consumption.acknowledge({
      principal,
      tenant,
      call: done.call,
      operation: op('ack-done'),
      result: found.state.settlement.version,
      evidence: {
        kind: 'processed',
        completion: await hooks.provideEvidence!({ ...done, label: 'done' }),
      },
    }),
  )
  const seen = {
    unseen: await answer('unseen'),
    open: await answer('open'),
    acknowledged: await answer('done'),
  }
  await subject.dispose?.()
  return seen
}

describe('the scripted provider and the runtime answer contact alike', () => {
  it('for a call never admitted, an open call and a call whose result is confirmed', async () => {
    const scripted = await scene(createScriptedConformanceSubject())
    const runtime = await scene(runtimeConformanceSubject())
    expect(scripted).toMatchObject({
      unseen: { kind: 'not-accepted' },
      open: { kind: 'holding' },
      acknowledged: { kind: 'settled' },
    })
    expect(runtime.unseen).toEqual(scripted.unseen)
    expect(runtime.acknowledged).toEqual(scripted.acknowledged)
    expect(runtime.open).toEqual({ kind: 'unknown' })
  })
})
