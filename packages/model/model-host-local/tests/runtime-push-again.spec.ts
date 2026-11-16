import { afterEach, expect, it, vi } from 'vitest'
import { LIMITS, quiet, scriptedReceiver, until, world } from './support/push-world.ts'

const DRIFT_MS = 200
const UNREADABLE = 'could not be frozen (recovery)'

afterEach(() => {
  vi.useRealTimers()
})

async function started(input: Parameters<typeof world>[0] = {}) {
  const w = world(input)
  await w.services()
  const fiber = w.load()
  await fiber
  const scripted = scriptedReceiver()
  await w.register(scripted.receiver)
  return { w, scripted, fiber }
}

function unbox<T>(reply: { ok: T } | { failure: unknown }): T {
  if ('ok' in reply) return reply.ok
  throw new Error(JSON.stringify(reply.failure))
}

const seen = (w: ReturnType<typeof world>, text: string) =>
  w.warnings.filter(warning => warning.includes(text)).length

it('pushes a settled result once its recovery can be read again, and gives the share back', async () => {
  const { w, scripted } = await started({ share: 1 })
  const load = { readable: false }
  w.hooks.loadRecovery = settled => (settled && !load.readable ? 'fail' : 'pass')
  vi.useFakeTimers({ shouldAdvanceTime: true })
  await w.admit('first')
  await until(() => seen(w, UNREADABLE) === 1, 'the unreadable recovery')
  expect(scripted.pushes).toHaveLength(0)
  expect(await w.tryAdmit('second')).toMatchObject({
    failure: { kind: 'unavailable', dependency: 'model-capacity' },
  })
  load.readable = true
  await vi.advanceTimersByTimeAsync(1000)
  await until(() => w.record('first')?.cleanup === 'released', 'the push, ACK and cleanup')
  expect(scripted.pushes).toHaveLength(1)
  expect(await w.tryAdmit('second')).toMatchObject({ ok: { recovered: false } })
})

it('wakes a call that stays unreadable again after 1 s, 5 s and 30 s', async () => {
  const { w, scripted } = await started()
  const load = { readable: false }
  w.hooks.loadRecovery = settled => (settled && !load.readable ? 'fail' : 'pass')
  vi.useFakeTimers({ shouldAdvanceTime: true })
  await w.admit('one')
  await until(() => seen(w, UNREADABLE) === 1, 'the unreadable recovery')
  for (const pause of [1000, 5000, 30000, 30000]) {
    const before = seen(w, UNREADABLE)
    await vi.advanceTimersByTimeAsync(pause - DRIFT_MS)
    expect(seen(w, UNREADABLE)).toBe(before)
    await vi.advanceTimersByTimeAsync(DRIFT_MS)
    await until(() => seen(w, UNREADABLE) === before + 1, 'the next wakeup')
  }
  load.readable = true
  await vi.advanceTimersByTimeAsync(30000)
  await until(() => w.record('one')?.cleanup === 'released', 'the push, ACK and cleanup')
  expect(scripted.pushes).toHaveLength(1)
  const wakeups = seen(w, UNREADABLE)
  await vi.advanceTimersByTimeAsync(120000)
  expect(seen(w, UNREADABLE)).toBe(wakeups)
})

it('answers settled, not lost, for a call that waits for its next wakeup', async () => {
  const { w } = await started({ lostContact: () => null })
  w.hooks.loadRecovery = settled => (settled ? 'fail' : 'pass')
  vi.useFakeTimers({ shouldAdvanceTime: true })
  await w.admit('one')
  await until(() => seen(w, UNREADABLE) === 1, 'the unreadable recovery')
  await quiet()
  expect(unbox(await w.contact('one'))).toEqual({ kind: 'settled' })
})

it('does not wake again a call whose recovery is refused', async () => {
  const { w, scripted } = await started()
  w.hooks.loadRecovery = settled => (settled ? 'deny' : 'pass')
  vi.useFakeTimers({ shouldAdvanceTime: true })
  await w.admit('one')
  await until(() => seen(w, UNREADABLE) === 1, 'the refused recovery')
  await vi.advanceTimersByTimeAsync(120000)
  expect(seen(w, UNREADABLE)).toBe(1)
  expect(scripted.pushes).toHaveLength(0)
})

it.each(['unavailable', 'backpressured'] as const)(
  'pushes a result again, once per wakeup, after its receiver answered %s',
  async refusal => {
    const { w, scripted } = await started()
    scripted.state.next = [refusal, refusal]
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await w.admit('one')
    await until(() => w.record('one')?.result?.standing.status === 'waiting', 'the waiting result')
    await vi.advanceTimersByTimeAsync(1000 - DRIFT_MS)
    expect(scripted.pushes).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(DRIFT_MS)
    await until(() => scripted.pushes.length === 2, 'the second push')
    await vi.advanceTimersByTimeAsync(5000 - DRIFT_MS)
    expect(scripted.pushes).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(DRIFT_MS)
    await until(() => w.record('one')?.cleanup === 'released', 'the push, ACK and cleanup')
    expect(scripted.pushes).toHaveLength(3)
    expect(scripted.pushes[2]).toEqual(scripted.pushes[0])
  },
)

