// combinationManifest (SPEC 4.3): the order of the checks and one case per problem kind.
import { describe, expect, it } from 'vitest'
import {
  combinationManifest,
  type MigrationDescriptor,
  type ParticipantDescriptor,
  type SqlMaterialCatalog,
  manifestDigest,
} from '@omne-harness/sql-contract'

const F = { key: 'f', protocol: '1' }
const G = { key: 'g', protocol: '1' }

function participant(
  name: string,
  over: Partial<ParticipantDescriptor> = {},
): ParticipantDescriptor {
  return {
    participant: name,
    protocol: '1',
    moduleUrl: `file:///x/${name}.js`,
    codeDigest: '1'.repeat(64),
    ownedTables: [`t_${name}`],
    readTables: [],
    requiresFacts: [],
    providesFacts: [],
    allowedFunctions: [],
    grouping: 'groupable',
    ...over,
  }
}

function migration(
  owner: string,
  id: string,
  requires: MigrationDescriptor['requires'] = [],
): MigrationDescriptor {
  return { owner, id, moduleUrl: `file:///m/${owner}.js`, checksum: '2'.repeat(64), requires }
}

function catalog(
  participants: ParticipantDescriptor[],
  migrations: MigrationDescriptor[] = [],
): SqlMaterialCatalog {
  return {
    catalogProtocol: 'sql-catalog/1',
    participants,
    migrations,
    readHandlers: [],
    declaredCombinations: { tenant: null, system: null },
  }
}

const A = participant('A', { providesFacts: [F] })
const B = participant('B', { requiresFacts: [F] })

