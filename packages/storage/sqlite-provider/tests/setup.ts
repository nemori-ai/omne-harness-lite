import { afterEach, beforeEach, vi } from 'vitest'

// The provider's limits (queue, observation, idle close, close deadline) are timers on the main
// thread. A test moves them with `advance`; none of them fires because the machine is slow.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
})

afterEach(() => {
  vi.useRealTimers()
})
