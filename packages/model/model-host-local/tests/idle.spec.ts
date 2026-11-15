import { expect, it } from 'vitest'
import { whenEmpty } from '../src/plugins/idle.ts'

function task() {
  let end = () => {}
  const promise = new Promise<void>(resolve => (end = resolve))
  return { promise, end }
}

it('answers 0 at once for an empty set', async () => {
  expect(await whenEmpty(new Map(), new AbortController().signal)).toBe(0)
})

it('waits for a task that an ending task started', async () => {
  const tasks = new Map<string, Promise<void>>()
  const first = task()
  const second = task()
  tasks.set(
    'first',
    first.promise.then(() => void tasks.delete('first')),
  )
  let answer: number | undefined
  const waiting = whenEmpty(tasks, new AbortController().signal).then(left => (answer = left))

  tasks.set(
    'second',
    second.promise.then(() => void tasks.delete('second')),
  )
  first.end()
  await new Promise(resolve => setTimeout(resolve, 10))
  expect(answer).toBeUndefined()

  second.end()
  await waiting
  expect(answer).toBe(0)
})

it('answers the number of tasks that still run when the signal aborts', async () => {
  const tasks = new Map<string, Promise<void>>([['slow', task().promise]])
  const expired = new AbortController()
  const waiting = whenEmpty(tasks, expired.signal)
  expired.abort()
  expect(await waiting).toBe(1)
})

it('answers the size at once for a signal that is aborted already', async () => {
  const tasks = new Map<string, Promise<void>>([['slow', task().promise]])
  expect(await whenEmpty(tasks, AbortSignal.abort())).toBe(1)
})
