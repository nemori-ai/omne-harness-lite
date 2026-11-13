// The one wait policy after a run of failures: the governance host and the tool release read share it.
import { expect, it } from 'vitest'
import { pauseAfterFailures } from '../src/retry-pause.ts'

it('waits 1 s after the first failure, 5 s after the second, 30 s after every later one', () => {
  expect([1, 2, 3, 4, 100].map(pauseAfterFailures)).toEqual([1000, 5000, 30_000, 30_000, 30_000])
})
