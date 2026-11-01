// The scheduler and coordinator subset of SS-01: S1 wakes on a commit and hands a session that may
// start a Run to C2; C2 opens the Run, invokes the Agent with the derived outbound identity and
// records the hand-over; S4 resolves an unknown commit with the same identity; S3 finds pending
// inputs after a restart. C2 computes the session slot reference by the AD-14 rule (XC-AGINST 2.1).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import {
  deriveDriveOperation,
  type AgentDrivePort,
  type SessionId,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  adoption,
  evidence,
  operationId,
  ordinaryInput,
  sessionId,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { sessionSlotReference } from '../src/slot-reference.ts'
import { memoryBackend } from './fixtures/backends.ts'
import { harness, TENANT_A, type Harness, type HarnessOptions } from './fixtures/harness.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

async function service(options: Partial<HarnessOptions> = {}): Promise<Harness> {
  const h = await harness({ backend: memoryBackend, advance: true, ...options })
  open.push(h)
  return h
}

const read = async (h: Harness): Promise<WorkSnapshot> =>
  succeeded(await h.backend.transactions.readWork(h.access()), 'read')

/** Accepts an input through the public port, so no local wake-up of this instance follows. */
async function acceptDirectly(h: Harness, input: string): Promise<void> {
  succeeded(
    await h.backend.transactions.commit({
      access: h.access(),
      command: {
        kind: 'accept',
        input: {
          tenant: h.access().tenant,
          session: h.access().session,
          operation: operationId(`accept-${input}`),
          value: ordinaryInput(input),
        },
      },
      guards: [],
    }),
    `accept ${input} directly`,
  )
}

describe('the session slot reference (XC-AGINST 第 2.1 节, AD-14 rule)', () => {
  const samples: readonly (readonly [string, SessionId, ReturnType<typeof adoption>, string])[] = [
    [
      'plain texts',
      sessionId('session-1'),
      { owner: 'conformance', name: 'assistant@1', revision: '1', digest: 'sha256:assistant@1' },
      '["slot1","session-1","conformance","assistant@1","1","sha256:assistant@1"]',
    ],
    [
      'texts that JSON must escape, and non-ASCII text that it keeps',
      sessionId('sess-"引号"\\终'),
      { owner: 'assets/agents', name: '定义 A', revision: '42', digest: 'sha256:00ff' },
      '["slot1","sess-\\"引号\\"\\\\终","assets/agents","定义 A","42","sha256:00ff"]',
    ],
  ]
  for (const [name, session, adopted, text] of samples)
    it(`${name}: the reference text equals the sample, and the AD-14 parse rule accepts it`, () => {
      const reference = sessionSlotReference(session, adopted)
      expect(reference).toEqual({ owner: 'agent', id: text })
      const parsed: unknown = JSON.parse(text)
      expect(Array.isArray(parsed) && parsed.length === 6).toBe(true)
      expect((parsed as unknown[]).every(item => typeof item === 'string')).toBe(true)
      expect((parsed as string[])[0]).toBe('slot1')
      expect(JSON.stringify(parsed)).toBe(text)
      expect((parsed as string[])[1]).toBe(session)
    })
})

