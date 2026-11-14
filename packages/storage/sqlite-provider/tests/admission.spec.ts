import { describe, expect, it } from 'vitest'
import { Admission, type Acquired } from '../src/admission.ts'
import type { SqliteStorageConfig } from '../src/config.ts'
import { defaultConfig } from './support.ts'

const ROOT = process.platform === 'win32' ? 'C:\\data\\storage' : '/data/storage'

function admission(overrides: Partial<SqliteStorageConfig>): Admission {
  return new Admission({ ...defaultConfig(ROOT), admissionWaitMs: 10_000, ...overrides })
}

type Granted = Extract<Acquired, { kind: 'granted' }>

function now(acquired: Acquired | Promise<Acquired>): Acquired {
  if (acquired instanceof Promise) throw new Error('expected an answer at the call, not a wait')
  return acquired
}
function granted(acquired: Acquired | Promise<Acquired>): Granted {
  const answer = now(acquired)
  if (answer.kind !== 'granted') throw new Error(`expected granted, got ${answer.kind}`)
  return answer
}
function waiting(acquired: Acquired | Promise<Acquired>) {
  if (!(acquired instanceof Promise)) throw new Error(`expected a wait, got ${acquired.kind}`)
  const seen: { answer: Acquired | null } = { answer: null }
  void acquired.then(answer => void (seen.answer = answer))
  return seen
}
const turn = (): Promise<void> => new Promise(resolve => setImmediate(resolve))

describe('the write point', () => {
  it('holds the in-flight request bytes up to globalInFlightWriteBytes, and gives them back', async () => {
    const a = admission({
      admissionQueueLimit: 8,
      globalAdmissionLimit: 8,
      globalInFlightWriteBytes: 100,
    })
    const first = granted(a.reserveWrite('d1', 40))
    granted(a.reserveWrite('d2', 60))
    const third = waiting(a.reserveWrite('d3', 1))
    await turn()
    expect(third.answer).toBeNull()
    first.release()
    await turn()
    expect(third.answer?.kind).toBe('granted')
    granted(a.reserveWrite('d4', 39))
    expect(waiting(a.reserveWrite('d5', 1)).answer).toBeNull()
  })

  it('holds one response allowance per write up to globalWriteResponseBytes, and gives it back', async () => {
    const a = admission({
      admissionQueueLimit: 8,
      globalAdmissionLimit: 8,
      maxOperationResponseBytes: 10,
      globalWriteResponseBytes: 20,
    })
    const first = granted(a.reserveWrite('d1', 1))
    granted(a.reserveWrite('d2', 1))
    const third = waiting(a.reserveWrite('d3', 1))
    await turn()
    expect(third.answer).toBeNull()
    first.release()
    await turn()
    expect(third.answer?.kind).toBe('granted')
    expect(waiting(a.reserveWrite('d4', 1)).answer).toBeNull()
  })

  it('holds at most globalAdmissionLimit writes in all, across domains', async () => {
    const a = admission({ admissionQueueLimit: 2, globalAdmissionLimit: 2 })
    const first = granted(a.reserveWrite('d1', 1))
    granted(a.reserveWrite('d2', 1))
    const third = waiting(a.reserveWrite('d3', 1))
    await turn()
    expect(third.answer).toBeNull()
    first.release()
    await turn()
    expect(third.answer?.kind).toBe('granted')
  })

  it('keeps the count of a domain right when one of two of its writes ends', async () => {
    const a = admission({ admissionQueueLimit: 2, globalAdmissionLimit: 8 })
    const first = granted(a.reserveWrite('d1', 1))
    granted(a.reserveWrite('d1', 1))
    const third = waiting(a.reserveWrite('d1', 1))
    await turn()
    expect(third.answer).toBeNull()
    first.release()
    await turn()
    expect(third.answer?.kind).toBe('granted')
    const fourth = waiting(a.reserveWrite('d1', 1))
    await turn()
    expect(fourth.answer).toBeNull()
  })
})

describe('the control and query points', () => {
  it('count per domain: another domain is admitted while one is full', () => {
    const a = admission({
      controlQueuePerDomain: 1,
      controlQueueGlobal: 4,
      queryQueuePerDomain: 1,
      queryQueueGlobal: 4,
    })
    expect(now(a.reserveControl('d1')).kind).toBe('granted')
    expect(a.reserveControl('d1')).toBeInstanceOf(Promise)
    expect(now(a.reserveControl('d2')).kind).toBe('granted')
    expect(now(a.reserveQuery('d1')).kind).toBe('granted')
    expect(a.reserveQuery('d1')).toBeInstanceOf(Promise)
    expect(now(a.reserveQuery('d2')).kind).toBe('granted')
  })

  it('bound their waiting lists like their counts: one more than the list holds is refused at once', () => {
    const a = admission({
      controlQueuePerDomain: 1,
      controlQueueGlobal: 4,
      queryQueuePerDomain: 1,
      queryQueueGlobal: 4,
    })
    granted(a.reserveControl('d1'))
    waiting(a.reserveControl('d1'))
    expect(now(a.reserveControl('d1')).kind).toBe('full')
    granted(a.reserveQuery('d1'))
    waiting(a.reserveQuery('d1'))
    expect(now(a.reserveQuery('d1')).kind).toBe('full')
  })
})

it('close ends the waiters of all three points with closing', async () => {
  const a = admission({
    admissionQueueLimit: 1,
    globalAdmissionLimit: 1,
    controlQueuePerDomain: 1,
    controlQueueGlobal: 1,
    queryQueuePerDomain: 1,
    queryQueueGlobal: 1,
  })
  granted(a.reserveWrite('d1', 1))
  granted(a.reserveControl('d1'))
  granted(a.reserveQuery('d1'))
  const write = waiting(a.reserveWrite('d1', 1))
  const control = waiting(a.reserveControl('d1'))
  const query = waiting(a.reserveQuery('d1'))
  a.close()
  await turn()
  expect([write.answer?.kind, control.answer?.kind, query.answer?.kind]).toEqual([
    'closing',
    'closing',
    'closing',
  ])
})
