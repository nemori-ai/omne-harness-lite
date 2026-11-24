import { describe, expect, it } from 'vitest'
import { scriptToolImpact, scriptToolPlace } from '@omne-harness/tool-contract/provider'

const POINT = 'tool.tools'
const facts = { name: 'wordcount', deployed: false, refused: null }

describe('what is told of a directory before it is published as a tool', () => {
  it('says it will be found and called, and that a call asks a person', () => {
    expect(scriptToolImpact(POINT, facts)).toEqual({
      lines: [
        {
          mark: '+',
          of: null,
          point: POINT,
          key: 'wordcount',
          says: '→ held; Tools of this tenant finds it and calls it from now',
        },
      ],
      advice: 'A call of it asks a person unless the session lets it through.',
    })
  })

  it('says the first thing the category refuses', () => {
    const told = scriptToolImpact(POINT, { ...facts, refused: 'tool.json: run is missing' })
    expect(told.lines).toEqual([
      expect.objectContaining({ mark: '!', says: '→ would be refused: tool.json: run is missing' }),
    ])
    expect(told.advice).toBeNull()
  })

  it('says a name the deployment holds is refused, whatever the directory holds', () => {
    const told = scriptToolImpact(POINT, { name: 'Files', deployed: true, refused: 'anything' })
    expect(told.lines.map(line => line.says)).toEqual([
      '→ would be refused: the deployment holds a tool named Files',
    ])
    expect(told.advice).toBe('Publish it under another name.')
  })
})

describe('where a held tool stands', () => {
  const place = (
    ...given: Parameters<typeof scriptToolPlace> extends [unknown, unknown, ...infer R] ? R : never
  ) => scriptToolPlace(POINT, 'wordcount', ...given)

  it('is callable when the asset rules pick it and it loaded', () => {
    expect(place({ kind: 'selected' }, 'callable')).toEqual({
      point: POINT,
      key: 'wordcount',
      standing: 'selected',
      says: 'Tools of this tenant calls it now',
    })
  })

  it('is not in effect when it is picked and could not be loaded, with how the load ended', () => {
    expect(place({ kind: 'selected' }, { failed: 'invalid (construction)' })).toMatchObject({
      standing: 'not in effect',
      says: 'it is held and could not be loaded: invalid (construction)',
    })
  })

  it('says who stands in its place when the asset rules do not pick it, whatever the load', () => {
    const blocked = { kind: 'filtered', reason: 'blocked', by: 'official' } as const
    expect(place(blocked, 'callable')).toMatchObject({
      standing: 'not in effect',
      says: 'blocked by official',
    })
    expect(place({ kind: 'filtered', reason: 'disabled' }, 'callable').says).toBe('disabled')
  })

  it('is not known when a layer, the standing or the load cannot be read', () => {
    expect(place(undefined, 'callable').standing).toBe('not known')
    expect(place({ kind: 'unavailable', layer: 'tenant' }, 'callable')).toMatchObject({
      standing: 'not known',
      says: 'the tenant layer cannot be read now',
    })
    expect(place({ kind: 'selected' }, 'unknown').standing).toBe('not known')
  })
})
