import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { CLOSED_SETS } from './closed-sets.ts'

const spec = readFileSync(new URL('../SPEC.md', import.meta.url), 'utf8')

for (const [type, members] of Object.entries(CLOSED_SETS))
  it(`SPEC.md says when each member of ${type} appears`, () => {
    const missing = members.filter(member => !spec.includes(`\`${member}\``))
    expect(missing).toEqual([])
  })

it('SPEC.md does not name the removed call mode', () => {
  expect(spec).not.toMatch(/CallMode|mode-unsupported|taskSupport/u)
})
