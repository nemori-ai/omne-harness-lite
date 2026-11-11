import { expect, it } from 'vitest'
import { accepted, fixture } from './fixture.ts'

// The ledger refuses for good a final it cannot plan (here the first screen of the offloaded text
// does not fit one result page). The call still ends: its final says why the result was not kept.
it(
  'ends a call with a failed final when the ledger refuses the result of the author for good',
  { timeout: 15_000 },
  async () => {
    const world = await fixture(
      async () => 'refused-output '.repeat(6000),
      undefined,
      32,
      false,
      undefined,
      undefined,
      undefined,
      base => ({ ...base, resultPageBytes: 512 }),
    )
    try {
      const reference = accepted(await world.api.invoke(world.invocation('refused-final')))
      const delivered = await world.settled(reference)
      expect(delivered.terminal).toMatchObject({
        kind: 'failed',
        cause: 'result',
        diagnostic: 'The ledger refused the result: content: first-screen-exceeds-result-page',
      })
      expect(world.launches()).toBe(1)
    } finally {
      await world.close()
    }
  },
)
