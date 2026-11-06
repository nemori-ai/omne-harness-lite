import { afterEach, expect, it, vi } from 'vitest'
import { controlled } from './support/controlled-worker.ts'

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
