// Machine guards of the WakeUp model (session-contract verification/models/wake-up/WakeUp.tla).
//   S5 again: a trigger that arrives while S1 is already judging runs S1 again, so the input
//     accepted during the first read still opens the Run (negative control "no-again").
//   S5 GrantedInvoked: a granted Run whose invoke was not accepted, because the retries ran out
//     or no invoke was sent, is invoked again with the same outbound identity when S1 or the S3
//     scan finds the session (PA-06 item 2; negative control "scan-start-only").
//   S6 NoSilentGiveUp: every C2 or S1 step that stops on a failure leaves a named diagnostic with
//     the session, the Run, the step and the reason (negative control "swallow").
// The bounded close is also guarded here against unrelated commits (contract I-R2, R2-D327). The
// periodic scan that finds a session by its pending inputs is guarded by the startup scan case of
// advance.spec.ts.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import type {
  AgentDrivePort,
  SessionTransactionPort,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  evidence,
  operationId,
  ordinaryInput,
  succeeded,
} from '@omne-harness/session-contract/testing'
import type { SessionDiagnostic } from '../src/index.ts'
import { interceptReads } from './fixtures/control-fixture.ts'
import { memoryBackend } from './fixtures/backends.ts'
import { sqlBackend } from './fixtures/sql.ts'
import { harness, TENANT_A, type Harness, type HarnessOptions } from './fixtures/harness.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

const read = async (h: Harness): Promise<WorkSnapshot> =>
  succeeded(await h.backend.transactions.readWork(h.access()), 'read')

async function service(options: Partial<HarnessOptions> = {}): Promise<Harness> {
  const h = await harness({ backend: memoryBackend, advance: true, ...options })
  open.push(h)
  return h
}

/** The Run of the active snapshot. */
async function activeRun(h: Harness) {
  const snapshot = await read(h)
  if (snapshot.run.kind !== 'active') throw new Error('no active Run')
  return snapshot.run
}

/** Records every invoke and answers through `answer`, which may delegate to the memory Agent. */
function recordInvokes(
  h: Harness,
  answer: (
    input: Parameters<AgentDrivePort['invoke']>[0],
    original: AgentDrivePort['invoke'],
  ) => ReturnType<AgentDrivePort['invoke']>,
): string[] {
  const operations: string[] = []
  const original = h.drive.invoke.bind(h.drive)
  h.drive.invoke = input => {
    operations.push(input.operation)
    return answer(input, original)
  }
  return operations
}

/** A promise with its resolver. */
function gate() {
  let open: () => void = () => {}
  const promise = new Promise<void>(resolve => {
    open = resolve
  })
  return { promise, open }
}

it('a trigger during an in-flight judgment runs S1 again, and the input accepted meanwhile opens the Run', async () => {
  const h = await service()
  await h.create()

  // The first read of S1 is held after it has read the session without any input.
  const held = gate()
  const reading = gate()
  let first = true
  const bind = h.dependencies.transactions.bind.bind(h.dependencies.transactions)
  h.dependencies.transactions.bind = checked => {
    const view = bind(checked)
    const readWork: SessionTransactionPort<string>['readWork'] = async input => {
      const answer = await view.readWork(input)
      if (first) {
        first = false
        reading.open()
        await held.promise
      }
      return answer
    }
    return { ...view, readWork }
  }

  const notice = async () => {
    const now = await read(h)
    h.instance.committed({
      tenant: TENANT_A,
      session: h.access().session,
      revision: now.revision,
      source: now.source,
      kinds: ['intake.routed'],
    })
  }
  // Wake S1 while nothing is pending; it reads and is held.
  await notice()
  await reading.promise
  // Meanwhile an input is accepted through the public port and its notice arrives.
  succeeded(
    await h.backend.transactions.commit({
      access: h.access(),
      command: {
        kind: 'accept',
        input: {
          tenant: h.access().tenant,
          session: h.access().session,
          operation: operationId('accept-input-1'),
          value: ordinaryInput('input-1'),
        },
      },
      guards: [],
    }),
    'accept input-1',
  )
  await notice()
  // The held read answers the old snapshot: nothing to start. Only the second run of S1 sees it.
  held.open()
  await vi.waitFor(async () => {
    expect((await read(h)).handed).toEqual(['input-1'])
  })
})

