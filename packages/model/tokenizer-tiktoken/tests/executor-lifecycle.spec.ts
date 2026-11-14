import { afterEach, expect, it, vi } from 'vitest'
import { controlled, type ControlledWorker } from './support/controlled-worker.ts'

const input = [{ kind: 'text', text: 'abcd' }] as const
afterEach(() => {
  vi.useRealTimers()
})

it('holds capacity and release until count settlement and explicit cache-clear acknowledgement', async () => {
  const { executor, lease, worker } = await controlled({ maxQueuedJobs: 1 })
  const first = lease()
  const second = lease()
  const running = first.tokenizer.count(input)
  const waiting = second.tokenizer.count(input)
  let released = false
  const releasing = first.release().then(() => {
    released = true
  })
  expect(await running).toHaveProperty('failure')
  expect(executor.snapshot()).toMatchObject({ runningJobs: 1, queuedJobs: 1, leases: 2 })
  expect(worker().commands.filter(command => command.kind === 'count')).toHaveLength(1)
  expect(await second.tokenizer.count(input)).toHaveProperty('failure')
  expect(released).toBe(false)
  worker().complete()
  expect(released).toBe(false)
  expect(executor.snapshot()).toMatchObject({ runningJobs: 1, queuedJobs: 0 })
  worker().complete()
  expect(await waiting).toEqual({ ok: { tokens: '1' } })
  expect(released).toBe(false)
  worker().cleared()
  await releasing
  expect(released).toBe(true)
}, 5000)

it('serves waiting leases round-robin and allows only one count per lease at a time', async () => {
  const { lease, worker } = await controlled()
  const a = lease()
  const b = lease()
  const c = lease()
  const counts = [
    a.tokenizer.count(input),
    a.tokenizer.count(input),
    a.tokenizer.count(input),
    b.tokenizer.count(input),
    b.tokenizer.count(input),
    c.tokenizer.count(input),
  ]
  const order: number[] = []
  for (let index = 0; index < counts.length; index++) {
    order.push(worker().countCommand().lease)
    worker().complete()
  }
  expect(order).toEqual([order[0], order[1], order[2], order[0], order[1], order[0]])
  expect(new Set(order.slice(0, 3)).size).toBe(3)
  expect(await Promise.all(counts)).toEqual(
    Array.from({ length: 6 }, () => ({ ok: { tokens: '1' } })),
  )
}, 5000)

it('starts replacements only after actual exit and fails all waiting work when the budget is exhausted', async () => {
  const { executor, lease, worker, workers } = await controlled({ maxReplacementsPerMinute: 1 })
  const acquired = lease()
  const running = acquired.tokenizer.count(input)
  const queued = acquired.tokenizer.count(input)
  worker().crash()
  expect(await running).toHaveProperty('failure')
  expect(workers).toHaveLength(1)
  expect(executor.snapshot()).toMatchObject({ runningJobs: 1, queuedJobs: 1, replacements: 0 })
  worker().exit()
  await Promise.resolve()
  expect(workers).toHaveLength(2)
  expect(executor.snapshot()).toMatchObject({ runningJobs: 1, queuedJobs: 0, replacements: 1 })
  const another = acquired.tokenizer.count(input)
  worker().crash()
  worker().exit()
  expect(await queued).toHaveProperty('failure')
  expect(await another).toHaveProperty('failure')
  expect(executor.snapshot()).toMatchObject({
    workers: 0,
    runningJobs: 0,
    queuedJobs: 0,
    queuedBytes: 0,
  })
  expect(await acquired.tokenizer.count(input)).toHaveProperty('failure')
  expect(await acquired.release()).toEqual({ ok: undefined })
}, 5000)

