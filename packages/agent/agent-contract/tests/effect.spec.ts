import { describe, expect, it } from 'vitest'
import {
  definitionImpact,
  definitionPlaces,
  type DefinitionFacts,
} from '@omne-harness/agent-contract'

const POINT = 'agent.definitions'
const POINTS = { tool: 'tool.tools', skill: 'skill.skills', mcp: 'mcp.endpoints' }
const facts: DefinitionFacts = {
  name: 'counter',
  official: false,
  refused: null,
  residents: [
    { category: 'tool', name: 'Files', there: true },
    { category: 'tool', name: 'wordcount', there: false },
    { category: 'tool', name: 'later', there: null },
    { category: 'skill', name: 'tidy-notes', there: true },
    { category: 'skill', name: 'off', there: false, why: 'it is disabled' },
    { category: 'mcp', name: 'board', there: false, why: 'its address is not set' },
    { category: 'mcp', name: 'docs', there: true },
  ],
}
const impact = (given: Partial<DefinitionFacts> = {}) =>
  definitionImpact(POINT, POINTS, { ...facts, ...given })
const places = (
  standing: Parameters<typeof definitionPlaces>[2],
  given: Partial<DefinitionFacts> = {},
) => definitionPlaces(POINT, POINTS, standing, { ...facts, ...given })

describe('what is told of a directory before it is published as a definition', () => {
  it('says it can be handed work, and names each resident that is not there, of each category, with why', () => {
    const told = impact()
    expect(told.lines).toEqual([
      {
        mark: '+',
        of: null,
        point: POINT,
        key: 'counter',
        says: '→ held; work can be handed to it with Agents, and a session made with it, from now',
      },
      {
        mark: '!',
        of: 'wordcount',
        point: 'tool.tools',
        key: 'wordcount',
        says: '→ its resident tool wordcount is not there now: a session with it cannot start until it is',
      },
      {
        mark: '!',
        of: 'off',
        point: 'skill.skills',
        key: 'off',
        says: '→ its resident skill off is not there now (it is disabled): a session with it starts without it',
      },
      {
        mark: '!',
        of: 'board',
        point: 'mcp.endpoints',
        key: 'board',
        says: '→ its resident mcp endpoint board is not there now (its address is not set): a session with it starts without it',
      },
    ])
    expect(told.advice).toBeNull()
  })

  it('says the first thing the category refuses, and nothing else', () => {
    expect(impact({ refused: 'AGENT.md: type is master', official: true })).toEqual({
      lines: [
        expect.objectContaining({
          mark: '!',
          says: '→ would be refused: AGENT.md: type is master',
        }),
      ],
      advice: null,
    })
  })

  it('says a definition of the deployment stands under that name', () => {
    const told = impact({ name: 'coding', official: true })
    expect(told.lines.map(line => line.says)).toEqual([
      '→ would be held and not in effect: the definition coding of the deployment stands and cannot be replaced',
    ])
    expect(told.advice).toBe('Publish it under another name.')
  })
})

describe('where a held definition stands', () => {
  it('can be handed work when it is picked and every resident is there, each on the point of its category', () => {
    const there = facts.residents.filter(resident => resident.there === true)
    const told = places({ kind: 'selected' }, { residents: there })
    expect(told.places).toEqual([
      {
        point: POINT,
        key: 'counter',
        standing: 'selected',
        says: 'work can be handed to it now, and a session made with it',
      },
      {
        point: 'tool.tools',
        key: 'Files',
        standing: 'in effect',
        says: 'a tool this definition keeps resident',
      },
      {
        point: 'skill.skills',
        key: 'tidy-notes',
        standing: 'in effect',
        says: 'a skill this definition keeps resident',
      },
      {
        point: 'mcp.endpoints',
        key: 'docs',
        standing: 'in effect',
        says: 'an mcp endpoint this definition keeps resident',
      },
    ])
    expect(told.advice).toBeNull()
  })

  it('cannot start a session while a resident tool is not there; a skill or an endpoint that is not there does not stop it', () => {
    const told = places({ kind: 'selected' })
    expect(told.places.map(place => [place.key, place.standing])).toEqual([
      ['counter', 'not in effect'],
      ['Files', 'in effect'],
      ['wordcount', 'not in effect'],
      ['later', 'not known'],
      ['tidy-notes', 'in effect'],
      ['off', 'not in effect'],
      ['board', 'not in effect'],
      ['docs', 'in effect'],
    ])
    expect(told.places[0]?.says).toBe(
      'a session with it cannot start now: a resident tool is not there',
    )
    expect(told.places[2]?.says).toContain('its resident tool wordcount is not there now')
    expect(told.places[5]?.says).toBe(
      'its resident skill off is not there now (it is disabled): a session with it starts without it',
    )
    const withoutTool = facts.residents.filter(resident => resident.category !== 'tool')
    expect(places({ kind: 'selected' }, { residents: withoutTool }).places[0]).toMatchObject({
      standing: 'selected',
    })
  })

  it('says who stands in its place, or why it is held and not used, and lists no resident then', () => {
    const blocked = { kind: 'filtered', reason: 'blocked', by: 'official' } as const
    expect(places(blocked).places).toEqual([
      { point: POINT, key: 'counter', standing: 'not in effect', says: 'blocked by official' },
    ])
    expect(places({ kind: 'selected' }, { refused: 'it is a master' }).places).toEqual([
      {
        point: POINT,
        key: 'counter',
        standing: 'not in effect',
        says: 'it is held and not used: it is a master',
      },
    ])
  })

  it('is not known when the standing or a layer cannot be read', () => {
    expect(places(undefined).places[0]?.standing).toBe('not known')
    expect(places({ kind: 'unavailable', layer: 'tenant' }).places[0]).toMatchObject({
      standing: 'not known',
      says: 'the tenant layer cannot be read now',
    })
  })
})
