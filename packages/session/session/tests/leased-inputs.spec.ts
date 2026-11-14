// S1 after a failed Run: the inputs the Run took and did not answer are pending again, and no new
// Run starts until a person sends an input. The next Run then hands the returned input in first.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { turn } from './fixtures/control-fixture.ts'
import { failedAfterTaking, read } from './fixtures/failed-run.ts'
import type { Harness } from './fixtures/harness.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

describe('S1 after a failed Run', () => {
  it('9. starts no new Run while the session waits for a person', async () => {
    const { h, starts } = await failedAfterTaking(open)
    for (let step = 0; step < 5; step++) await turn()
    const after = await read(h)
    expect(after.run).toMatchObject({ kind: 'terminal', terminal: { outcome: 'failed' } })
    expect(after.pending).toEqual(['input-1'])
    expect(after.awaitingPerson).toBe(true)
    expect(starts).toHaveLength(1)
  })

  it('10. a new input starts the next Run with the returned input first, then the new one', async () => {
    const { h, starts, handed } = await failedAfterTaking(open)
    for (let step = 0; step < 5; step++) await turn()
    handed.length = 0
    await h.accept('input-2')
    await vi.waitFor(async () => expect((await read(h)).handed).toEqual(['input-1', 'input-2']))
    const after = await read(h)
    expect(after.run).toMatchObject({ kind: 'active', first: 'input-1' })
    expect(starts).toHaveLength(2)
    expect(handed).toEqual(['input-1', 'input-2'])
  })
})
