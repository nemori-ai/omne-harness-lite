import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Answer } from '../src/answers.ts'
import type { JournalRecord, RequestJournal } from '../src/ports.ts'
import { createRequestDrain, type RequestDrain } from '../src/request-drain.ts'
import type { QueuedRequest, RequestCandidate } from '../src/request-queue.ts'
import { createJournalDouble, type JournalDouble } from './fixtures/journal-double.ts'

type Settled = Answer<'send-input'>
type Step = Settled | 'retry' | 'throw' | Promise<Settled>

const SUCCEEDED: Settled = { outcome: 'succeeded', body: { recovered: false } }
const UNAVAILABLE: Settled = { outcome: 'basis-unavailable' }
const RETRY = 'retry' as const
const DELAYS = [10, 30, 70]

function candidate(acceptId: string, session = 'session-1', tenant = 'tenant-a'): RequestCandidate {
  return {
    tenant,
    session,
    acceptId,
    inputId: `input-${acceptId}`,
    message: `{"text":"${acceptId}"}`,
    login: 'login-a',
  }
}

function held(): { answer: Promise<Settled>; release(answer: Settled): void } {
  let release = (_answer: Settled): void => {}
  const answer = new Promise<Settled>(resolve => {
    release = resolve
  })
  return { answer, release }
}

type Rig = Readonly<{
  drain: RequestDrain
  store: JournalDouble
  admitted: string[]
  inFlight(): number
  script(acceptId: string, ...steps: readonly Step[]): void
}>

function rig(options: { store?: JournalDouble; journal?: RequestJournal; limit?: number } = {}) {
  const store = options.store ?? createJournalDouble()
  const admitted: string[] = []
  const scripts = new Map<string, Step[]>()
  let inFlight = 0
  const made: Rig = {
    store,
    admitted,
    inFlight: () => inFlight,
    script: (acceptId, ...steps) => {
      scripts.set(acceptId, [...steps])
    },
    drain: createRequestDrain({
      journal: options.journal ?? store.open(),
      limit: options.limit ?? 4,
      retryDelaysMs: DELAYS,
      admit: async (request: QueuedRequest) => {
        admitted.push(`${request.session}/${request.acceptId}`)
        const step = scripts.get(request.acceptId)?.shift() ?? SUCCEEDED
        if (step === 'throw') throw new Error('admission fault')
        if (step === 'retry') return { kind: 'retry' }
        inFlight += 1
        try {
          return { kind: 'settled', answer: await step }
        } finally {
          inFlight -= 1
        }
      },
    }),
  }
  return made
}

const turn = (): Promise<unknown> => vi.advanceTimersByTimeAsync(0)
const kinds = (records: readonly JournalRecord[]): string[] =>
  records.map(record => `${record.kind}:${record.session}/${record.acceptId}`)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('one lane for each session', () => {
  it('takes only the head: the next request waits until the head has left (R2)', async () => {
    const { drain, admitted, script, inFlight, store } = rig()
    const first = held()
    script('a', first.answer)
    const a = drain.enqueue(candidate('a'))
    const b = drain.enqueue(candidate('b'))
    await turn()
    expect(admitted).toEqual(['session-1/a'])
    expect(inFlight()).toBe(1)
    first.release(SUCCEEDED)
    expect(await a).toEqual(SUCCEEDED)
    expect(await b).toEqual(SUCCEEDED)
    expect(admitted).toEqual(['session-1/a', 'session-1/b'])
    expect(kinds(store.records())).toEqual([
      'enqueued:session-1/a',
      'enqueued:session-1/b',
      'left:session-1/a',
      'left:session-1/b',
    ])
  })

  it('keeps the next request behind a head that is being retried (R2)', async () => {
    const { drain, admitted, script } = rig()
    script('a', RETRY, RETRY, 'throw', SUCCEEDED)
    const a = drain.enqueue(candidate('a'))
    const b = drain.enqueue(candidate('b'))
    await vi.advanceTimersByTimeAsync(10 + 30)
    expect(admitted).toEqual(['session-1/a', 'session-1/a', 'session-1/a'])
    await vi.advanceTimersByTimeAsync(70)
    expect(await a).toEqual(SUCCEEDED)
    expect(await b).toEqual(SUCCEEDED)
    expect(admitted).toEqual([
      'session-1/a',
      'session-1/a',
      'session-1/a',
      'session-1/a',
      'session-1/b',
    ])
  })

  it('settles the requests of one session while the head of another is being retried (R3)', async () => {
    const { drain, admitted, script } = rig()
    script('a', ...Array.from({ length: 50 }, () => RETRY))
    void drain.enqueue(candidate('a', 'session-1'))
    void drain.enqueue(candidate('c', 'session-1'))
    await turn()
    const b = drain.enqueue(candidate('b', 'session-2'))
    const d = drain.enqueue(candidate('d', 'session-1', 'tenant-b'))
    await turn()
    expect(await b).toEqual(SUCCEEDED)
    expect(await d).toEqual(SUCCEEDED)
    expect(admitted).toEqual(['session-1/a', 'session-2/b', 'session-1/d'])
    expect(drain.isQueued('tenant-a', 'session-1', 'a')).toBe(true)
    expect(drain.isQueued('tenant-a', 'session-1', 'c')).toBe(true)
    expect(drain.isQueued('tenant-a', 'session-2', 'b')).toBe(false)
    drain.stop()
  })

  it('admits one request of a session at a time, and requests of two sessions together', async () => {
    const { drain, script, inFlight } = rig()
    const one = held()
    const two = held()
    script('a', one.answer)
    script('b', two.answer)
    void drain.enqueue(candidate('a', 'session-1'))
    void drain.enqueue(candidate('c', 'session-1'))
    void drain.enqueue(candidate('b', 'session-2'))
    await turn()
    expect(inFlight()).toBe(2)
    one.release(SUCCEEDED)
    two.release(SUCCEEDED)
    await turn()
    expect(inFlight()).toBe(0)
  })
})

