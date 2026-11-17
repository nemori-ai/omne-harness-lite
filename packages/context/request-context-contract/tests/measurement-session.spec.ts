import { describe, expect, it } from 'vitest'
import {
  createAssemblyFixture,
  fixtureBudget,
  countingBasis,
} from '@omne-harness/request-context-contract/testing'

describe('request measurement leases', () => {
  it('waits for the complete asynchronous measurement before releasing the lease', async () => {
    const started = Promise.withResolvers<void>()
    const result = Promise.withResolvers<ReturnType<typeof fixtureBudget>>()
    let released = 0
    const f = createAssemblyFixture({
      preparation: {
        meter: {
          basis: countingBasis,
          async measure() {
            started.resolve()
            return { ok: await result.promise }
          },
        },
        release: () => {
          released++
          return {}
        },
      },
    })
    const pending = f.operations().assemble(f.call)
    const observed = pending.catch(error => error)
    await started.promise
    await Promise.resolve()
    expect(released).toBe(0)
    result.resolve(fixtureBudget())
    expect((await observed).kind).toBe('candidate-before-extension')
    expect(released).toBe(2)
  })
})