it('leaves a result that was refused or given up to its caller', async () => {
  const refused = await started()
  refused.scripted.state.next = ['foreign-key']
  const unknown = await started()
  unknown.scripted.state.next = Array.from({ length: 20 }, () => 'unknown' as const)
  vi.useFakeTimers({ shouldAdvanceTime: true })
  await refused.w.admit('one')
  await unknown.w.admit('one')
  await until(
    () => refused.w.record('one')?.result?.standing.status === 'failed',
    'the refused receipt',
  )
  await until(
    () => unknown.w.record('one')?.result?.standing.status === 'unknown',
    'the given-up push',
  )
  await vi.advanceTimersByTimeAsync(120000)
  expect(refused.scripted.pushes).toHaveLength(1)
  expect(unknown.scripted.pushes).toHaveLength(1 + LIMITS.maxRedeliveries)
})

it('acknowledges in the same life once the consumer evidence is back', async () => {
  const { w, scripted } = await started({ share: 1, custodyEvidence: 'unavailable' })
  vi.useFakeTimers({ shouldAdvanceTime: true })
  await w.admit('first')
  await until(() => w.handoffs.length === 1, 'the ACK attempt after saved')
  await quiet()
  expect(await w.custody('first')).toEqual({ kind: 'producer' })
  w.evidence.mode = 'verified'
  await vi.advanceTimersByTimeAsync(1000)
  await until(() => w.record('first')?.cleanup === 'released', 'the ACK and cleanup')
  expect(w.handoffs).toHaveLength(2)
  expect(w.handoffs[1]).toEqual(w.handoffs[0])
  expect(scripted.pushes).toHaveLength(1)
  expect(await w.tryAdmit('second')).toMatchObject({ ok: { recovered: false } })
})

it('finishes in the same life a cleanup that failed, without a second ACK', async () => {
  const { w, scripted } = await started()
  w.hooks.advanceCleanup = () => 'fail'
  vi.useFakeTimers({ shouldAdvanceTime: true })
  await w.admit('one')
  await until(() => seen(w, 'cleanup stays pending') === 1, 'the failed cleanup')
  expect(w.record('one')).toMatchObject({ acknowledgement: 'acknowledged', cleanup: 'pending' })
  w.hooks.advanceCleanup = () => 'pass'
  await vi.advanceTimersByTimeAsync(1000)
  await until(() => w.record('one')?.cleanup === 'released', 'the cleanup')
  expect(w.handoffs).toHaveLength(1)
  expect(scripted.pushes).toHaveLength(1)
})

it('starts the pauses of a call over after a wakeup that left nothing', async () => {
  const { w, scripted } = await started()
  w.hooks.loadRecovery = settled => (settled && seen(w, UNREADABLE) < 2 ? 'fail' : 'pass')
  vi.useFakeTimers({ shouldAdvanceTime: true })
  await w.admit('one')
  await until(() => seen(w, UNREADABLE) === 1, 'the unreadable recovery')
  await vi.advanceTimersByTimeAsync(1000)
  await until(() => seen(w, UNREADABLE) === 2, 'the second unreadable recovery')
  await vi.advanceTimersByTimeAsync(5000)
  await until(() => w.record('one')?.cleanup === 'released', 'the push, ACK and cleanup')
  scripted.state.refuseAccounts = true
  expect(await w.late('one', '2')).toMatchObject({ ok: { recovered: false } })
  await until(() => scripted.pushes.length === 2, 'the refused account')
  scripted.state.refuseAccounts = false
  await vi.advanceTimersByTimeAsync(1000)
  await until(
    () => w.record('one')?.accounts.every(held => held.standing.status === 'saved') === true,
    'the account saved after the first pause',
  )
  expect(scripted.pushes).toHaveLength(3)
})

it('stops waiting for the next wakeup when the plugin is unloaded', async () => {
  const { w, fiber } = await started()
  w.hooks.loadRecovery = settled => (settled ? 'fail' : 'pass')
  vi.useFakeTimers({ shouldAdvanceTime: true })
  await w.admit('one')
  await until(() => seen(w, UNREADABLE) === 1, 'the unreadable recovery')
  await fiber.dispose()
  await vi.advanceTimersByTimeAsync(120000)
  expect(seen(w, UNREADABLE)).toBe(1)
})
