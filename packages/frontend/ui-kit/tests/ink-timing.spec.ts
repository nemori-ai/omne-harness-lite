import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WRITE } from '../src/ink/body.ts'
import { BODY_CASUAL } from '../src/ink/casual.ts'
import { THINK_CASUAL } from '../src/ink/doing-ink.ts'
import { DWELL, LAG, SETTLE } from '../src/ink/doing.ts'
import { FLIGHT, TRAVEL_CASUAL, flightTime } from '../src/ink/travel.ts'

const REFERENCES = join(
  import.meta.dirname,
  '../../../../.meta_harness/agents/skills/visual-standard/canonical/references',
)

type Reference = 'timing.md' | 'states.md' | 'seats-and-journeys.md' | 'ink-bubble.md'

interface Expected {
  readonly name: string
  readonly actual: unknown
  readonly expected: unknown
  readonly skill?: {
    readonly reference: Reference
    readonly line: string
    readonly says: readonly string[]
  }
}

const EXPECTED: readonly Expected[] = [
  {
    name: 'WRITE.circle',
    actual: WRITE.circle,
    expected: 620,
    skill: { reference: 'timing.md', line: '`WRITE.circle`', says: ['620'] },
  },
  {
    name: 'WRITE.rewrite',
    actual: WRITE.rewrite,
    expected: 520,
    skill: { reference: 'timing.md', line: '`WRITE.rewrite`', says: ['520'] },
  },
  {
    name: 'WRITE.mark',
    actual: WRITE.mark,
    expected: 200,
    skill: { reference: 'timing.md', line: '`WRITE.mark`', says: ['200', '1.4 = 280'] },
  },
  {
    name: 'WRITE.dry',
    actual: WRITE.dry,
    expected: 260,
    skill: { reference: 'timing.md', line: '`WRITE.dry`', says: ['260', '156'] },
  },
  {
    name: 'WRITE.working',
    actual: WRITE.working,
    expected: 1300,
    skill: { reference: 'timing.md', line: '`WRITE.working`', says: ['1300'] },
  },
  {
    name: 'WRITE.workingRest',
    actual: WRITE.workingRest,
    expected: 650,
    skill: { reference: 'timing.md', line: '`WRITE.workingRest`', says: ['650'] },
  },
  {
    name: 'WRITE.interrupt',
    actual: WRITE.interrupt,
    expected: 120,
    skill: { reference: 'timing.md', line: '`WRITE.interrupt`', says: ['120'] },
  },
  { name: 'WRITE.fleetingDry', actual: WRITE.fleetingDry, expected: 780 },
  {
    name: 'WRITE.leftDry',
    actual: WRITE.leftDry,
    expected: 2200,
    skill: { reference: 'timing.md', line: '`WRITE.leftDry`', says: ['2200'] },
  },
  { name: 'WRITE.cutDry', actual: WRITE.cutDry, expected: 360 },
  {
    name: 'WRITE.wayLinger',
    actual: WRITE.wayLinger,
    expected: 60,
    skill: { reference: 'seats-and-journeys.md', line: '`wayLinger`', says: ['60 ms'] },
  },
  {
    name: 'WRITE.wayFade',
    actual: WRITE.wayFade,
    expected: 70,
    skill: { reference: 'seats-and-journeys.md', line: '`wayFade`', says: ['70 ms'] },
  },
  {
    name: 'WRITE.journey',
    actual: WRITE.journey,
    expected: 1.9,
    skill: { reference: 'seats-and-journeys.md', line: '`flightTime`', says: ['× 1.9'] },
  },
  {
    name: 'FLIGHT',
    actual: FLIGHT,
    expected: { least: 420, most: 950 },
    skill: { reference: 'seats-and-journeys.md', line: '`flightTime`', says: ['420–950'] },
  },
  {
    name: 'flightTime',
    actual: [flightTime(0), flightTime(400), flightTime(1000), flightTime(2000)],
    expected: [420, 500, 770, 950],
    skill: {
      reference: 'seats-and-journeys.md',
      line: '`flightTime`',
      says: ['320 + 0.45 × 距离', '420–950'],
    },
  },
  {
    name: 'TRAVEL_CASUAL.bow',
    actual: TRAVEL_CASUAL.bow,
    expected: 0.4,
    skill: { reference: 'timing.md', line: '`TRAVEL_CASUAL.bow`', says: ['±40%'] },
  },
  {
    name: 'TRAVEL_CASUAL.reach',
    actual: TRAVEL_CASUAL.reach,
    expected: 0.2,
    skill: { reference: 'timing.md', line: '`TRAVEL_CASUAL.reach`', says: ['±20%'] },
  },
  {
    name: 'TRAVEL_CASUAL.time',
    actual: TRAVEL_CASUAL.time,
    expected: 0.12,
    skill: {
      reference: 'timing.md',
      line: '`TRAVEL_CASUAL.time`',
      says: ['±12%', '420–950 ms × 1.9'],
    },
  },
  {
    name: 'BODY_CASUAL.landing',
    actual: BODY_CASUAL.landing,
    expected: 0.1,
    skill: { reference: 'timing.md', line: '`BODY_CASUAL.landing`', says: ['620 ±10%'] },
  },
  {
    name: 'THINK_CASUAL.lead',
    actual: THINK_CASUAL.lead,
    expected: [240, 620],
    skill: { reference: 'timing.md', line: '`THINK_CASUAL`', says: ['240–620'] },
  },
  {
    name: 'THINK_CASUAL.write',
    actual: THINK_CASUAL.write,
    expected: [0.86, 1.16],
    skill: { reference: 'timing.md', line: '`THINK_CASUAL`', says: ['0.86–1.16'] },
  },
  {
    name: 'THINK_CASUAL.rest',
    actual: THINK_CASUAL.rest,
    expected: [0.45, 2.1],
    skill: { reference: 'timing.md', line: '`THINK_CASUAL`', says: ['650 × (0.45 + 1.65·r²)'] },
  },
  {
    name: 'THINK_CASUAL.still',
    actual: THINK_CASUAL.still,
    expected: 0.5,
    skill: { reference: 'states.md', line: '`doing` 为 `thinking`', says: ['淡到 0.5'] },
  },
  {
    name: 'THINK_CASUAL.rise',
    actual: THINK_CASUAL.rise,
    expected: 520,
    skill: { reference: 'states.md', line: '`doing` 为 `thinking`', says: ['520 ms 回到满墨'] },
  },
  {
    name: 'WRITE.noteFirst',
    actual: WRITE.noteFirst,
    expected: 520,
    skill: { reference: 'ink-bubble.md', line: '`noteFirst`', says: ['第一笔 520 ms'] },
  },
  {
    name: 'WRITE.noteSecondAt',
    actual: WRITE.noteSecondAt,
    expected: 340,
    skill: { reference: 'ink-bubble.md', line: '`noteFirst`', says: ['340 ms 时接上'] },
  },
  {
    name: 'WRITE.noteSecond',
    actual: WRITE.noteSecond,
    expected: 440,
    skill: { reference: 'ink-bubble.md', line: '`noteFirst`', says: ['写 440 ms'] },
  },
  {
    name: 'WRITE.numeralPerUnit',
    actual: WRITE.numeralPerUnit,
    expected: 9,
    skill: { reference: 'states.md', line: '`waiting` 大于 0', says: ['每格 9 ms'] },
  },
  {
    name: 'WRITE.numeralMin',
    actual: WRITE.numeralMin,
    expected: 150,
    skill: { reference: 'states.md', line: '`waiting` 大于 0', says: ['限 150–320'] },
  },
  {
    name: 'WRITE.numeralMax',
    actual: WRITE.numeralMax,
    expected: 320,
    skill: { reference: 'states.md', line: '`waiting` 大于 0', says: ['限 150–320'] },
  },
  {
    name: 'DWELL',
    actual: DWELL,
    expected: 900,
    skill: { reference: 'states.md', line: '| `DWELL` |', says: ['900 ms'] },
  },
  {
    name: 'SETTLE',
    actual: SETTLE,
    expected: 150,
    skill: { reference: 'states.md', line: '| `SETTLE` |', says: ['150 ms'] },
  },
  {
    name: 'LAG',
    actual: LAG,
    expected: 1600,
    skill: { reference: 'states.md', line: '| `LAG` |', says: ['1600 ms'] },
  },
]

const read = (reference: Reference): readonly string[] =>
  readFileSync(join(REFERENCES, reference), 'utf8').split('\n')

describe('ink timing against the visual standard', () => {
  it.each(EXPECTED)('$name holds its designed value', ({ actual, expected }) => {
    expect(actual).toEqual(expected)
  })

  it.each(EXPECTED.filter(row => row.skill !== undefined))(
    '$name is the number the skill writes',
    ({ skill }) => {
      if (skill === undefined) throw new Error('unreachable: filtered')
      const lines = read(skill.reference).filter(line => line.includes(skill.line))
      expect(lines, `${skill.reference} names ${skill.line} on one line`).toHaveLength(1)
      for (const said of skill.says) expect(lines[0]).toContain(said)
    },
  )
})
