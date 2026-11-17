import { describe, expect, it } from 'vitest'
import { ok } from './fixtures/common-journal.ts'
import { sqlScene } from './fixtures/sql-scene.ts'

describe('the rows of the former core bridge', () => {
  it('a fact row of a core kind makes the session unavailable to a cold copy', async () => {
    const s = await sqlScene('core-rows')
    const target = { ...s.access, execution: s.execution }
    ok(await s.view.journal.open(s.openInput))
    ok(await s.fresh().journal.load(target))
    const before = s.controls?.select("SELECT COUNT(*) AS n FROM er_fact WHERE kind LIKE 'core.%'")
      .rows[0]?.[0]
    expect(Number(before)).toBe(0)

    const changed = s.controls?.select(
      "UPDATE er_fact SET kind = 'core.execution' WHERE pub = 1 AND ord = 1",
    ).changes
    expect(changed).toBe(1n)

    const cold = await s.fresh().journal.load(target)
    expect(cold).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('does not decode') },
    })
  })
})
