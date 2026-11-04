// The `core.*` rows of the former K-23 bridge do not decode (session-adapters SPEC "事实族存储",
// K-23 end state, R2-D347): a copy is projected from the fact family alone. Negative control: a
// session whose records hold one row of a bridge kind is unavailable to a cold provider and to
// the reader outside the provider, with the diagnostic that names the records; the same session
// without that row loads. Nothing is read past the row, nothing is repaired in place.
import { describe, expect, it } from 'vitest'
import { readExecutionRecords } from '../src/cordis/agent-journal.ts'
import { ok } from './fixtures/common-journal.ts'
import { sqlScene } from './fixtures/sql-scene.ts'

describe('the rows of the former core bridge', () => {
  it('a fact row of a core kind makes the session unavailable to a cold copy and to the records reader', async () => {
    const s = await sqlScene('core-rows')
    const target = { ...s.access, execution: s.execution }
    ok(await s.view.journal.open(s.openInput))
    ok(await s.fresh().journal.load(target))
    const before = s.controls?.select(
      "SELECT COUNT(*) AS n FROM er_fact WHERE kind LIKE 'core.%'",
    ).rows[0]?.[0]
    expect(Number(before)).toBe(0)

    // One fact of the open batch becomes a bridge row, as an older writer would have left it.
    const changed = s.controls?.select(
      "UPDATE er_fact SET kind = 'core.execution' WHERE pub = 1 AND ord = 1",
    ).changes
    expect(changed).toBe(1n)

    const cold = await s.fresh().journal.load(target)
    expect(cold).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('does not decode') },
    })
    const read = await readExecutionRecords(
      {
        storage: s.storage,
        tenantDomainLookup: {
          lookup: () => Promise.resolve({ kind: 'ready' as const, domain: s.domain }),
        },
      },
      { tenant: s.access.tenant, session: s.access.session, execution: String(s.execution) },
    )
    expect(read).toMatchObject({
      kind: 'unavailable',
      diagnostic: expect.stringContaining('does not decode'),
    })
  })
})