it('ignores stale generations and rejects a reply with the wrong job identity', async () => {
  const { executor, lease, worker } = await controlled({ maxReplacementsPerMinute: 0 })
  const acquired = lease()
  const counting = acquired.tokenizer.count(input)
  const command = worker().countCommand()
  worker().reply({
    kind: 'counted',
    generation: command.generation - 1,
    job: command.job,
    lease: command.lease,
    result: { ok: { tokens: '999' } },
    stats: { cacheBytes: 0, cacheEntries: 0, pieceHits: 0, pieceMisses: 0 },
  })
  expect(executor.snapshot()).toMatchObject({ runningJobs: 1, completedJobs: 0 })
  worker().reply({
    kind: 'counted',
    generation: command.generation,
    job: command.job + 1,
    lease: command.lease,
    result: { ok: { tokens: '999' } },
    stats: { cacheBytes: 0, cacheEntries: 0, pieceHits: 0, pieceMisses: 0 },
  })
  expect(await counting).toHaveProperty('failure')
  expect(worker().terminated).toBe(true)
  expect(executor.snapshot().runningJobs).toBe(1)
  worker().exit()
  expect(executor.snapshot().runningJobs).toBe(0)
}, 5000)

it('enforces queue byte accounting with retained UTF16 and segment overhead', async () => {
  const { executor, lease, worker } = await controlled({ maxQueuedBytes: 164, maxInputBytes: 200 })
  const acquired = lease()
  const first = acquired.tokenizer.count([])
  const second = acquired.tokenizer.count([{ kind: 'text', text: 'ab' }])
  expect(executor.snapshot()).toMatchObject({ queuedBytes: 164, queuedJobs: 1 })
  expect(await acquired.tokenizer.count([])).toHaveProperty('failure')
  worker().complete()
  worker().complete()
  await Promise.all([first, second])
  expect(executor.snapshot()).toMatchObject({ queuedBytes: 0, queuedJobs: 0 })
}, 5000)

it('expires queued work and terminates a non-cooperative count without returning capacity early', async () => {
  vi.useFakeTimers()
  const { executor, lease, worker } = await controlled({
    jobTimeoutMs: 100,
    cancellationGraceMs: 73,
    maxReplacementsPerMinute: 0,
  })
  const acquired = lease()
  const first = acquired.tokenizer.count(input)
  const second = acquired.tokenizer.count(input)
  await vi.advanceTimersByTimeAsync(100)
  expect(await first).toHaveProperty('failure')
  expect(await second).toHaveProperty('failure')
  expect(executor.snapshot()).toMatchObject({ runningJobs: 1, queuedJobs: 0, queuedBytes: 0 })
  await vi.advanceTimersByTimeAsync(72)
  expect(worker().terminated).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(worker().terminated).toBe(true)
  const closing = executor.close()
  let closed = false
  void closing.then(() => {
    closed = true
  })
  await Promise.resolve()
  expect(closed).toBe(false)
  worker().exit()
  expect(await closing).toEqual({ ok: undefined })
  expect(executor.snapshot()).toMatchObject({ workers: 0, leases: 0, runningJobs: 0 })
}, 5000)

it('keeps one lease cache on one worker while two different leases use separate slots', async () => {
  const { executor, lease, workers } = await controlled({ workers: 2 })
  const a = lease()
  const b = lease()
  const a1 = a.tokenizer.count(input)
  const a2 = a.tokenizer.count(input)
  const b1 = b.tokenizer.count(input)
  expect(executor.snapshot()).toMatchObject({ runningJobs: 2, queuedJobs: 1 })
  const [first, second] = workers
  if (first === undefined || second === undefined) throw new Error('missing worker')
  const aId = first.countCommand().lease
  expect(second.countCommand().lease).not.toBe(aId)
  second.complete()
  expect(executor.snapshot()).toMatchObject({ runningJobs: 1, queuedJobs: 1 })
  first.complete()
  expect(first.countCommand().lease).toBe(aId)
  first.complete()
  expect(await Promise.all([a1, a2, b1])).toEqual(
    Array.from({ length: 3 }, () => ({ ok: { tokens: '1' } })),
  )
}, 5000)

it('renews replacement capacity after the rolling minute without retrying a failed count', async () => {
  vi.useFakeTimers()
  const { executor, lease, worker, workers } = await controlled({ maxReplacementsPerMinute: 1 })
  const acquired = lease()
  const first = acquired.tokenizer.count(input)
  worker().crash()
  worker().exit()
  expect(await first).toHaveProperty('failure')
  await Promise.resolve()
  expect(workers).toHaveLength(2)
  expect(worker().commands.filter(command => command.kind === 'count')).toHaveLength(0)
  await vi.advanceTimersByTimeAsync(60001)
  const second = acquired.tokenizer.count(input)
  worker().crash()
  worker().exit()
  expect(await second).toHaveProperty('failure')
  await Promise.resolve()
  expect(workers).toHaveLength(3)
  expect(executor.snapshot()).toMatchObject({ replacements: 2, runningJobs: 0, queuedJobs: 0 })
}, 5000)

