import { describe, expect, it } from 'vitest'
import {
  EMPTY_QUEUE,
  enqueue,
  headOf,
  isQueued,
  lanesOf,
  leave,
  restore,
  type RequestCandidate,
  type RequestQueue,
} from '../src/request-queue.ts'

const LIMIT = 3

function candidate(acceptId: string, over: Partial<RequestCandidate> = {}): RequestCandidate {
  return {
    tenant: 'tenant-a',
    session: 'session-1',
    acceptId,
    inputId: `input-${acceptId}`,
    message: `{"text":"${acceptId}"}`,
    login: 'login-a',
    ...over,
  }
}

function queueOf(...candidates: readonly RequestCandidate[]): RequestQueue {
  let queue = EMPTY_QUEUE
  for (const each of candidates) {
    const decided = enqueue(queue, each, LIMIT)
    if (decided.kind !== 'appended') throw new Error(`fixture enqueue answered ${decided.kind}`)
    queue = decided.queue
  }
  return queue
}

describe('enqueue, same identity and same content', () => {
  it('appends a request that is not queued to the tail of its session with the next number', () => {
    const queue = queueOf(candidate('a'))
    const decided = enqueue(queue, candidate('b'), LIMIT)
    expect(decided).toMatchObject({ kind: 'appended', request: { ...candidate('b'), seq: 1 } })
    if (decided.kind !== 'appended') return
    expect(headOf(decided.queue, 'tenant-a', 'session-1')).toEqual({ ...candidate('a'), seq: 0 })
    expect(isQueued(decided.queue, 'tenant-a', 'session-1', 'b')).toBe(true)
    expect(isQueued(queue, 'tenant-a', 'session-1', 'b')).toBe(false)
  })

  it('answers limited when the queue of the session is full', () => {
    const full = queueOf(candidate('a'), candidate('b'), candidate('c'))
    expect(enqueue(full, candidate('d'), LIMIT)).toEqual({ kind: 'limited' })
    expect(enqueue(full, candidate('d', { session: 'session-2' }), LIMIT).kind).toBe('appended')
  })

  it('recalls the queued request without appending, also when the queue is full', () => {
    const full = queueOf(candidate('a'), candidate('b'), candidate('c'))
    expect(enqueue(full, candidate('b'), LIMIT)).toEqual({
      kind: 'same',
      request: { ...candidate('b'), seq: 1 },
    })
  })
})

describe('enqueue, same identity and other content', () => {
  it('appends when the identity is not queued', () => {
    const left = leave(queueOf(candidate('a')), 'tenant-a', 'session-1', 'a')
    const decided = enqueue(left, candidate('a', { message: '{"text":"other"}' }), LIMIT)
    expect(decided).toMatchObject({ kind: 'appended', request: { message: '{"text":"other"}' } })
  })

  it.each([
    ['inputId', { inputId: 'input-other' }],
    ['message', { message: '{"text":"other"}' }],
    ['login', { login: 'login-other' }],
  ] as const)('answers conflict when the queued request differs in %s', (_field, over) => {
    const queue = queueOf(candidate('a'))
    expect(enqueue(queue, candidate('a', over), LIMIT)).toEqual({ kind: 'conflict' })
  })
})

describe('taking the head', () => {
  it('has nothing to take from a session without requests', () => {
    expect(headOf(EMPTY_QUEUE, 'tenant-a', 'session-1')).toBeUndefined()
    expect(headOf(queueOf(candidate('a')), 'tenant-a', 'session-2')).toBeUndefined()
  })

  it('takes the requests of a session in the order they were queued (R2)', () => {
    let queue = queueOf(candidate('a'), candidate('b'), candidate('c'))
    expect(headOf(queue, 'tenant-a', 'session-1')?.acceptId).toBe('a')
    queue = leave(queue, 'tenant-a', 'session-1', 'c')
    expect(headOf(queue, 'tenant-a', 'session-1')?.acceptId).toBe('a')
    queue = leave(queue, 'tenant-a', 'session-1', 'a')
    expect(headOf(queue, 'tenant-a', 'session-1')?.acceptId).toBe('b')
    queue = leave(queue, 'tenant-a', 'session-1', 'b')
    expect(headOf(queue, 'tenant-a', 'session-1')).toBeUndefined()
    expect(lanesOf(queue)).toEqual([])
  })

  it('restores the order of a session from the numbers, whatever order the requests come in', () => {
    const [first, second, third] = ['a', 'b', 'c'].map((id, seq) => ({ ...candidate(id), seq }))
    const queue = restore([third!, first!, second!])
    expect(headOf(queue, 'tenant-a', 'session-1')).toEqual(first)
    expect(headOf(leave(queue, 'tenant-a', 'session-1', 'a'), 'tenant-a', 'session-1')).toEqual(
      second,
    )
    const next = enqueue(queue, candidate('d'), 9)
    expect(next).toMatchObject({ kind: 'appended', request: { seq: 3 } })
  })
})

describe('query', () => {
  it('tells a queued identity from one that is not queued', () => {
    const queue = queueOf(candidate('a'))
    expect(isQueued(queue, 'tenant-a', 'session-1', 'a')).toBe(true)
    expect(isQueued(queue, 'tenant-a', 'session-1', 'b')).toBe(false)
    expect(isQueued(leave(queue, 'tenant-a', 'session-1', 'a'), 'tenant-a', 'session-1', 'a')).toBe(
      false,
    )
  })
})

describe('the tenant and the session together are the key (R5)', () => {
  it('keeps the same session and identity of two tenants apart', () => {
    const other = { tenant: 'tenant-b', message: '{"text":"other"}' }
    const queue = queueOf(candidate('a'))
    expect(isQueued(queue, 'tenant-b', 'session-1', 'a')).toBe(false)
    expect(headOf(queue, 'tenant-b', 'session-1')).toBeUndefined()
    const decided = enqueue(queue, candidate('a', other), LIMIT)
    expect(decided).toMatchObject({ kind: 'appended', request: { tenant: 'tenant-b', seq: 0 } })
    if (decided.kind !== 'appended') return
    expect(headOf(decided.queue, 'tenant-a', 'session-1')?.message).toBe('{"text":"a"}')
    expect(headOf(decided.queue, 'tenant-b', 'session-1')?.message).toBe('{"text":"other"}')
    const left = leave(decided.queue, 'tenant-b', 'session-1', 'a')
    expect(isQueued(left, 'tenant-a', 'session-1', 'a')).toBe(true)
    expect(lanesOf(decided.queue)).toEqual([
      ['tenant-a', 'session-1'],
      ['tenant-b', 'session-1'],
    ])
  })

  it('keeps the same identity of two sessions of one tenant apart', () => {
    const queue = queueOf(candidate('a'), candidate('a', { session: 'session-2', message: '{}' }))
    expect(headOf(queue, 'tenant-a', 'session-2')?.message).toBe('{}')
    const left = leave(queue, 'tenant-a', 'session-1', 'a')
    expect(isQueued(left, 'tenant-a', 'session-2', 'a')).toBe(true)
    expect(lanesOf(left)).toEqual([['tenant-a', 'session-2']])
  })
})