describe('GrantedInvoked: a granted Run whose invoke was not accepted is invoked again (PA-06 item 2)', () => {
  for (const [name, backend] of [
    ['memory', memoryBackend],
    ['sql', sqlBackend],
  ] as const)
    it(`${name}: after the retries run out on an unavailable Agent, the S3 scan invokes it with the same identity`, async () => {
      const h = await service({ backend, policy: { advance: { retryDelaysMs: [1000] } } })
      await h.create()
      let down = true
      const operations = recordInvokes(h, (input, original) =>
        down
          ? Promise.resolve(fail({ kind: 'unavailable' as const, diagnostic: 'agent down' }))
          : original(input),
      )
      await h.accept('input-1')
      await vi.waitFor(() => expect(operations).toHaveLength(1))
      h.clock.controls.advance(1000)
      await vi.waitFor(() =>
        expect(h.diagnostics().map(item => item.reason)).toContain('retries-exhausted'),
      )
      expect(operations).toHaveLength(2)
      const run = await activeRun(h)
      expect((await read(h)).handed).toEqual([])
      // The Agent comes back; the startup scan of the tenant finds the session by its pending input.
      down = false
      const handle = succeeded(await h.instance.maintain(TENANT_A), 'maintain')
      await vi.waitFor(async () => {
        expect((await read(h)).handed).toEqual(['input-1'])
      })
      await handle.release()
      expect(operations.length).toBeGreaterThanOrEqual(3)
      expect(new Set(operations).size).toBe(1)
      const after = await activeRun(h)
      expect(after.run).toBe(run.run)
      expect(after.execution.execution).toBe(run.execution.execution)
    })

  it('a Run granted while no Agent port was present is invoked when a later trigger reaches S1', async () => {
    const h = await service({ drive: false })
    await h.create()
    const operations = recordInvokes(h, (input, original) => original(input))
    await h.accept('input-1')
    await vi.waitFor(() =>
      expect(h.diagnostics().map(item => item.reason)).toContain('agent-absent'),
    )
    const run = await activeRun(h)
    expect(operations).toEqual([])
    h.setDrive(true)
    // A notice from another process: S1 reads the session and finds the granted Run.
    const now = await read(h)
    h.instance.committed({
      tenant: TENANT_A,
      session: h.access().session,
      revision: now.revision,
      source: now.source,
      kinds: ['intake.routed'],
    })
    await vi.waitFor(async () => {
      expect((await read(h)).handed).toEqual(['input-1'])
    })
    expect(operations).toHaveLength(1)
    expect((await activeRun(h)).run).toBe(run.run)
  })
})