it('lets a cancelled count that settles within the grace finish without stopping the worker', async () => {
  // 1000 ms is the local default: a thread that is only slow to be scheduled is not a stuck one.
  vi.useFakeTimers()
  const { executor, lease, worker, workers } = await controlled({ cancellationGraceMs: 1000 })
  const acquired = lease()
  const running = acquired.tokenizer.count(input)
  const releasing = acquired.release()
  expect(await running).toHaveProperty('failure')
  await vi.advanceTimersByTimeAsync(100)
  expect(worker().terminated).toBe(false)
  worker().complete()
  worker().cleared()
  expect(await releasing).toEqual({ ok: undefined })
  await vi.advanceTimersByTimeAsync(1000)
  expect(worker().terminated).toBe(false)
  expect(workers).toHaveLength(1)
  expect(executor.snapshot()).toMatchObject({ workers: 1, replacements: 0 })
}, 5000)

it('rejects a cancellation grace longer than the job deadline', async () => {
  await expect(controlled({ jobTimeoutMs: 1000, cancellationGraceMs: 1001 })).rejects.toThrow()
  expect(await controlled({ jobTimeoutMs: 1000, cancellationGraceMs: 1000 })).toHaveProperty(
    'executor',
  )
}, 5000)

/** Crashes the current worker and lets it exit, as a thread that died. */
async function lose(worker: () => ControlledWorker): Promise<void> {
  worker().crash()
  worker().exit()
  await Promise.resolve()
}

it('backs a slot off once its replacement budget is spent and starts it again, so the slot is never lost', async () => {
  vi.useFakeTimers()
  const { executor, lease, worker, workers } = await controlled({ maxReplacementsPerMinute: 0 })
  const acquired = lease()
  await lose(worker)
  expect(executor.snapshot()).toMatchObject({ workers: 0, replacements: 0 })
  expect(await acquired.tokenizer.count(input)).toHaveProperty('failure')
  // 1 s, 5 s, 30 s, then 30 s each time: each restart dies again before it counts anything.
  for (const [index, pause] of [1000, 5000, 30000, 30000].entries()) {
    await vi.advanceTimersByTimeAsync(pause - 1)
    expect(workers).toHaveLength(index + 1)
    await vi.advanceTimersByTimeAsync(1)
    expect(workers).toHaveLength(index + 2)
    expect(executor.snapshot()).toMatchObject({ workers: 1, replacements: index + 1 })
    await lose(worker)
  }
  await vi.advanceTimersByTimeAsync(30000)
  const counted = acquired.tokenizer.count(input)
  worker().complete()
  expect(await counted).toEqual({ ok: { tokens: '1' } })
}, 5000)

it('resets the backoff of a slot once its restarted worker answers a count', async () => {
  vi.useFakeTimers()
  const { lease, worker, workers } = await controlled({ maxReplacementsPerMinute: 0 })
  const acquired = lease()
  await lose(worker)
  await vi.advanceTimersByTimeAsync(1000)
  await lose(worker)
  await vi.advanceTimersByTimeAsync(5000)
  expect(workers).toHaveLength(3)
  const counted = acquired.tokenizer.count(input)
  worker().complete()
  expect(await counted).toEqual({ ok: { tokens: '1' } })
  await lose(worker)
  await vi.advanceTimersByTimeAsync(999)
  expect(workers).toHaveLength(3)
  await vi.advanceTimersByTimeAsync(1)
  expect(workers).toHaveLength(4)
}, 5000)

it('cancels the restart of a backed-off slot on close', async () => {
  vi.useFakeTimers()
  const { executor, lease, worker, workers } = await controlled({ maxReplacementsPerMinute: 0 })
  const acquired = lease()
  await lose(worker)
  expect(await executor.close()).toEqual({ ok: undefined })
  expect(await acquired.release()).toEqual({ ok: undefined })
  await vi.advanceTimersByTimeAsync(60000)
  expect(workers).toHaveLength(1)
  expect(executor.snapshot()).toMatchObject({ workers: 0, leases: 0 })
}, 5000)