describe('combinationManifest', () => {
  it('returns the manifest of a valid combination without moduleUrl', () => {
    const result = combinationManifest({
      catalog: catalog(
        [A, B],
        [migration('A', '1'), migration('B', '1', [{ owner: 'A', id: '1' }])],
      ),
      participants: ['B', 'A'],
    })
    if (result.kind !== 'manifest') throw new Error(result.kind)
    expect(result.manifest.manifestProtocol).toBe('sql-manifest/1')
    expect(result.manifest.participants.map(p => p.participant)).toEqual(['A', 'B'])
    expect(JSON.stringify(result.manifest)).not.toContain('moduleUrl')
    expect(result.manifest.migrations.map(m => `${m.owner}/${m.id}`)).toEqual(['A/1', 'B/1'])
  })

  it('includes the requires closure of a migration, also of another owner', () => {
    const result = combinationManifest({
      catalog: catalog(
        [A],
        [migration('A', '1', [{ owner: 'lib', id: '9' }]), migration('lib', '9')],
      ),
      participants: ['A'],
    })
    if (result.kind !== 'manifest') throw new Error(result.kind)
    expect(result.manifest.migrations.map(m => `${m.owner}/${m.id}`)).toEqual(['A/1', 'lib/9'])
  })

  it('reports material_unavailable for a participant that the catalog lacks', () => {
    expect(combinationManifest({ catalog: catalog([A]), participants: ['A', 'Z'] })).toEqual({
      kind: 'material_unavailable',
      participant: 'Z',
    })
  })

  it('reports a fact cycle', () => {
    const x = participant('X', { providesFacts: [F], requiresFacts: [G] })
    const y = participant('Y', { providesFacts: [G], requiresFacts: [F] })
    expect(combinationManifest({ catalog: catalog([x, y]), participants: ['X', 'Y'] })).toEqual({
      kind: 'combination_invalid',
      problems: [{ kind: 'fact_cycle', participants: ['X', 'Y'] }],
    })
  })

  it('reports a fact that no selected participant provides', () => {
    expect(combinationManifest({ catalog: catalog([A, B]), participants: ['B'] })).toEqual({
      kind: 'combination_invalid',
      problems: [{ kind: 'fact_unprovided', participant: 'B', fact: F }],
    })
  })

  it('reports a fact with two providers', () => {
    const c = participant('C', { providesFacts: [F] })
    expect(combinationManifest({ catalog: catalog([A, c]), participants: ['A', 'C'] })).toEqual({
      kind: 'combination_invalid',
      problems: [{ kind: 'fact_provided_twice', fact: F, participants: ['A', 'C'] }],
    })
  })

  it('reports a table with two owners', () => {
    const c = participant('C', { ownedTables: ['t_A'] })
    expect(combinationManifest({ catalog: catalog([A, c]), participants: ['A', 'C'] })).toEqual({
      kind: 'combination_invalid',
      problems: [{ kind: 'table_owned_twice', table: 't_A', participants: ['A', 'C'] }],
    })
  })

  it('reports a read table without owner, and a provider table as unowned', () => {
    const r = participant('R', { readTables: ['nowhere', '_sql_receipt'] })
    expect(combinationManifest({ catalog: catalog([r]), participants: ['R'] })).toEqual({
      kind: 'combination_invalid',
      problems: [
        { kind: 'read_table_unowned', participant: 'R', table: '_sql_receipt' },
        { kind: 'read_table_unowned', participant: 'R', table: 'nowhere' },
      ],
    })
  })

  it('accepts a read of a table that another selected participant owns', () => {
    const r = participant('R', { readTables: ['t_A'] })
    expect(combinationManifest({ catalog: catalog([A, r]), participants: ['A', 'R'] }).kind).toBe(
      'manifest',
    )
  })

  it('reports a migration requirement that the catalog lacks', () => {
    expect(
      combinationManifest({
        catalog: catalog([A], [migration('A', '1', [{ owner: 'ghost', id: '1' }])]),
        participants: ['A'],
      }),
    ).toEqual({
      kind: 'combination_invalid',
      problems: [{ kind: 'migration_missing', required: { owner: 'ghost', id: '1' } }],
    })
  })

  it('reports a migration cycle', () => {
    const b2 = participant('B2')
    expect(
      combinationManifest({
        catalog: catalog(
          [A, b2],
          [
            migration('A', '1', [{ owner: 'B2', id: '1' }]),
            migration('B2', '1', [{ owner: 'A', id: '1' }]),
          ],
        ),
        participants: ['A', 'B2'],
      }),
    ).toEqual({
      kind: 'combination_invalid',
      problems: [
        {
          kind: 'migration_cycle',
          migrations: [
            { owner: 'A', id: '1' },
            { owner: 'B2', id: '1' },
          ],
        },
      ],
    })
  })

  it('collects every problem in one result', () => {
    const c = participant('C', {
      providesFacts: [F],
      ownedTables: ['t_A'],
      readTables: ['nowhere'],
    })
    const d = participant('D', { requiresFacts: [G] })
    const result = combinationManifest({
      catalog: catalog([A, c, d], [migration('A', '1', [{ owner: 'ghost', id: '1' }])]),
      participants: ['A', 'C', 'D'],
    })
    if (result.kind !== 'combination_invalid') throw new Error(result.kind)
    expect(result.problems.map(p => p.kind)).toEqual([
      'fact_unprovided',
      'fact_provided_twice',
      'table_owned_twice',
      'read_table_unowned',
      'migration_missing',
    ])
  })

  it('reports a participant that provides and requires the same fact as a one-member fact_cycle', () => {
    const s = participant('S', { providesFacts: [F], requiresFacts: [F] })
    expect(combinationManifest({ catalog: catalog([s]), participants: ['S'] })).toEqual({
      kind: 'combination_invalid',
      problems: [{ kind: 'fact_cycle', participants: ['S'] }],
    })
  })

  it('orders names by UTF-16 code units, so "B" comes before "a" (not localeCompare)', () => {
    const lower = participant('a', { providesFacts: [F] })
    const upper = participant('B', { providesFacts: [F] })
    const input = { catalog: catalog([lower, upper]), participants: ['a', 'B'] }
    expect(combinationManifest(input)).toMatchObject({
      problems: [{ kind: 'fact_provided_twice', participants: ['B', 'a'] }],
    })
    const plain = combinationManifest({
      catalog: catalog([participant('a'), participant('B')]),
      participants: ['a', 'B'],
    })
    if (plain.kind !== 'manifest') throw new Error(plain.kind)
    expect(plain.manifest.participants.map(p => p.participant)).toEqual(['B', 'a'])
  })

  describe('the digest does not depend on the order of a list that the descriptor holds', () => {
    const digestOfOrder = (
      build: (order: <T>(list: T[]) => T[]) => SqlMaterialCatalog,
      names: string[],
      reverse: boolean,
    ): string => {
      const order = <T>(list: T[]): T[] => (reverse ? [...list].reverse() : list)
      const result = combinationManifest({ catalog: build(order), participants: names })
      if (result.kind !== 'manifest') throw new Error(result.kind)
      return manifestDigest(result.manifest)
    }
    const cases: [string, (order: <T>(list: T[]) => T[]) => SqlMaterialCatalog, string[]][] = [
      [
        'readTables',
        order => {
          const owner = participant('O', { ownedTables: ['t_1', 't_2', 't_3'] })
          return catalog([owner, participant('R', { readTables: order(['t_1', 't_2', 't_3']) })])
        },
        ['O', 'R'],
      ],
      [
        'allowedFunctions',
        order => catalog([participant('A', { allowedFunctions: order(['abs', 'max', 'min']) })]),
        ['A'],
      ],
      [
        'requiresFacts',
        order =>
          catalog([
            participant('P', { providesFacts: [F, G] }),
            participant('R', { requiresFacts: order([F, G]) }),
          ]),
        ['P', 'R'],
      ],
      [
        'providesFacts',
        order => catalog([participant('P', { providesFacts: order([F, G]) })]),
        ['P'],
      ],
      [
        'migration requires',
        order =>
          catalog(
            [participant('A')],
            [
              migration(
                'A',
                '1',
                order([
                  { owner: 'L', id: '1' },
                  { owner: 'L', id: '2' },
                ]),
              ),
              migration('L', '1'),
              migration('L', '2'),
            ],
          ),
        ['A'],
      ],
    ]
    it.each(cases)('%s', (_name, build, names) => {
      expect(digestOfOrder(build, names, true)).toBe(digestOfOrder(build, names, false))
    })
  })

  it('judges a missing participant before any combination problem', () => {
    const result = combinationManifest({ catalog: catalog([B]), participants: ['B', 'Z'] })
    expect(result.kind).toBe('material_unavailable')
  })
})
