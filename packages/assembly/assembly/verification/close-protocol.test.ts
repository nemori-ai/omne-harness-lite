import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCloseProtocol, type Clock, type Step } from './close-protocol.ts'

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

test('close does not wait for the caller that started it', async () => {
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  const caller = protocol.admit('caller')
  const other = protocol.admit('other')
  const pending = protocol.close({ caller })
  assert.equal(await settled(pending), false)
  protocol.release(other)
  const report = await Promise.race([
    pending,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error('close waited for the caller')), 50)
    }),
  ])
  assert.equal(report.status, 'closed')
  assert.deepEqual(protocol.held(), ['caller'])
})

test('a second close joins the close already running', async () => {
  let runs = 0
  const protocol = createCloseProtocol({
    steps: [{ name: 'once', when: 'always', run: () => { runs += 1 } }],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  const first = protocol.close()
  const second = protocol.close()
  assert.equal(first, second)
  const report = await first
  assert.equal(second, first)
  assert.equal(report.status, 'closed')
  assert.equal(runs, 1)
  assert.equal(protocol.close(), first)
})

test('steps run in protocol order', async () => {
  const order: string[] = []
  const steps: Step[] = ['stop', 'drain', 'backend'].map(name => ({
    name,
    when: 'always' as const,
    run: () => { order.push(name) },
  }))
  const protocol = createCloseProtocol({
    steps,
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  const report = await protocol.close()
  assert.equal(report.status, 'closed')
  assert.deepEqual(report.steps, ['stop', 'drain', 'backend'])
  assert.deepEqual(order, ['stop', 'drain', 'backend'])
})

test('a failed step is kept and a required later step still runs', async () => {
  const order: string[] = []
  const protocol = createCloseProtocol({
    steps: [
      { name: 'drain', when: 'always', run: () => { throw new Error('drain broke') } },
      { name: 'backend', when: 'always', run: () => { order.push('backend') } },
      { name: 'drop-cache', when: 'if-no-failure', run: () => { order.push('drop-cache') } },
    ],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  const report = await protocol.close()
  if (report.status !== 'failed') assert.fail(`close status ${report.status}`)
  assert.deepEqual(report.steps, ['backend'])
  assert.deepEqual(report.failures, [{ step: 'drain', message: 'drain broke' }])
  assert.deepEqual(report.skipped, ['drop-cache'])
  assert.deepEqual(order, ['backend'])
})

test('a drain timeout is not a successful close', async () => {
  const clock = manualClock()
  let ran = false
  const protocol = createCloseProtocol({
    steps: [{ name: 'backend', when: 'always', run: () => { ran = true } }],
    drainTimeoutMs: 10,
    clock,
  })
  protocol.admit('other')
  const pending = protocol.close()
  clock.advance(10)
  const report = await pending
  if (report.status !== 'timed-out') assert.fail(`close status ${report.status}`)
  assert.deepEqual(report.stillHeld, ['other'])
  assert.equal(ran, false)
})

test('releasing after a timeout does not change the report', async () => {
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
  assert.equal(report.status, 'timed-out')
  assert.deepEqual(protocol.held(), [])
})

test('detaching an observer does not release a lease or finish close', async () => {
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  protocol.admit('work')
  const pending = protocol.close()
  protocol.detachObserver()
  assert.deepEqual(protocol.held(), ['work'])
  assert.equal(await settled(pending), false)
})

test('an empty lease name is rejected', () => {
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  assert.throws(() => protocol.admit(''), /lease name is empty/)
  assert.deepEqual(protocol.held(), [])
})

test('releasing an unheld lease does nothing', () => {
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  const held = protocol.admit('work')
  protocol.release(held)
  protocol.release(held)
  assert.deepEqual(protocol.held(), [])
})

test('a caller that is not held is not excluded from anyone else', async () => {
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  const gone = protocol.admit('gone')
  protocol.release(gone)
  const other = protocol.admit('other')
  const pending = protocol.close({ caller: gone })
  assert.equal(await settled(pending), false)
  protocol.release(other)
  const report = await pending
  assert.equal(report.status, 'closed')
})

test('a negative drain timeout is rejected at construction', () => {
  assert.throws(
    () => createCloseProtocol({ steps: [quiet], drainTimeoutMs: -1, clock: immediateClock() }),
    /drain timeout is negative/,
  )
})

test('an empty waited set runs the steps when the timeout is zero', async () => {
  const clock = manualClock()
  const order: string[] = []
  const protocol = createCloseProtocol({
    steps: [{ name: 'backend', when: 'always', run: () => { order.push('backend') } }],
    drainTimeoutMs: 0,
    clock,
  })
  const report = await protocol.close()
  assert.equal(report.status, 'closed')
  assert.deepEqual(order, ['backend'])
})

test('a new generation is a second instance and the old close ignores it', async () => {
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
  assert.equal(fresh.name, 'fresh')
  assert.equal(await settled(pending), false)
  assert.deepEqual(next.held(), ['fresh'])
  previous.release(old)
  const report = await pending
  assert.equal(report.status, 'closed')
  assert.deepEqual(next.held(), ['fresh'])
  next.admit('another')
  assert.deepEqual(next.held(), ['fresh', 'another'])
})

test('exit stops admission before handoff and closes the backend after it', async () => {
  const order: string[] = []
  const protocol = createCloseProtocol({
    steps: [
      {
        name: 'handoff',
        when: 'always',
        run: () => {
          order.push('handoff')
          assert.throws(() => protocol.admit('late'), /admission stopped/)
        },
      },
      { name: 'backend', when: 'always', run: () => { order.push('backend') } },
    ],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  const report = await protocol.close()
  assert.equal(report.status, 'closed')
  if (report.status !== 'closed') assert.fail(`close status ${report.status}`)
  assert.deepEqual(order, ['handoff', 'backend'])
  assert.deepEqual(report.steps, ['handoff', 'backend'])
})

test('admit of a released name returns a new id and the old id does not release it', () => {
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  const first = protocol.admit('work')
  protocol.release(first)
  const second = protocol.admit('work')
  assert.notEqual(first, second)
  protocol.release(first)
  assert.deepEqual(protocol.held(), ['work'])
  protocol.release(second)
  assert.deepEqual(protocol.held(), [])
})

test('an empty name during a stopped admission throws admission stopped', async () => {
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  protocol.admit('work')
  const pending = protocol.close()
  assert.throws(() => protocol.admit(''), /admission stopped/)
  assert.equal(await settled(pending), false)
})

test('a zero timeout with a waited lease is timed-out', async () => {
  const protocol = createCloseProtocol({
    steps: [{ name: 'backend', when: 'always', run: () => { throw new Error('ran') } }],
    drainTimeoutMs: 0,
    clock: manualClock(),
  })
  protocol.admit('first')
  protocol.admit('second')
  const report = await protocol.close()
  if (report.status !== 'timed-out') assert.fail(`close status ${report.status}`)
  assert.deepEqual(report.stillHeld, ['first', 'second'])
})

test('a rejected clock rejects close and leaves admission stopped', async () => {
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 5,
    clock: { delay: () => Promise.reject(new Error('clock broke')) },
  })
  protocol.admit('work')
  await assert.rejects(protocol.close(), /clock broke/)
  assert.throws(() => protocol.admit('late'), /admission stopped/)
})

test('release after a closed report removes the excluded caller', async () => {
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  const caller = protocol.admit('caller')
  const report = await protocol.close({ caller })
  assert.equal(report.status, 'closed')
  protocol.release(caller)
  assert.deepEqual(protocol.held(), [])
})

test('admission stops before drain finishes', async () => {
  const protocol = createCloseProtocol({
    steps: [quiet],
    drainTimeoutMs: 60_000,
    clock: immediateClock(),
  })
  protocol.admit('other')
  const pending = protocol.close()
  assert.throws(() => protocol.admit('late'), /admission stopped/)
  assert.equal(await settled(pending), false)
})
