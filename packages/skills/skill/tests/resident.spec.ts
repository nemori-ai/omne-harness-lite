import { describe, expect, it } from 'vitest'
import { capabilityId } from '@omne-harness/assets'
import { residentSkillLine, residentSkillsText } from '@omne-harness/skill'
import type { CatalogEntry } from '@omne-harness/skill-contract'

function entryOf(name: string, description?: string, standIn = false): CatalogEntry {
  const id = capabilityId('skill', name)
  if (!id.ok) throw new Error(name)
  const named = { capability: id.id, name: name as never }
  const told = description === undefined ? {} : { description }
  return standIn
    ? { kind: 'stand-in', ...named, ...told, reason: 'disabled' as never }
    : { kind: 'adopted', ...named, ...told, dependencies: [] }
}

describe('the resident Skill segment', () => {
  it('opens with how to use the lines, then gives one line per Skill in the order given', () => {
    expect(
      residentSkillsText([
        entryOf('tidy-notes', 'Tidies notes into decisions and actions.'),
        entryOf('weekly-report', 'Writes the weekly report; keeps {{names}} as written.'),
      ]),
    ).toBe(
      [
        '## Skills kept at hand',
        'Each line is a skill: its name, then what it is for. Read one with Skills read before you use it.',
        '- tidy-notes: Tidies notes into decisions and actions.',
        '- weekly-report: Writes the weekly report; keeps {{names}} as written.',
      ].join('\n'),
    )
  })

  it('writes the name alone for a Skill without a description, and a stand-in as the Skill it stands for', () => {
    expect(residentSkillLine(entryOf('bare'))).toBe('- bare')
    expect(residentSkillLine(entryOf('off', 'Was enabled once.', true))).toBe(
      '- off: Was enabled once.',
    )
  })

  it('a segment that gains a Skill starts with the segment it had', () => {
    const before = residentSkillsText([entryOf('a', 'first')])
    const after = residentSkillsText([entryOf('a', 'first'), entryOf('b', 'second')])
    expect(after.startsWith(`${before}\n`)).toBe(true)
  })
})