describe('retrying the head', () => {
  it('waits the delays of the sequence in order and stays on the last one', async () => {
    const { drain, admitted, script } = rig()
    script('a', ...Array.from({ length: 50 }, () => RETRY))
    void drain.enqueue(candidate('a'))
    await turn()
    expect(admitted).toHaveLength(1)
    for (const [delay, attempts] of [
      [10, 2],
      [30, 3],
      [70, 4],
      [70, 5],
      [70, 6],
    ] as const) {
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(admitted).toHaveLength(attempts - 1)
      await vi.advanceTimersByTimeAsync(1)
      expect(admitted).toHaveLength(attempts)
    }
    drain.stop()
  })

  it('starts the sequence again after a request has left the head', async () => {
    const { drain, admitted, script } = rig()
    script('a', RETRY, RETRY, SUCCEEDED)
    script('b', RETRY, SUCCEEDED)
    const a = drain.enqueue(candidate('a'))
    const b = drain.enqueue(candidate('b'))
    await vi.advanceTimersByTimeAsync(10 + 30)
    expect(await a).toEqual(SUCCEEDED)
    expect(admitted).toHaveLength(4)
    await vi.advanceTimersByTimeAsync(9)
    expect(admitted).toHaveLength(4)
    await vi.advanceTimersByTimeAsync(1)
    expect(await b).toEqual(SUCCEEDED)
    expect(admitted).toHaveLength(5)
  })

  it.each([[{ outcome: 'basis-unavailable' }], [{ outcome: 'unknown' }]] as const)(
    'lets a request leave with the settled answer %j and takes the next request',
    async answer => {
      const { drain, admitted, script, store } = rig()
      script('a', answer)
      const a = drain.enqueue(candidate('a'))
      const b = drain.enqueue(candidate('b'))
      expect(await a).toEqual(answer)
      expect(await b).toEqual(SUCCEEDED)
      expect(admitted).toEqual(['session-1/a', 'session-1/b'])
      expect(vi.getTimerCount()).toBe(0)
      expect(kinds(store.records())).toEqual([
        'enqueued:session-1/a',
        'enqueued:session-1/b',
        'left:session-1/a',
        'left:session-1/b',
      ])
    },
  )

  it('gives a definite refusal to the call and lets the request leave', async () => {
    const { drain, script, store } = rig()
    script('a', { outcome: 'denied' })
    expect(await drain.enqueue(candidate('a'))).toEqual({ outcome: 'denied' })
    expect(drain.isQueued('tenant-a', 'session-1', 'a')).toBe(false)
    expect(kinds(store.records())).toEqual(['enqueued:session-1/a', 'left:session-1/a'])
  })
})