describe('NoSilentGiveUp: a step that stops on a failure leaves a named diagnostic', () => {
  type Named = Pick<SessionDiagnostic, 'owner' | 'step' | 'reason'>
  const named = (item: SessionDiagnostic, expected: Named): boolean =>
    item.owner === expected.owner && item.step === expected.step && item.reason === expected.reason

  async function stopped(h: Harness, expected: Named): Promise<SessionDiagnostic> {
    await vi.waitFor(() => expect(h.diagnostics().some(item => named(item, expected))).toBe(true))
    const found = h.diagnostics().find(item => named(item, expected))
    if (found === undefined) throw new Error('no diagnostic')
    expect(found.session).toBe(h.access().session)
    expect(found.tenant).toEqual(TENANT_A)
    expect(found.detail.length).toBeGreaterThan(0)
    return found
  }

  it('C2 invoke: a refusal that is not retried (terminal)', async () => {
    const h = await service()
    await h.create()
    recordInvokes(h, () => Promise.resolve(fail({ kind: 'terminal' as const })))
    await h.accept('input-1')
    const found = await stopped(h, { owner: 'C2', step: 'invoke', reason: 'terminal' })
    expect(found.run).toBe((await activeRun(h)).run)
  })

  it('C2 invoke: an access refusal while the attempt still holds the advance', async () => {
    const h = await service()
    await h.create()
    h.drive.controls.denied(true)
    await h.accept('input-1')
    const found = await stopped(h, { owner: 'C2', step: 'invoke', reason: 'denied' })
    expect(found.run).toBe((await activeRun(h)).run)
  })

  it('C2 receive: the hand-over of the accepted first input fails', async () => {
    const h = await service()
    await h.create()
    h.view.onCommit((input, next) =>
      input.command.kind === 'receive'
        ? Promise.resolve(fail({ kind: 'unavailable', owner: 'test', diagnostic: 'store down' }))
        : next(),
    )
    await h.accept('input-1')
    const found = await stopped(h, { owner: 'C2', step: 'receive', reason: 'unavailable' })
    expect(found.run).toBe((await activeRun(h)).run)
  })

  it('C2 finishRun: the bounded close of a refused first input fails', async () => {
    const h = await service()
    await h.create()
    recordInvokes(h, () =>
      Promise.resolve(
        fail({ kind: 'invalid' as const, reason: 'refused', rejection: evidence('agent/refused') }),
      ),
    )
    h.view.onCommit((input, next) =>
      input.command.kind === 'finishRun'
        ? Promise.resolve(fail({ kind: 'unavailable', owner: 'test', diagnostic: 'store down' }))
        : next(),
    )
    await h.accept('input-1')
    const found = await stopped(h, { owner: 'C2', step: 'finishRun', reason: 'unavailable' })
    expect(found.run).toBe((await activeRun(h)).run)
  })

  it('S1 read: the snapshot read of the trigger fails', async () => {
    const h = await service()
    await h.create()
    await h.accept('input-1')
    await vi.waitFor(async () => {
      expect((await read(h)).handed).toEqual(['input-1'])
    })
    interceptReads(h, async () =>
      fail({ kind: 'unavailable', owner: 'test-read', diagnostic: 'read failed' }),
    )
    const now = await read(h)
    h.instance.committed({
      tenant: TENANT_A,
      session: h.access().session,
      revision: now.revision,
      source: now.source,
      kinds: ['intake.routed'],
    })
    const found = await stopped(h, { owner: 'S1', step: 'read', reason: 'unavailable' })
    expect(found.run).toBeNull()
  })
})

describe('the bounded close is not starved by unrelated commits (contract I-R2, R2-D327)', () => {
  it('an accept between its read and its commit does not stop the close of a refused first input', async () => {
    const h = await service({ policy: { command: { retriesOnChanged: 1 } } })
    await h.create()
    // Only the first input is refused; the inputs accepted meanwhile go to the next Run.
    recordInvokes(h, (input, original) =>
      input.first === 'input-1'
        ? Promise.resolve(
            fail({
              kind: 'invalid' as const,
              reason: 'refused',
              rejection: evidence('agent/refused'),
            }),
          )
        : original(input),
    )
    let accepts = 0
    h.view.onCommit(async (input, next) => {
      // Every commit of the close meets an unrelated accept that moved the snapshot revision.
      if (input.command.kind === 'finishRun') {
        accepts += 1
        succeeded(
          await h.backend.transactions.commit({
            access: h.access(),
            command: {
              kind: 'accept',
              input: {
                tenant: h.access().tenant,
                session: h.access().session,
                operation: operationId(`accept-busy-${String(accepts)}`),
                value: ordinaryInput(`busy-${String(accepts)}`),
              },
            },
            guards: [],
          }),
          'unrelated accept',
        )
      }
      return next()
    })
    await h.accept('input-1')
    await vi.waitFor(async () => {
      const snapshot = await read(h)
      const first = (snapshot.executions ?? [])[0]
      expect(first?.terminal?.outcome).toBe('failed')
    })
    expect(accepts).toBe(1)
    expect(h.diagnostics().filter(item => item.step === 'finishRun')).toEqual([])
  })
})
