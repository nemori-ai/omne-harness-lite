import { expect, it } from 'vitest'
import { createChangeSignal } from '../src/index.ts'

it('gives each change to every listener in the order they subscribed, and to none that left', () => {
  const signal = createChangeSignal<string>()
  const seen: string[] = []
  const leaveFirst = signal.subscribe(change =>
    seen.push(`first:${change.domain}:${change.revision}`),
  )
  signal.subscribe(change => seen.push(`second:${change.domain}:${change.revision}`))
  signal.emit({ domain: 'a', revision: 1 })
  leaveFirst()
  leaveFirst()
  signal.emit({ domain: 'a', revision: 2 })
  expect(seen).toEqual(['first:a:1', 'second:a:1', 'second:a:2'])
})

it('keeps two subscriptions of one function apart, and a listener that throws from stopping the rest', () => {
  const signal = createChangeSignal<string>()
  let count = 0
  const listener = () => {
    count += 1
  }
  const leave = signal.subscribe(listener)
  signal.subscribe(listener)
  signal.subscribe(() => {
    throw new Error('a consumer failed')
  })
  signal.subscribe(listener)
  leave()
  expect(() => signal.emit({ domain: 'a', revision: 2 })).not.toThrow()
  expect(count).toBe(2)
})

it('a listener that leaves during a change still gets that change, and one that joins during it does not', () => {
  const signal = createChangeSignal<string>()
  const seen: string[] = []
  const leave = signal.subscribe(() => {
    leave()
    signal.subscribe(() => seen.push('late'))
    seen.push('first')
  })
  signal.subscribe(() => seen.push('second'))
  signal.emit({ domain: 'a', revision: 1 })
  expect(seen).toEqual(['first', 'second'])
})
