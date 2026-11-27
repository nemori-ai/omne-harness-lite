import { capabilityId, withPlaced, type AssetEntry, type AssetPage } from '../src/index.ts'
import { describe, expect, it } from 'vitest'

const entry = (name: string, asset = `held/${name}`): AssetEntry => {
  const made = capabilityId('skill', name)
  if (!made.ok) throw new Error(name)
  return {
    capability: made.id,
    layer: 'tenant',
    asset,
    version: 'v',
    selection: 'pinned',
    enabled: true,
  }
}
const page = (names: readonly string[], next: string | null = null): AssetPage => ({
  items: names.map(name => entry(name)),
  next,
  completeness: 'complete',
})
const names = (listed: AssetPage) => listed.items.map(each => each.capability.name)
const ask = (after: string | null, limit = 10) => ({ category: 'skill', after, limit })

describe('the listing of the tenant layer, with what plugins placed for the tenant', () => {
  it('a placed definition joins the page in the order of the ledger', () => {
    const listed = withPlaced(page(['alpha', 'gamma']), [entry('beta', 'plugin/tidy')], ask(null))
    expect(names(listed)).toEqual(['alpha', 'beta', 'gamma'])
    expect(listed.items[1]?.asset).toBe('plugin/tidy')
    expect(listed.next).toBeNull()
  })

  it('pages over the two together: the cut moves the cursor, and nothing is listed twice or lost', () => {
    const ledger = ['alpha', 'gamma', 'zeta']
    const placed = [entry('beta', 'plugin/tidy'), entry('delta', 'plugin/tidy')]
    const seen: string[] = []
    let after: string | null = null
    for (let turn = 0; turn < 6; turn += 1) {
      const rest = ledger.filter(name => after === null || name > after)
      const ledgerPage = page(rest.slice(0, 2), rest.length > 2 ? (rest[1] ?? null) : null)
      const listed = withPlaced(ledgerPage, placed, ask(after, 2))
      seen.push(...names(listed))
      if (listed.next === null) break
      after = listed.next
    }
    expect(seen).toEqual(['alpha', 'beta', 'delta', 'gamma', 'zeta'])
  })

  it('a name the ledger holds is not listed again, and another category is not listed', () => {
    const other = { ...entry('beta'), capability: { category: 'tool', name: 'beta' } } as AssetEntry
    const listed = withPlaced(page(['alpha']), [entry('alpha', 'plugin/tidy'), other], ask(null))
    expect(listed.items).toEqual(page(['alpha']).items)
  })

  it('what comes before the cursor or after the last name of a page that goes on waits for its own page', () => {
    const listed = withPlaced(
      page(['gamma'], 'gamma'),
      [entry('alpha'), entry('omega')],
      ask('beta'),
    )
    expect(names(listed)).toEqual(['gamma'])
    expect(listed.next).toBe('gamma')
  })
})
