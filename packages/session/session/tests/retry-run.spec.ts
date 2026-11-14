import { afterEach, describe, expect, it, vi } from 'vitest'
import { operationId, succeeded } from '@omne-harness/session-contract/testing'
import { turn } from './fixtures/control-fixture.ts'
import { failedAfterTaking, read } from './fixtures/failed-run.ts'
import type { Harness } from './fixtures/harness.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

describe('S1 after a retry of the failed Run', () => {
  it('starts the next Run with the returned input and writes no new input', async () => {
    const { h, starts, handed, pair } = await failedAfterTaking(open)
    for (let step = 0; step < 5; step++) await turn()
    const failed = await read(h)
    if (failed.run.kind !== 'terminal') throw new Error('no terminal')
    const log = () => pair().transactions.controls.entriesOf(failed.tenant, failed.session)
    const before = log().length
    handed.length = 0
    const receipt = succeeded(
      await h.faces('intake').work.retryRun({
        ...h.access(),
        operation: operationId('retry'),
        run: failed.run.terminal.run,
      }),
      'retryRun',
    )
    expect(receipt.recovered).toBe(false)
    await vi.waitFor(async () => expect((await read(h)).handed).toEqual(['input-1']))
    const after = await read(h)
    expect(after.run).toMatchObject({ kind: 'active', first: 'input-1' })
    expect(after.awaitingPerson).toBeUndefined()
    expect(starts).toHaveLength(2)
    expect(handed).toEqual(['input-1'])
    const written = log()
      .slice(before)
      .map(entry => entry.kind)
    expect(written.slice(0, 2)).toEqual(['control.requested', 'control.progress'])
    expect(written).toContain('run.started')
    expect(written).not.toContain('intake.routed')
    expect(written).not.toContain('message.user')
  })
})
