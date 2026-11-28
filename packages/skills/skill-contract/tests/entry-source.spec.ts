import { describe, expect, it } from 'vitest'
import { isSkillSourcePrefix } from '@omne-harness/skill-contract'
import {
  createMemorySkillEntrySource,
  runConformanceCase,
  skillEntrySourceConformance,
} from '@omne-harness/skill-contract/testing'
import { alice, mallory, type Principal } from './conformance-world.ts'

describe('the memory source conforms to the Skill entry source port (C401, C405)', () => {
  const source = createMemorySkillEntrySource<Principal>({
    prefix: 'mem__',
    label: 'memory',
    skills: { mem__review: { description: 'Reviews.', body: '---\nname: review\n---\n' } },
    may: access => access.principal === 'alice',
  })
  for (const conformance of skillEntrySourceConformance<Principal>())
    it(`${conformance.clause} ${conformance.name}`, async () => {
      const verdict = await runConformanceCase(conformance, {
        source,
        access: alice,
        stranger: mallory,
        known: 'mem__review',
      })
      expect(verdict).toEqual({ kind: 'passed' })
    })
})

it('a prefix is lower-case letters and digits ending in two underscores', () => {
  expect(['mcp__', 'a1__'].map(isSkillSourcePrefix)).toEqual([true, true])
  expect(['mcp_', 'Mcp__', '__', 'mcp__x', '1a__'].map(isSkillSourcePrefix)).toEqual([
    false,
    false,
    false,
    false,
    false,
  ])
})
