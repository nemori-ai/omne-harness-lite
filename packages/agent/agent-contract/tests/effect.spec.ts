import { describe, expect, it } from 'vitest'
import {
  definitionImpact,
  definitionPlaces,
  type DefinitionFacts,
} from '@omne-harness/agent-contract'

const POINT = 'agent.definitions'
const TOOLS = 'tool.tools'
const facts: DefinitionFacts = {
  name: 'counter',
  official: false,
  refused: null,
  residents: [
    { name: 'Files', there: true },
    { name: 'wordcount', there: false },
    { name: 'later', there: null },
  ],
  inert: ['skill/tidy-notes', 'mcp/board'],
}
const impact = (given: Partial<DefinitionFacts> = {}) =>
  definitionImpact(POINT, TOOLS, { ...facts, ...given })
const places = (
  standing: Parameters<typeof definitionPlaces>[2],
  given: Partial<DefinitionFacts> = {},
) => definitionPlaces(POINT, TOOLS, standing, { ...facts, ...given })

describe('what is told of a directory before it is published as a definition', () => {
  it('says it can be handed work, names each resident tool that is not there, and what does nothing yet', () => {
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
        point: TOOLS,
        key: 'wordcount',
        says: '→ its resident tool wordcount is not there now: a session with it cannot start until it is',
      },
    ])
    expect(told.advice).toBe(
      'Kept and without effect yet: skill/tidy-notes, mcp/board. Only a tool reference is used.',
    )
    expect(impact({ inert: [], residents: [] })).toMatchObject({ advice: null })
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
  it('can be handed work when it is picked and every resident tool is there', () => {
    const told = places({ kind: 'selected' }, { residents: [{ name: 'Files', there: true }] })
    expect(told.places).toEqual([
      {
        point: POINT,
        key: 'counter',
        standing: 'selected',
        says: 'work can be handed to it now, and a session made with it',
      },
      {
        point: TOOLS,
        key: 'Files',
        standing: 'in effect',
        says: 'a tool this definition keeps resident',
      },
    ])
    expect(told.advice).toContain('skill/tidy-notes')
  })

  it('cannot start a session while a resident tool is not there, and says which', () => {
    const told = places({ kind: 'selected' })
    expect(told.places.map(place => [place.key, place.standing])).toEqual([
      ['counter', 'not in effect'],
      ['Files', 'in effect'],
      ['wordcount', 'not in effect'],
      ['later', 'not known'],
    ])
    expect(told.places[0]?.says).toBe(
      'a session with it cannot start now: a resident tool is not there',
    )
    expect(told.places[2]?.says).toContain('its resident tool wordcount is not there now')
  })

  it('says who stands in its place, or why it is held and not used, and lists no tool then', () => {
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