describe('S1 and C2: a commit that leaves a startable input opens the Run', () => {
  it('accept wakes S1; C2 starts the Run with the slot reference, invokes with the derived identity, and records the hand-over', async () => {
    const h = await service()
    await h.create()
    const invoked: Parameters<AgentDrivePort['invoke']>[0][] = []
    const original = h.drive.invoke.bind(h.drive)
    h.drive.invoke = input => {
      invoked.push(input)
      return original(input)
    }
    await h.accept('input-1')
    await vi.waitFor(async () => {
      expect((await read(h)).handed).toEqual(['input-1'])
    })
    const snapshot = await read(h)
    if (snapshot.run.kind !== 'active') throw new Error('the Run is not active')
    expect(snapshot.run.advance?.instance).toEqual({
      owner: 'agent',
      id: '["slot1","session-1","conformance","assistant@1","1","sha256:assistant@1"]',
    })
    expect(invoked).toHaveLength(1)
    const call = invoked[0]
    expect(call?.first).toBe('input-1')
    expect(call?.execution).toBe(snapshot.run.execution.execution)
    expect(call?.operation).toBe(
      deriveDriveOperation({
        kind: 'invoke',
        execution: snapshot.run.execution.execution,
        first: snapshot.run.first,
        started: call?.source ?? evidence('none'),
      }),
    )
    // Coordinators and schedulers take a principal per face operation, with the actor of their role.
    const actors = h.workPrincipals.controls.asked().map(request => request.actor)
    expect(actors).toContain('maintainer')
    expect(actors).toContain('coordinator')
  })

  it('a session whose work principal is refused is not advanced; its input stays pending', async () => {
    const h = await service({ advance: false })
    await h.create()
    await h.accept('input-1')
    await vi.waitFor(() => {
      expect(h.workPrincipals.controls.asked().length).toBeGreaterThan(0)
    })
    await h.instance.close()
    const snapshot = await read(h)
    expect(snapshot.run.kind).toBe('none')
    expect(snapshot.pending).toEqual(['input-1'])
  })

  it('without an Agent drive port the Run starts but nothing is sent; the input waits for a replay', async () => {
    const h = await service({ drive: false })
    await h.create()
    await h.accept('input-1')
    await vi.waitFor(async () => {
      expect((await read(h)).run.kind).toBe('active')
    })
    await h.instance.close()
    expect((await read(h)).handed).toEqual([])
  })

  it('a busy Agent is retried with the same identity after the first delay of advance.retryDelaysMs', async () => {
    const h = await service({ policy: { advance: { retryDelaysMs: [1000] } } })
    await h.create()
    const answers: string[] = []
    const original = h.drive.invoke.bind(h.drive)
    let first = true
    h.drive.invoke = async input => {
      if (first) {
        first = false
        answers.push(input.operation)
        return fail({ kind: 'busy' as const })
      }
      answers.push(input.operation)
      return original(input)
    }
    await h.accept('input-1')
    await vi.waitFor(() => {
      expect(answers).toHaveLength(1)
    })
    expect((await read(h)).handed).toEqual([])
    h.clock.controls.advance(1000)
    await vi.waitFor(async () => {
      expect((await read(h)).handed).toEqual(['input-1'])
    })
    expect(answers[1]).toBe(answers[0])
  })

  it('a first input that the message admission refuses closes the Run as failed (PM-02)', async () => {
    const h = await service()
    await h.create()
    h.drive.invoke = () =>
      Promise.resolve(
        fail({ kind: 'invalid' as const, reason: 'refused', rejection: evidence('agent/refused') }),
      )
    await h.accept('input-1')
    await vi.waitFor(async () => {
      expect((await read(h)).run.kind).toBe('terminal')
    })
    const snapshot = await read(h)
    if (snapshot.run.kind !== 'terminal') throw new Error('no terminal')
    expect(snapshot.run.terminal.outcome).toBe('failed')
  })
})

describe('S4: an unknown commit is resolved with the same identity', () => {
  it('a startRun whose answer was lost is found committed, recalled, and the Run is invoked', async () => {
    const h = await service({
      policy: { pendingResolution: { retryIntervalMs: 500, maxAttempts: 3 } },
    })
    await h.create()
    let lost = false
    h.view.onCommit(async (input, next) => {
      const answer = await next()
      if (input.command.kind === 'startRun' && !lost) {
        lost = true
        return fail({ kind: 'commit-unknown' as const, operation: input.command.input.operation })
      }
      return answer
    })
    await h.accept('input-1')
    await vi.waitFor(async () => {
      expect((await read(h)).run.kind).toBe('active')
    })
    expect((await read(h)).handed).toEqual([])
    h.clock.controls.advance(500)
    await vi.waitFor(async () => {
      expect((await read(h)).handed).toEqual(['input-1'])
    })
    const starts = h.view
      .calls()
      .filter(call => call.method === 'commit' && call.bound === 'startRun')
    expect(starts).toHaveLength(2)
  })
})

describe('S1 from a notice of another process, and S3 after a restart', () => {
  it('a commit notice with an accepted input wakes S1', async () => {
    const h = await service()
    await h.create()
    await acceptDirectly(h, 'input-1')
    const before = await read(h)
    h.instance.committed({
      tenant: TENANT_A,
      session: h.access().session,
      revision: before.revision,
      source: before.source,
      kinds: ['intake.routed'],
    })
    await vi.waitFor(async () => {
      expect((await read(h)).handed).toEqual(['input-1'])
    })
  })

  it('a notice without an advance kind wakes nothing', async () => {
    const h = await service()
    await h.create()
    await acceptDirectly(h, 'input-1')
    const before = await read(h)
    const asked = h.workPrincipals.controls.asked().length
    h.instance.committed({
      tenant: TENANT_A,
      session: h.access().session,
      revision: before.revision,
      source: before.source,
      kinds: ['session.modes-changed'],
    })
    await new Promise(resolve => setImmediate(resolve))
    expect(h.workPrincipals.controls.asked().length).toBe(asked)
  })

  it('maintain starts one scanner per tenant; its startup scan hands a session with pending inputs to S1', async () => {
    const h = await service()
    await h.create()
    await acceptDirectly(h, 'input-1')
    const handle = succeeded(await h.instance.maintain(TENANT_A), 'maintain')
    const again = succeeded(await h.instance.maintain(TENANT_A), 'maintain again')
    expect(again).toBe(handle)
    await vi.waitFor(async () => {
      expect((await read(h)).handed).toEqual(['input-1'])
    })
    await handle.release()
  })

  it('without the public port maintain answers unavailable and starts no scanner', async () => {
    const h = await service()
    h.setDirectory(false)
    const answer = await h.instance.maintain(TENANT_A)
    expect(answer).toEqual({
      failure: expect.objectContaining({ kind: 'unavailable', owner: 'sessionTransactions' }),
    })
  })
})
