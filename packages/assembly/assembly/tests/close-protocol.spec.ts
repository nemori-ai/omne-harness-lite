import { expect, it } from 'vitest'
import { createCloseProtocol, type Clock, type Step } from '@omne-harness/assembly'

function manualClock(): Clock & { advance(ms: number): void } {
  let now = 0
  const waiters: { due: number; resolve: () => void }[] = []
  return {
    delay(ms) {
      return new Promise(resolve => {
        waiters.push({ due: now + ms, resolve })
      })
    },
    advance(ms) {
      now += ms
      for (const waiter of waiters) {
        if (waiter.due <= now) waiter.resolve()
      }
    },
  }
}

function immediateClock(): Clock {
  return { delay: () => new Promise(() => {}) }
}

async function settled<T>(promise: Promise<T>): Promise<boolean> {
  const marker = { settled: false }
  void promise.then(
    () => {
      marker.settled = true
    },
    () => {
      marker.settled = true
    },
  )
  await Promise.resolve()
  await Promise.resolve()
  return marker.settled
}

const quiet: Step = { name: 'quiet', when: 'always', run: () => {} }

it('returns the same id when the name is already held', () => {
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  const first = protocol.admit('work')
  const second = protocol.admit('work')
  expect(second).toBe(first)
  expect(protocol.held()).toEqual(['work'])
})

