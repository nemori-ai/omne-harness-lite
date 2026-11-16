import { afterEach, describe, expect, it, vi } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import type { SessionTransactionPort, WorkSnapshot } from '@omne-harness/session-contract'
import { operationId, ordinaryInput, succeeded } from '@omne-harness/session-contract/testing'
import type { MaintenanceHandle } from '../src/index.ts'
import { turn } from './fixtures/control-fixture.ts'
import { memoryBackend } from './fixtures/backends.ts'
import { harness, TENANT_A, type Harness, type HarnessOptions } from './fixtures/harness.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

const PERIOD = 30000
const PERIODIC = ['inputs', 'unresolved', 'controls', 'run']

async function service(options: Partial<HarnessOptions> = {}): Promise<Harness> {
  const h = await harness({ backend: memoryBackend, ...options })
  open.push(h)
  return h
}

async function settle(): Promise<void> {
  for (let round = 0; round < 10; round += 1) await turn()
}

async function elapse(h: Harness, milliseconds: number): Promise<void> {
  await settle()
  h.clock.controls.advance(milliseconds)
  await settle()
}

function watchEnd(handle: MaintenanceHandle): () => boolean {
  let ended = false
  void handle.ended.then(() => {
    ended = true
  })
  return () => ended
}

function watchPending(h: Harness) {
  const reads: string[] = []
  let gate: Promise<void> | null = null
  let failNext = 0
  let failReason: string | null = null
  const directory = h.dependencies.directory as {
    current: () => SessionTransactionPort<string> | null
  }
  const current = directory.current.bind(directory)
  directory.current = () => {
    const port = current()
    if (port === null) return null
    return {
      ...port,
      pending: async input => {
        const reason = input.reason ?? 'union'
        reads.push(reason)
        if (gate !== null) await gate
        if (failNext > 0 || reason === failReason) {
          failNext = Math.max(0, failNext - 1)
          if (reason === failReason) failReason = null
          return fail({
            kind: 'unavailable' as const,
            owner: 'storage',
            diagnostic: 'pending is down',
          })
        }
        return port.pending(input)
      },
    }
  }
  return {
    reads: () => [...reads],
    hold: (): (() => void) => {
      let release!: () => void
      gate = new Promise<void>(resolve => {
        release = resolve
      })
      return () => {
        gate = null
        release()
      }
    },
    failNext: (count: number) => {
      failNext = count
    },
    failOnce: (reason: string) => {
      failReason = reason
    },
  }
}

const read = async (h: Harness): Promise<WorkSnapshot> =>
  succeeded(await h.backend.transactions.readWork(h.access()), 'read')

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

async function runningScanner(h: Harness, pending: ReturnType<typeof watchPending>) {
  const release = pending.hold()
  const handle = succeeded(await h.instance.maintain(TENANT_A), 'maintain')
  await settle()
  expect(succeeded(await h.instance.maintain(TENANT_A), 'notice')).toBe(handle)
  release()
  await settle()
  return handle
}

describe('a tenant without work keeps no scanner', () => {
  it('stops after a startup round that lists nothing, and reads the tenant no more', async () => {
    const h = await service()
    const pending = watchPending(h)
    const handle = succeeded(await h.instance.maintain(TENANT_A), 'maintain')
    const ended = watchEnd(handle)
    await vi.waitFor(() => expect(ended()).toBe(true))
    await elapse(h, PERIOD)
    await elapse(h, PERIOD)
    expect(pending.reads()).toEqual(['union'])
  })

  it('a notice during the round keeps it for one more round; that empty round stops it', async () => {
    const h = await service()
    const pending = watchPending(h)
    const handle = await runningScanner(h, pending)
    const ended = watchEnd(handle)
    expect(ended()).toBe(false)
    await elapse(h, PERIOD)
    expect(pending.reads()).toEqual(['union', ...PERIODIC])
    await vi.waitFor(() => expect(ended()).toBe(true))
    await elapse(h, PERIOD)
    expect(pending.reads()).toEqual(['union', ...PERIODIC])
  })

  it('after it stopped, a notice starts a new scanner that finds the work', async () => {
    const h = await service({ advance: true })
    const pending = watchPending(h)
    const first = succeeded(await h.instance.maintain(TENANT_A), 'maintain')
    const ended = watchEnd(first)
    await vi.waitFor(() => expect(ended()).toBe(true))
    await h.create()
    await acceptDirectly(h, 'input-1')
    const second = succeeded(await h.instance.maintain(TENANT_A), 'notice')
    expect(second).not.toBe(first)
    await vi.waitFor(async () => expect((await read(h)).handed).toEqual(['input-1']))
    expect(pending.reads().slice(0, 2)).toEqual(['union', 'union'])
    await second.release()
  })
})

