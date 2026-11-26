import { afterEach, describe, expect, it, vi } from 'vitest'
import { fail, type Outcome } from '@omne-harness/operation-result'
import type { AgentDrivePort, WorkSnapshot } from '@omne-harness/session-contract'
import { operationId, ordinaryInput, succeeded } from '@omne-harness/session-contract/testing'
import { turn } from './fixtures/control-fixture.ts'
import { memoryBackend } from './fixtures/backends.ts'
import { harness, type Harness } from './fixtures/harness.ts'

type Invoke = AgentDrivePort['invoke']

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

async function service(): Promise<Harness> {
  const h = await harness({ backend: memoryBackend, advance: true })
  open.push(h)
  await h.create()
  return h
}
const read = async (h: Harness): Promise<WorkSnapshot> =>
  succeeded(await h.backend.transactions.readWork(h.access()), 'read')
const later = (h: Harness, input: string) =>
  h.faces('intake').work.accept({
    ...h.access(),
    operation: operationId(`accept-${input}`),
    value: { ...ordinaryInput(input), afterRun: true },
  })
const runOf = async (h: Harness) => {
  const { run } = await read(h)
  if (run.kind !== 'active') throw new Error(`no active Run: ${run.kind}`)
  return run
}

/** An Agent that holds each invoke until the case answers it. */
function heldAgent(h: Harness) {
  const answers: ((value: Awaited<ReturnType<Invoke>>) => void)[] = []
  const original = h.drive.invoke.bind(h.drive)
  h.drive.invoke = input =>
    new Promise(resolve => {
      answers.push(value => resolve(value))
    }).then(value => (value === 'pass' ? original(input) : value)) as ReturnType<Invoke>
  return {
    pass: (at: number) => answers[at]?.('pass' as never),
    refuse: (at: number) =>
      answers[at]?.(
        fail({ kind: 'refused', failure: 'invalid', field: 'x', reason: 'r' }) as Outcome<
          never,
          never
        > as never,
      ),
    count: () => answers.length,
    release: () => {
      for (const answer of answers.splice(0)) answer('pass' as never)
    },
  }
}

describe('an input sent to wait for this run to end (等这一轮结束再发)', () => {
  it('with no unfinished run it is an ordinary input: it starts the next run', async () => {
    const h = await service()
    succeeded(await later(h, 'alone'), 'accept')
    await vi.waitFor(async () => expect((await runOf(h)).initial).toEqual(['alone']))
    expect((await read(h)).deferredInputs ?? []).toEqual([])
  })

  it('is not handed to the run it came during, which still ends; the next run starts from it once that run is cancelled', async () => {
    const h = await service()
    const agent = heldAgent(h)
    await h.accept('first')
    await vi.waitFor(() => expect(agent.count()).toBe(1))
    agent.pass(0)
    await vi.waitFor(async () => expect((await read(h)).handed).toEqual(['first']))
    const during = await runOf(h)
    succeeded(await later(h, 'after'), 'accept after')
    await h.accept('urgent-not')
    await turn()
    const held = await read(h)
    expect(held.deferredInputs).toEqual([{ input: 'after', run: during.run }])
    expect(held.handed).not.toContain('after')
    expect(held.pending).toContain('after')
    succeeded(
      await h.faces('intake').work.cancelRun({
        ...h.access(),
        operation: operationId('cancel-1'),
        run: during.run,
        urgency: 'graceful',
      }),
      'cancel',
    )
    await vi.waitFor(async () => {
      const next = await runOf(h)
      expect(next.run).not.toBe(during.run)
    })
    expect((await read(h)).deferredInputs ?? []).toEqual([])
    expect((await read(h)).pending).toContain('after')
    agent.release()
  })

  it('stays when the run it waits for fails, and waits for the run opened after that to end', async () => {
    const h = await service()
    const agent = heldAgent(h)
    await h.accept('first')
    await vi.waitFor(() => expect(agent.count()).toBe(1))
    const failing = await runOf(h)
    succeeded(await later(h, 'after'), 'accept after')
    agent.refuse(0)
    await vi.waitFor(async () => expect((await read(h)).run.kind).toBe('terminal'))
    await turn()
    expect((await read(h)).run.kind).toBe('terminal')
    expect((await read(h)).deferredInputs).toEqual([{ input: 'after', run: null }])
    await h.accept('person')
    await vi.waitFor(async () => expect((await runOf(h)).initial).toEqual(['person']))
    const retried = await runOf(h)
    expect(retried.run).not.toBe(failing.run)
    expect((await read(h)).deferredInputs).toEqual([{ input: 'after', run: retried.run }])
    agent.release()
  })
})
