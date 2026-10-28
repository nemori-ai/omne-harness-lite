import { randomUUID } from 'node:crypto'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acknowledgeReduceSignal,
  superviseReduce,
  type ReduceSignal,
  type SuperviseInput,
  type SupervisePorts,
} from '../src/delivery/reduce-supervise.ts'
import { context, TIME, UUID } from './fixtures/collaboration.ts'
import { signalKinds } from '../src/delivery/reduce-supervise-values.ts'

const directories: string[] = []
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(TIME))
})
afterEach(() => {
  vi.useRealTimers()
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true })
})
function fixture() {
  const journalRoot = realpathSync(mkdtempSync(join(tmpdir(), 'reduce-supervise-')))
  directories.push(journalRoot)
  const input: SuperviseInput = {
    context,
    owner: 'owner',
    epoch: UUID,
    operationId: randomUUID(),
    journalRoot,
    phase: 'SERVE',
    deadline: new Date(Date.now() + 120_000).toISOString(),
    timeoutMs: 60_000,
  }
  let notify: (cursor: string | null) => void = () => {}
  const close = vi.fn()
  const ports: SupervisePorts = {
    subscribe: vi.fn(callback => {
      notify = callback
      return { close }
    }),
    reconcile: vi.fn(async () => []),
    health: vi.fn(async () => []),
    pollActiveRuns: vi.fn(async () => []),
    deadline: vi.fn(async () => [signal('deadline')]),
  }
  return { input, ports, close, notify: () => notify('event-2') }
}
function signal(signalKind: ReduceSignal['signalKind'], observed = 'changed'): ReduceSignal {
  return {
    signalKind,
    identity: `${signalKind}-object`,
    observed,
    phase: 'SERVE',
    eventCursor: null,
    evidence: ['authoritative-readback'],
    reasonCode: `${signalKind}-needs-action`,
  }
}