describe('a tenant with work', () => {
  it('is scanned each period by the four periodic reasons', async () => {
    const h = await service()
    const pending = watchPending(h)
    await h.create()
    await h.accept('input-1')
    const handle = succeeded(await h.instance.maintain(TENANT_A), 'maintain')
    const ended = watchEnd(handle)
    await elapse(h, PERIOD)
    await elapse(h, PERIOD)
    expect(pending.reads()).toEqual(['union', ...PERIODIC, ...PERIODIC])
    expect(ended()).toBe(false)
    await handle.release()
    await vi.waitFor(() => expect(ended()).toBe(true))
  })
})

describe('a read that fails', () => {
  it('a startup scan that cannot read is tried again after 1, 5 and 30 seconds, then runs', async () => {
    const h = await service()
    const pending = watchPending(h)
    await h.create()
    await h.accept('input-1')
    pending.failNext(4)
    const handle = succeeded(await h.instance.maintain(TENANT_A), 'maintain')
    for (const [count, delay] of [
      [2, 1000],
      [3, 5000],
      [4, 30000],
      [5, 30000],
    ] as const) {
      await elapse(h, delay - 1)
      expect(pending.reads()).toHaveLength(count - 1)
      await elapse(h, 1)
      expect(pending.reads()).toHaveLength(count)
    }
    await elapse(h, PERIOD)
    expect(pending.reads()).toEqual([...Array(5).fill('union'), ...PERIODIC])
    await handle.release()
  })

  it('a periodic round with one failed reason did not finish: it reads the rest and stops nothing', async () => {
    const h = await service()
    const pending = watchPending(h)
    const handle = await runningScanner(h, pending)
    const ended = watchEnd(handle)
    pending.failOnce('controls')
    await elapse(h, PERIOD)
    expect(pending.reads()).toEqual(['union', ...PERIODIC])
    expect(ended()).toBe(false)
    await elapse(h, PERIOD)
    expect(pending.reads()).toEqual(['union', ...PERIODIC, ...PERIODIC])
    await vi.waitFor(() => expect(ended()).toBe(true))
  })
})

describe('the handle and the instance', () => {
  it('a release during a periodic round hands over the page in hand and reads no further reason', async () => {
    const h = await service()
    const pending = watchPending(h)
    const handle = await runningScanner(h, pending)
    const release = pending.hold()
    await elapse(h, PERIOD)
    expect(pending.reads()).toEqual(['union', 'inputs'])
    await handle.release()
    release()
    await settle()
    expect(pending.reads()).toEqual(['union', 'inputs'])
  })

  it('a released scanner reads no more, and a closed instance answers unavailable', async () => {
    const h = await service()
    const pending = watchPending(h)
    const handle = await runningScanner(h, pending)
    await handle.release()
    await elapse(h, PERIOD)
    expect(pending.reads()).toEqual(['union'])
    await h.instance.close()
    expect(await h.instance.maintain(TENANT_A)).toEqual({
      failure: expect.objectContaining({ kind: 'unavailable', owner: 'session' }),
    })
  })
})
