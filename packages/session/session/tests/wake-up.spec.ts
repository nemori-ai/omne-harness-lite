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

async function activeRun(h: Harness) {
  const snapshot = await read(h)
  if (snapshot.run.kind !== 'active') throw new Error('no active Run')
  return snapshot.run
}

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
  await notice()
  await reading.promise
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
  held.open()
  await vi.waitFor(async () => {
    expect((await read(h)).handed).toEqual(['input-1'])
  })
})

describe('GrantedInvoked: a granted Run whose invoke was not accepted is invoked again', () => {
  for (const [name, backend] of [
    ['memory', memoryBackend],
    ['sql', sqlBackend],
  ] as const)
    it(`${name}: after the retries run out on an unavailable Agent, the recovery scan invokes it with the same identity`, async () => {
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
    recordInvokes(h, input =>
      Promise.resolve(
        fail({
          kind: 'invalid' as const,
          input: input.initial[0],
          reason: 'refused',
          rejection: evidence('agent/refused'),
        }),
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

describe('the bounded close is not starved by unrelated commits (contract I-R2)', () => {
  it('an accept between its read and its commit does not stop the close of a refused first input', async () => {
    const h = await service({ policy: { command: { retriesOnChanged: 1 } } })
    await h.create()
    recordInvokes(h, (input, original) =>
      input.initial[0] === 'input-1'
        ? Promise.resolve(
            fail({
              kind: 'invalid' as const,
              input: input.initial[0],
              reason: 'refused',
              rejection: evidence('agent/refused'),
            }),
          )
        : original(input),
    )
    let accepts = 0
    h.view.onCommit(async (input, next) => {
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