describe('bounded reduce supervision', () => {
  it('returns local health and new handoffs while an unrelated run read is slow', async () => {
    const f = fixture()
    f.ports.pollActiveRuns = () => new Promise(() => {})
    f.ports.health = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue([signal('infrastructure', 'receiver-dead')])
    const pending = superviseReduce(f.input, f.ports)
    await vi.advanceTimersByTimeAsync(5000)
    expect((await pending).pending[0]?.signal.reasonCode).toBe('infrastructure-needs-action')
    expect(f.close).toHaveBeenCalledOnce()
  })

  it.each(signalKinds)('returns %s facts without changing business state', async kind => {
    const f = fixture()
    f.ports.reconcile = vi.fn(async () => [signal(kind)])
    const result = await superviseReduce(f.input, f.ports)
    expect(result.status).toBe('actionable')
    expect(result.pending.map(item => item.signal.signalKind)).toEqual([kind])
    expect(f.close).toHaveBeenCalledOnce()
  })

  it('persists all arrivals, replays oldest backlog, and acknowledges separately from receipt', async () => {
    const f = fixture()
    f.ports.reconcile = vi.fn(async () => [signal('handoff'), signal('gate'), signal('release')])
    const first = await superviseReduce(f.input, f.ports)
    expect(first.pending.map(item => item.signal.signalKind)).toEqual([
      'handoff',
      'gate',
      'release',
    ])
    acknowledgeReduceSignal(f.input, first.pending[0]!.id, 'owner recorded claim')
    const recovered = await superviseReduce(f.input, f.ports)
    expect(recovered.pending.map(item => item.signal.signalKind)).toEqual(['gate', 'release'])
    expect(f.ports.reconcile).toHaveBeenCalledTimes(1)
    for (const item of recovered.pending)
      acknowledgeReduceSignal(f.input, item.id, 'owner recorded disposition')
    const timeout = superviseReduce({ ...f.input, timeoutMs: 1 }, f.ports)
    await vi.advanceTimersByTimeAsync(1)
    expect((await timeout).status).toBe('timeout')
    expect((await timeout).pending).toEqual([])
  })

  it('captures hints during reconciliation and drains them before waiting', async () => {
    const f = fixture()
    let resolve: (signals: ReduceSignal[]) => void = () => {}
    f.ports.reconcile = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<ReduceSignal[]>(done => {
            resolve = done
          }),
      )
      .mockResolvedValue([signal('handoff')])
    const pending = superviseReduce(f.input, f.ports)
    await Promise.resolve()
    f.notify()
    resolve([])
    const result = await pending
    expect(f.ports.reconcile).toHaveBeenCalledTimes(2)
    expect(result.pending[0]?.signal.eventCursor).toBe('event-2')
  })

  it('checks local health every five seconds without periodically reconciling all GitHub objects', async () => {
    const f = fixture()
    const pending = superviseReduce(f.input, f.ports)
    await vi.advanceTimersByTimeAsync(60_000)
    expect((await pending).status).toBe('timeout')
    expect(f.ports.reconcile).toHaveBeenCalledTimes(1)
    expect(f.ports.health).toHaveBeenCalledTimes(12)
    expect(f.ports.deadline).not.toHaveBeenCalled()
  })

  it('reports receiver death at the next five-second check and reports a configured deadline once', async () => {
    const f = fixture()
    f.ports.health = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue([signal('infrastructure', 'receiver-dead')])
    const pending = superviseReduce(f.input, f.ports)
    await vi.advanceTimersByTimeAsync(5000)
    expect((await pending).pending[0]?.signal.observed).toBe('receiver-dead')
    const g = fixture()
    g.input.deadline = new Date(Date.now() + 1000).toISOString()
    const deadline = superviseReduce(g.input, g.ports)
    await vi.advanceTimersByTimeAsync(1000)
    expect((await deadline).pending[0]?.signal.signalKind).toBe('deadline')
    expect(g.ports.deadline).toHaveBeenCalledOnce()
  })

  it('does not mistake infrastructure failure or cancellation for an empty queue', async () => {
    const f = fixture()
    f.ports.reconcile = async () => {
      throw new Error('permission denied')
    }
    await expect(superviseReduce(f.input, f.ports)).rejects.toThrow('permission denied')
    const g = fixture(),
      controller = new AbortController()
    const cancelled = superviseReduce({ ...g.input, signal: controller.signal }, g.ports)
    controller.abort()
    expect((await cancelled).status).toBe('cancelled')
    expect(g.close).toHaveBeenCalledOnce()
  })

  it.each(['timeout', 'abort'] as const)(
    'rejects corrupt completion state on %s and releases every resource',
    async completion => {
      const f = fixture(),
        controller = new AbortController()
      f.ports.stop = vi.fn()
      const pending = superviseReduce({ ...f.input, signal: controller.signal }, f.ports)
      await vi.advanceTimersByTimeAsync(1)
      writeFileSync(
        join(f.input.journalRoot, f.input.operationId, `signal-${'a'.repeat(64)}.json`),
        '{',
      )
      const rejected = expect(pending).rejects.toThrow('json-invalid')
      if (completion === 'abort') controller.abort()
      else await vi.advanceTimersByTimeAsync(60_000)
      await rejected
      expect(f.close).toHaveBeenCalledOnce()
      expect(f.ports.stop).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('rejects corrupt state at actionable completion without escaping the promise', async () => {
    const f = fixture()
    f.ports.stop = vi.fn()
    f.ports.reconcile = async () => [signal('handoff')]
    const enqueue = queueMicrotask
    const queued = vi.spyOn(globalThis, 'queueMicrotask').mockImplementationOnce(callback => {
      enqueue(() => {
        writeFileSync(
          join(f.input.journalRoot, f.input.operationId, `signal-${'a'.repeat(64)}.json`),
          '{',
        )
        callback()
      })
    })
    try {
      await expect(superviseReduce(f.input, f.ports)).rejects.toThrow('json-invalid')
      expect(f.close).toHaveBeenCalledOnce()
      expect(f.ports.stop).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      queued.mockRestore()
    }
  })

  it('settles completion and stops workers when subscription cleanup fails', async () => {
    const f = fixture()
    f.close.mockImplementation(() => {
      throw new Error('close failed')
    })
    f.ports.stop = vi.fn(() => {
      throw new Error('stop failed')
    })
    f.ports.reconcile = async () => [signal('handoff')]
    const error = await superviseReduce(f.input, f.ports).catch((failure: unknown) => failure)
    expect(error).toBeInstanceOf(AggregateError)
    if (!(error instanceof AggregateError)) throw new Error('Expected cleanup errors')
    expect(error.errors.map((failure: Error) => failure.message)).toEqual([
      'close failed',
      'stop failed',
    ])
    expect(f.close).toHaveBeenCalledOnce()
    expect(f.ports.stop).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects a new epoch in an old journal and missing deadline configuration', async () => {
    const f = fixture()
    f.ports.reconcile = async () => [signal('handoff')]
    await superviseReduce(f.input, f.ports)
    expect(() => superviseReduce({ ...f.input, epoch: randomUUID() }, f.ports)).toThrow(
      'reduce-supervise-identity-conflict',
    )
    expect(() => superviseReduce({ ...f.input, deadline: '' }, f.ports)).toThrow()
  })
})
