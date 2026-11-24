import type { CatalogEntry } from '@omne-harness/skill-contract'

const HEADING = [
  '## Skills kept at hand',
  'Each line is a skill: its name, then what it is for. Read one with Skills read before you use it.',
]

/** One line of the segment: the name of the Skill, then its description when it has one. */
export function residentSkillLine(entry: CatalogEntry): string {
  return entry.description === undefined
    ? `- ${entry.name}`
    : `- ${entry.name}: ${entry.description}`
}

/** The segment of the system prompt that names the Skills a session keeps at hand, one line each, in the order given. */
export function residentSkillsText(entries: readonly CatalogEntry[]): string {
  return [...HEADING, ...entries.map(residentSkillLine)].join('\n')
}
