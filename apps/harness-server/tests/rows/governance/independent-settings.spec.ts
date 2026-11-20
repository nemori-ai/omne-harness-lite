import { describe, expect, it } from 'vitest'
import { calendarEnvironmentSettings } from '@omne-harness/calendar-local'
import { sessionIntakeSettings } from '@omne-harness/session-adapters/cordis'
import type { SettingDefinitions } from '@omne-harness/settings'
import { independentTargetsOf } from '../../../src/rows/governance/independent-settings.ts'

const TENANT = 'tenant-a'
const CALENDAR = JSON.stringify(['calendar', 'environment'])
const INTAKE = JSON.stringify(['session', 'intake'])

function layout(ownerRef = 'harness.independent-settings') {
  return [{ sourceId: 'tenant', ownerRef, scope: { kind: 'tenant', subjectRef: TENANT } }]
}

type Stored = Readonly<{ definition: SettingDefinitions; ownerRef?: string; retired?: boolean }>

/** A standalone owner over a map of stored targets keyed by definition id. */
function owner(stored: Map<string, Stored | 'throws' | 'rejected'>, conflicts = 0) {
  const reads: string[] = []
  const writes: string[] = []
  let left = conflicts
  return {
    reads,
    writes,
    owner: {
      async readTarget(target: { definitionId: string }) {
        reads.push(target.definitionId)
        const found = stored.get(target.definitionId)
        if (found === undefined) return { kind: 'not_found' }
        if (found === 'throws') throw new Error('the store is gone')
        if (found === 'rejected') return { kind: 'rejected', reason: 'unavailable' }
        return {
          kind: 'found',
          retired: found.retired ?? false,
          projection: { definition: found.definition, sources: layout(found.ownerRef) },
        }
      },
      async mutate(command: {
        record: { target: { definitionId: string }; definition: SettingDefinitions }
      }) {
        writes.push(command.record.target.definitionId)
        if (left > 0) {
          left--
          stored.set(command.record.target.definitionId, { definition: command.record.definition })
          return { kind: 'rejected', reason: 'revision_conflict' }
        }
        stored.set(command.record.target.definitionId, { definition: command.record.definition })
        return { kind: 'committed' }
      },
    } as never,
  }
}

const changed = (
  definition: SettingDefinitions,
  version = definition.version,
): SettingDefinitions => ({
  ...definition,
  version,
  groups: definition.groups.map(group => ({ ...group, description: `${group.description}（改）` })),
})

describe('opening one group of independent settings for a tenant (table six)', () => {
  it('a missing target is opened once and is ready', async () => {
    const w = owner(new Map())
    const states = await independentTargetsOf(w.owner, TENANT).ensure([calendarEnvironmentSettings])
    expect(states.get(CALENDAR)).toBe('ready')
    expect(w.writes).toEqual(['environment'])
  })

  it('a target with the same declaration and layout is ready and not written', async () => {
    const w = owner(new Map([['environment', { definition: calendarEnvironmentSettings }]]))
    const states = await independentTargetsOf(w.owner, TENANT).ensure([calendarEnvironmentSettings])
    expect(states.get(CALENDAR)).toBe('ready')
    expect(w.writes).toEqual([])
  })

  it.each([
    ['another version', { definition: changed(calendarEnvironmentSettings, '2') }],
    ['the same version with other content', { definition: changed(calendarEnvironmentSettings) }],
    [
      'another source layout',
      { definition: calendarEnvironmentSettings, ownerRef: 'someone-else' },
    ],
    ['a retired target', { definition: calendarEnvironmentSettings, retired: true }],
  ] as const)('%s leaves only this group unavailable and writes nothing', async (_case, stored) => {
    const w = owner(new Map<string, Stored>([['environment', stored]]))
    const states = await independentTargetsOf(w.owner, TENANT).ensure([
      calendarEnvironmentSettings,
      sessionIntakeSettings,
    ])
    expect(states.get(CALENDAR)).toBe('unavailable')
    expect(states.get(INTAKE)).toBe('ready')
    expect(w.writes).toEqual(['intake'])
  })

  it.each(['throws', 'rejected'] as const)(
    'a store that %s leaves the group unavailable and is tried again next time',
    async failure => {
      const stored = new Map<string, Stored | 'throws' | 'rejected'>([['environment', failure]])
      const w = owner(stored)
      const targets = independentTargetsOf(w.owner, TENANT)
      expect((await targets.ensure([calendarEnvironmentSettings])).get(CALENDAR)).toBe(
        'unavailable',
      )
      stored.delete('environment')
      expect((await targets.ensure([calendarEnvironmentSettings])).get(CALENDAR)).toBe('ready')
      expect(w.reads.filter(read => read === 'environment').length).toBeGreaterThan(1)
    },
  )

  it('someone else opening it first is read again and judged by the rows above', async () => {
    const w = owner(new Map(), 1)
    const states = await independentTargetsOf(w.owner, TENANT).ensure([calendarEnvironmentSettings])
    expect(states.get(CALENDAR)).toBe('ready')
  })

  it('reads that need the same group at once open it once: the later ones wait for that opening', async () => {
    const stored = new Map<string, Stored>()
    const writes: string[] = []
    let writing = false
    const slow = {
      async readTarget(target: { definitionId: string }) {
        const found = stored.get(target.definitionId)
        return found === undefined
          ? { kind: 'not_found' }
          : {
              kind: 'found',
              retired: false,
              projection: { definition: found.definition, sources: layout() },
            }
      },
      async mutate(command: {
        record: { target: { definitionId: string }; definition: SettingDefinitions }
      }) {
        writes.push(command.record.target.definitionId)
        if (writing) return { kind: 'rejected', reason: 'unavailable' }
        writing = true
        await new Promise(resolve => setTimeout(resolve, 5))
        stored.set(command.record.target.definitionId, { definition: command.record.definition })
        writing = false
        return { kind: 'committed' }
      },
    } as never
    const targets = independentTargetsOf(slow, TENANT)
    const states = await Promise.all([
      targets.ensure([calendarEnvironmentSettings]),
      targets.ensure([calendarEnvironmentSettings]),
      targets.ensure([calendarEnvironmentSettings, sessionIntakeSettings]),
    ])
    expect(states.map(state => state.get(CALENDAR))).toEqual(['ready', 'ready', 'ready'])
    expect(states[2]?.get(INTAKE)).toBe('ready')
    expect(writes).toEqual(['environment', 'intake'])
  })

  it('a ready group is remembered by its declaration and not read again', async () => {
    const w = owner(new Map())
    const targets = independentTargetsOf(w.owner, TENANT)
    await targets.ensure([calendarEnvironmentSettings])
    const before = w.reads.length
    expect((await targets.ensure([calendarEnvironmentSettings])).get(CALENDAR)).toBe('ready')
    expect(w.reads.length).toBe(before)
    await targets.ensure([changed(calendarEnvironmentSettings, '2')])
    expect(w.reads.length).toBeGreaterThan(before)
  })
})