it('returns the same promise when a later close passes a different caller', async () => {
  let runs = 0
  const protocol = createCloseProtocol({
    steps: [
      {
        name: 'once',
        when: 'always',
        run: () => {
          runs += 1
        },
      },
    ],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  const caller = protocol.admit('caller')
  const other = protocol.admit('other')
  const first = protocol.close({ caller })
  const second = protocol.close({ caller: other })
  expect(second).toBe(first)
  expect(await settled(first)).toBe(false)
  protocol.release(other)
  await expect(first).resolves.toEqual({ status: 'closed', steps: ['once'] })
  expect(protocol.close({ caller: other })).toBe(first)
  expect(runs).toBe(1)
  expect(protocol.held()).toEqual(['caller'])
})

it('does not call the clock when a zero timeout still has leases to wait for', async () => {
  const delays: number[] = []
  const protocol = createCloseProtocol({
    steps: [
      {
        name: 'backend',
        when: 'always',
        run: () => {
          throw new Error('ran')
        },
      },
    ],
    drainTimeoutMs: 0,
    clock: {
      delay(ms) {
        delays.push(ms)
        return new Promise(() => {})
      },
    },
  })
  protocol.admit('first')
  protocol.admit('second')
  await expect(protocol.close()).resolves.toEqual({
    status: 'timed-out',
    stillHeld: ['first', 'second'],
  })
  expect(delays).toEqual([])
})

it('records a non-Error throw with String(error)', async () => {
  const protocol = createCloseProtocol({
    steps: [
      {
        name: 'backend',
        when: 'always',
        run: () => {
          throw 'backend down'
        },
      },
    ],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  await expect(protocol.close()).resolves.toEqual({
    status: 'failed',
    steps: [],
    failures: [{ step: 'backend', message: 'backend down' }],
    skipped: [],
  })
})

it('does not wait for the caller that started close', async () => {
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  const caller = protocol.admit('caller')
  const other = protocol.admit('other')
  const pending = protocol.close({ caller })
  expect(await settled(pending)).toBe(false)
  protocol.release(other)
  await expect(pending).resolves.toEqual({ status: 'closed', steps: ['quiet'] })
  expect(protocol.held()).toEqual(['caller'])
})

it('does not exclude a later lease when close receives the previous id', async () => {
  let ran = false
  const protocol = createCloseProtocol({
    steps: [
      {
        name: 'quiet',
        when: 'always',
        run: () => {
          ran = true
        },
      },
    ],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  const previous = protocol.admit('work')
  protocol.release(previous)
  const current = protocol.admit('work')
  const pending = protocol.close({ caller: previous })
  await new Promise(resolve => setImmediate(resolve))
  expect(ran).toBe(false)
  expect(protocol.held()).toEqual(['work'])
  protocol.release(current)
  await expect(pending).resolves.toEqual({ status: 'closed', steps: ['quiet'] })
  expect(ran).toBe(true)
})

it('runs steps in list order', async () => {
  const order: string[] = []
  const steps: Step[] = ['stop', 'drain', 'backend'].map(name => ({
    name,
    when: 'always' as const,
    run: () => {
      order.push(name)
    },
  }))
  const protocol = createCloseProtocol({
    steps,
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  await expect(protocol.close()).resolves.toEqual({
    status: 'closed',
    steps: ['stop', 'drain', 'backend'],
  })
  expect(order).toEqual(['stop', 'drain', 'backend'])
})

it('keeps a failed handoff, runs an always backend step, and skips if-no-failure', async () => {
  const order: string[] = []
  const protocol = createCloseProtocol({
    steps: [
      {
        name: 'handoff',
        when: 'always',
        run: () => {
          throw new Error('handoff broke')
        },
      },
      {
        name: 'backend',
        when: 'always',
        run: () => {
          order.push('backend')
        },
      },
      {
        name: 'drop-cache',
        when: 'if-no-failure',
        run: () => {
          order.push('drop-cache')
        },
      },
    ],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  await expect(protocol.close()).resolves.toEqual({
    status: 'failed',
    steps: ['backend'],
    failures: [{ step: 'handoff', message: 'handoff broke' }],
    skipped: ['drop-cache'],
  })
  expect(order).toEqual(['backend'])
})

it('reports a drain timeout without running steps', async () => {
  const clock = manualClock()
  let ran = false
  const protocol = createCloseProtocol({
    steps: [
      {
        name: 'backend',
        when: 'always',
        run: () => {
          ran = true
        },
      },
    ],
    drainTimeoutMs: 10,
    clock,
  })
  const caller = protocol.admit('caller')
  protocol.admit('other')
  protocol.admit('later')
  const pending = protocol.close({ caller })
  clock.advance(10)
  await expect(pending).resolves.toEqual({
    status: 'timed-out',
    stillHeld: ['other', 'later'],
  })
  expect(ran).toBe(false)
})

it('leaves the timeout report unchanged when a lease is released later', async () => {
  const clock = manualClock()
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 5,
    clock,
  })
  const other = protocol.admit('other')
  const pending = protocol.close()
  clock.advance(5)
  const report = await pending
  protocol.release(other)
  expect(report).toEqual({ status: 'timed-out', stillHeld: ['other'] })
  expect(protocol.held()).toEqual([])
})

it('does not release a lease or stop admission when an observer detaches twice', () => {
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  protocol.admit('work')
  protocol.detachObserver()
  protocol.detachObserver()
  expect(protocol.held()).toEqual(['work'])
  protocol.admit('more')
  expect(protocol.held()).toEqual(['work', 'more'])
})

it('does not settle close when an observer detaches', async () => {
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  protocol.admit('work')
  const pending = protocol.close()
  protocol.detachObserver()
  expect(protocol.held()).toEqual(['work'])
  expect(await settled(pending)).toBe(false)
})

it('rejects an empty lease name and holds nothing', () => {
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  expect(() => protocol.admit('')).toThrow('lease name is empty')
  expect(protocol.held()).toEqual([])
})

it('does nothing when release is repeated for an id that is no longer held', () => {
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  const held = protocol.admit('work')
  protocol.release(held)
  protocol.release(held)
  expect(protocol.held()).toEqual([])
})

it('waits for every held lease when the caller is not held', async () => {
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  const gone = protocol.admit('gone')
  protocol.release(gone)
  const other = protocol.admit('other')
  const pending = protocol.close({ caller: gone })
  expect(await settled(pending)).toBe(false)
  protocol.release(other)
  await expect(pending).resolves.toEqual({ status: 'closed', steps: ['quiet'] })
})

it('rejects a negative drain timeout before any lease exists', () => {
  expect(() =>
    createCloseProtocol({ steps: [quiet], drainTimeoutMs: -1, clock: immediateClock() }),
  ).toThrow('drain timeout is negative')
})

it('runs steps when the timeout is zero and nothing is waited', async () => {
  const order: string[] = []
  const protocol = createCloseProtocol({
    steps: [
      {
        name: 'backend',
        when: 'always',
        run: () => {
          order.push('backend')
        },
      },
    ],
    drainTimeoutMs: 0,
    clock: manualClock(),
  })
  await expect(protocol.close()).resolves.toEqual({ status: 'closed', steps: ['backend'] })
  expect(order).toEqual(['backend'])
})

it('keeps a new instance independent of an older close', async () => {
  const previous = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  const next = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  const old = previous.admit('old')
  const pending = previous.close()
  const fresh = next.admit('fresh')
  expect(fresh.name).toBe('fresh')
  expect(await settled(pending)).toBe(false)
  expect(next.held()).toEqual(['fresh'])
  previous.release(old)
  await expect(pending).resolves.toEqual({ status: 'closed', steps: ['quiet'] })
  expect(next.held()).toEqual(['fresh'])
  next.admit('another')
  expect(next.held()).toEqual(['fresh', 'another'])
})

it('stops admission before handoff and runs the backend after it', async () => {
  const order: string[] = []
  const protocol = createCloseProtocol({
    steps: [
      {
        name: 'handoff',
        when: 'always',
        run: () => {
          order.push('handoff')
          expect(() => protocol.admit('late')).toThrow('admission stopped')
        },
      },
      {
        name: 'backend',
        when: 'always',
        run: () => {
          order.push('backend')
        },
      },
    ],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  await expect(protocol.close()).resolves.toEqual({
    status: 'closed',
    steps: ['handoff', 'backend'],
  })
  expect(order).toEqual(['handoff', 'backend'])
})

it('returns a new id after release and ignores the previous id', () => {
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  const first = protocol.admit('work')
  protocol.release(first)
  const second = protocol.admit('work')
  expect(second).not.toBe(first)
  protocol.release(first)
  expect(protocol.held()).toEqual(['work'])
  protocol.release(second)
  expect(protocol.held()).toEqual([])
})

it('rejects an empty name with admission stopped after close has started', async () => {
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  protocol.admit('work')
  const pending = protocol.close()
  expect(() => protocol.admit('')).toThrow('admission stopped')
  expect(protocol.held()).toEqual(['work'])
  expect(await settled(pending)).toBe(false)
})

it('rejects close with the clock error and leaves admission stopped', async () => {
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 5,
    clock: { delay: () => Promise.reject(new Error('clock broke')) },
  })
  protocol.admit('work')
  await expect(protocol.close()).rejects.toThrow('clock broke')
  expect(() => protocol.admit('late')).toThrow('admission stopped')
})

it('removes the excluded caller when it is released after close', async () => {
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  const caller = protocol.admit('caller')
  await expect(protocol.close({ caller })).resolves.toEqual({
    status: 'closed',
    steps: ['quiet'],
  })
  protocol.release(caller)
  expect(protocol.held()).toEqual([])
})

it('stops admission before the returned promise settles', async () => {
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  protocol.admit('other')
  const pending = protocol.close()
  expect(() => protocol.admit('late')).toThrow('admission stopped')
  expect(await settled(pending)).toBe(false)
})

it('still admits when close has not been called', () => {
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  protocol.admit('local')
  expect(protocol.held()).toEqual(['local'])
})
