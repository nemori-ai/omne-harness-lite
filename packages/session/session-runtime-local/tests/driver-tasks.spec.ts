import { expect, it, vi } from 'vitest'
import { createDriverTaskOwner, type DriverTask } from '../src/driver-tasks.ts'

const policy = {
  scanLimit: 4,
  intervalMs: 20,
  maxTasks: 2,
  maxHeld: 3,
  maxFailures: 2,
  maxStepsPerPass: 4,
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function heldTask() {
  const completion = deferred<'released' | 'retained'>()
  let returned = false
  const task: DriverTask = {
    completion: completion.promise,
    requestStop: vi.fn(),
    close: vi.fn(async () => (returned ? 'released' : 'pending')),
  }
  return { task, completion, returned: () => (returned = true) }
}
async function settle() {
  await new Promise<void>(resolve => setImmediate(resolve))
}

it('reserves original slots before asynchronous construction and bounds active work', async () => {
  const owner = createDriverTaskOwner(policy, vi.fn())
  const first = deferred<DriverTask>(),
    second = deferred<DriverTask>()
  const create = vi.fn(() => first.promise)
  expect(owner.admit('one', create)).toBe(true)
  expect(owner.admit('one', create)).toBe(false)
  expect(owner.admit('two', () => second.promise)).toBe(true)
  expect(owner.admit('three', create)).toBe(false)
  await settle()
  expect(create).toHaveBeenCalledTimes(1)
  expect(await owner.close()).toEqual({ pending: true, held: 2 })
  const a = heldTask(),
    b = heldTask()
  a.returned()
  b.returned()
  first.resolve(a.task)
  second.resolve(b.task)
  await settle()
  expect(a.task.requestStop).toHaveBeenCalledTimes(1)
  expect(b.task.requestStop).toHaveBeenCalledTimes(1)
  expect(await owner.close()).toEqual({ closed: true })
  expect(owner.admit('one', create)).toBe(false)
})

it('retains pending original tasks and repeats only their close after actual return', async () => {
  const owner = createDriverTaskOwner(policy, vi.fn())
  const original = heldTask()
  const create = vi.fn(async () => original.task)
  owner.admit('one', create)
  await settle()
  original.completion.resolve('retained')
  await settle()
  const a = owner.close(),
    b = owner.close()
  expect(a).toBe(b)
  expect(await a).toEqual({ pending: true, held: 1 })
  expect(original.task.close).toHaveBeenCalledTimes(1)
  expect(owner.admit('two', create)).toBe(false)
  original.returned()
  expect(await owner.close()).toEqual({ closed: true })
  expect(original.task.close).toHaveBeenCalledTimes(2)
  expect(create).toHaveBeenCalledTimes(1)
  expect(original.task.requestStop).toHaveBeenCalledTimes(1)
})

it('does not treat an unsettled completion as release and bounds held entries', async () => {
  const owner = createDriverTaskOwner(policy, vi.fn())
  const originals = [heldTask(), heldTask(), heldTask()]
  owner.admit('one', async () => originals[0]!.task)
  owner.admit('two', async () => originals[1]!.task)
  await settle()
  originals[0]!.completion.resolve('retained')
  await settle()
  expect(owner.admit('three', async () => originals[2]!.task)).toBe(true)
  await settle()
  originals[1]!.completion.resolve('retained')
  originals[2]!.completion.resolve('retained')
  await settle()
  expect(owner.admit('four', async () => heldTask().task)).toBe(false)
  expect(await owner.close()).toEqual({ pending: true, held: 3 })
  for (const original of originals) original.returned()
  expect(await owner.close()).toEqual({ closed: true })
})

it('keeps startup and diagnostic defects instead of dropping an original slot', async () => {
  const startup = new Error('original acquisition failed')
  const diagnostic = new Error('diagnostic failed')
  const owner = createDriverTaskOwner(policy, () => {
    throw diagnostic
  })
  const create = vi.fn(async () => {
    throw startup
  })
  owner.admit('one', create)
  await settle()
  expect(owner.admit('two', create)).toBe(false)
  await expect(owner.close()).rejects.toMatchObject({ errors: [startup, diagnostic] })
  expect(create).toHaveBeenCalledTimes(1)
})

it('returns independently owned completed work without stopping a different driver', async () => {
  const a = createDriverTaskOwner(policy, vi.fn()),
    b = createDriverTaskOwner(policy, vi.fn())
  const first = heldTask(),
    second = heldTask()
  a.admit('same-session-label', async () => first.task)
  b.admit('same-session-label', async () => second.task)
  await settle()
  first.completion.resolve('released')
  await settle()
  expect(await a.close()).toEqual({ closed: true })
  expect(second.task.requestStop).not.toHaveBeenCalled()
  expect(await b.close()).toEqual({ pending: true, held: 1 })
  second.returned()
  expect(await b.close()).toEqual({ closed: true })
})

it('reports an original return defect and explicitly retries that same retained close', async () => {
  const defect = new Error('original borrow return failed')
  const diagnostic = vi.fn()
  const owner = createDriverTaskOwner(policy, diagnostic)
  const original = heldTask()
  const close = vi
    .fn<DriverTask['close']>()
    .mockRejectedValueOnce(defect)
    .mockResolvedValueOnce('released')
  const task = { ...original.task, close }
  const create = vi.fn(async () => task)
  owner.admit('one', create)
  await settle()
  await expect(owner.close()).rejects.toMatchObject({ errors: [defect] })
  expect(diagnostic).toHaveBeenCalledWith(defect)
  expect(await owner.close()).toEqual({ closed: true })
  expect(close).toHaveBeenCalledTimes(2)
  expect(create).toHaveBeenCalledTimes(1)
})

it('admits a later scan after a known admission block but retains unknown original work', async () => {
  const owner = createDriverTaskOwner(policy, vi.fn())
  const blocked: DriverTask = {
    completion: Promise.resolve('admissionBlocked'),
    admission: () => ({ inputPosition: 3, reason: 'loginRejected' }),
    requestStop: vi.fn(),
    close: vi.fn<DriverTask['close']>(async () => 'released'),
  }
  expect(owner.admit('session', async () => blocked)).toBe(true)
  await settle()
  expect(owner.readRunAdmission('session')).toEqual({ inputPosition: 3, reason: 'loginRejected' })
  const unknown = heldTask()
  expect(owner.admit('session', async () => unknown.task)).toBe(true)
  await settle()
  unknown.completion.resolve('retained')
  await settle()
  expect(owner.admit('session', async () => blocked)).toBe(false)
  unknown.returned()
  expect(await owner.close()).toEqual({ closed: true })
})