describe('entering the queue', () => {
  it('admits on open the requests the journal still holds, each session from its head', async () => {
    const store = createJournalDouble()
    const before = store.open()
    await before.append({ kind: 'enqueued', ...candidate('b'), seq: 1 })
    await before.append({ kind: 'enqueued', ...candidate('a'), seq: 0 })
    await before.append({ kind: 'enqueued', ...candidate('c', 'session-2'), seq: 0 })
    const { drain, admitted } = rig({ store })
    expect(drain.isQueued('tenant-a', 'session-1', 'b')).toBe(true)
    await turn()
    expect(admitted).toEqual(['session-1/a', 'session-2/c', 'session-1/b'])
    expect(drain.isQueued('tenant-a', 'session-1', 'b')).toBe(false)
    expect(kinds(store.records()).slice(3)).toEqual([
      'left:session-1/a',
      'left:session-2/c',
      'left:session-1/b',
    ])
  })

  it('gives the same answer to a call that brings a queued request again, and admits it once', async () => {
    const { drain, admitted, script, store } = rig()
    const first = held()
    script('a', first.answer)
    const one = drain.enqueue(candidate('a'))
    await turn()
    const two = drain.enqueue(candidate('a'))
    first.release({ outcome: 'succeeded', body: { recovered: true } })
    expect(await one).toEqual({ outcome: 'succeeded', body: { recovered: true } })
    expect(await two).toEqual({ outcome: 'succeeded', body: { recovered: true } })
    expect(admitted).toEqual(['session-1/a'])
    expect(kinds(store.records())).toEqual(['enqueued:session-1/a', 'left:session-1/a'])
  })

  it('answers conflict to other content under a queued identity, and limited to a full queue', async () => {
    const { drain, script, admitted } = rig({ limit: 2 })
    const first = held()
    script('a', first.answer)
    void drain.enqueue(candidate('a'))
    void drain.enqueue(candidate('b'))
    expect(await drain.enqueue({ ...candidate('a'), message: '{}' })).toEqual({
      outcome: 'conflict',
      body: {},
    })
    expect(await drain.enqueue(candidate('c'))).toEqual({
      outcome: 'limited',
      body: { resource: 'pending-inputs', limit: 2 },
    })
    await turn()
    expect(admitted).toEqual(['session-1/a'])
    expect(drain.isQueued('tenant-a', 'session-1', 'c')).toBe(false)
    drain.stop()
  })

  it('answers basis-unavailable and admits nothing when the journal does not take the request', async () => {
    const { drain, admitted, store } = rig()
    store.refuse(record => record.acceptId === 'a')
    expect(await drain.enqueue(candidate('a'))).toEqual(UNAVAILABLE)
    expect(drain.isQueued('tenant-a', 'session-1', 'a')).toBe(false)
    expect(admitted).toEqual([])
    expect(await drain.enqueue(candidate('b'))).toEqual(SUCCEEDED)
    expect(admitted).toEqual(['session-1/b'])
  })

  it('does not admit a request before the journal has taken it', async () => {
    const taken = held()
    const records: JournalRecord[] = []
    const journal: RequestJournal = {
      pending: [],
      append: async record => {
        records.push(record)
        if (record.kind === 'enqueued' && record.acceptId === 'b') await taken.answer
        return true
      },
      close: async () => {},
    }
    const { drain, admitted, script } = rig({ journal })
    const first = held()
    script('a', first.answer)
    const a = drain.enqueue(candidate('a'))
    const b = drain.enqueue(candidate('b'))
    await turn()
    first.release(SUCCEEDED)
    expect(await a).toEqual(SUCCEEDED)
    await turn()
    expect(admitted).toEqual(['session-1/a'])
    expect(drain.isQueued('tenant-a', 'session-1', 'b')).toBe(true)
    taken.release(SUCCEEDED)
    expect(await b).toEqual(SUCCEEDED)
    expect(admitted).toEqual(['session-1/a', 'session-1/b'])
  })

  it('answers the call although the journal did not take the leave', async () => {
    const { drain, store } = rig()
    store.refuse(record => record.kind === 'left')
    expect(await drain.enqueue(candidate('a'))).toEqual(SUCCEEDED)
    expect(drain.isQueued('tenant-a', 'session-1', 'a')).toBe(false)
    expect(store.open().pending).toEqual([{ ...candidate('a'), seq: 0 }])
  })
})

describe('stopping', () => {
  it('takes no further head and retries no more, and lets the admission on its way end', async () => {
    const { drain, admitted, script, store } = rig()
    const first = held()
    script('a', first.answer)
    script('c', RETRY)
    const a = drain.enqueue(candidate('a'))
    void drain.enqueue(candidate('b'))
    void drain.enqueue(candidate('c', 'session-2'))
    await turn()
    expect(admitted).toEqual(['session-1/a', 'session-2/c'])
    expect(vi.getTimerCount()).toBe(1)
    drain.stop()
    expect(vi.getTimerCount()).toBe(0)
    first.release(SUCCEEDED)
    expect(await a).toEqual(SUCCEEDED)
    await vi.advanceTimersByTimeAsync(1000)
    expect(admitted).toEqual(['session-1/a', 'session-2/c'])
    expect(store.open().pending.map(request => request.acceptId)).toEqual(['b', 'c'])
  })
})
