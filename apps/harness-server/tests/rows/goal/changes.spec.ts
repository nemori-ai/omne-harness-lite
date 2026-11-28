import { describe, expect, it } from 'vitest'
import { createGoalChangePublisher } from '../../../src/rows/goal/changes.ts'

const watcher = () => {
  const seen: string[] = []
  return { seen, changed: () => void seen.push('changed'), closed: () => void seen.push('closed') }
}

describe('who is told that the goal of a session was written', () => {
  it('everybody watching that session of that tenant, and nobody watching another', () => {
    const publisher = createGoalChangePublisher()
    const [one, two, other, elsewhere] = [watcher(), watcher(), watcher(), watcher()]
    publisher.subscribe('t1', 's1', one)
    publisher.subscribe('t1', 's1', two)
    publisher.subscribe('t1', 's2', other)
    publisher.subscribe('t2', 's1', elsewhere)
    publisher.changed('t1', 's1')
    expect([one.seen, two.seen, other.seen, elsewhere.seen]).toEqual([
      ['changed'],
      ['changed'],
      [],
      [],
    ])
  })

  it('nobody who stopped watching, and a watcher that fails does not keep the others from hearing', () => {
    const publisher = createGoalChangePublisher()
    const [gone, stays] = [watcher(), watcher()]
    const failing = {
      changed() {
        throw new Error('a watcher failed')
      },
      closed() {
        throw new Error('a watcher failed')
      },
    }
    const stop = publisher.subscribe('t1', 's1', gone)
    publisher.subscribe('t1', 's1', failing)
    publisher.subscribe('t1', 's1', stays)
    stop()
    stop()
    expect(() => publisher.changed('t1', 's1')).not.toThrow()
    expect([gone.seen, stays.seen]).toEqual([[], ['changed']])
    expect(() => publisher.close()).not.toThrow()
    expect(stays.seen).toEqual(['changed', 'closed'])
  })

  it('tells every watcher once that it closed, and nothing after', () => {
    const publisher = createGoalChangePublisher()
    const [one, other] = [watcher(), watcher()]
    publisher.subscribe('t1', 's1', one)
    publisher.subscribe('t2', 's9', other)
    publisher.close()
    publisher.close()
    publisher.changed('t1', 's1')
    expect([one.seen, other.seen]).toEqual([['closed'], ['closed']])
  })
})
