import { describe, expect, it } from 'vitest'
import type { TenantSettings } from '@omne-harness/settings'
import { releasedDeclaration } from '../../../src/entry/permission-declarations.ts'
import { createTenantPicks } from '../../../src/rows/authorization/tenant-picks.ts'
import { TOOL_RELEASE_TENANT, loadProductionRelease } from '../../../src/entry/tool-release.ts'

const release = await loadProductionRelease()
if (release.kind !== 'trusted') throw new Error('Production release unavailable')
const declarations = release.manifest.entries.map(releasedDeclaration)
const shell = declarations.find(entry => entry.asset.name === 'Shell')
if (shell === undefined) throw new Error('Shell release missing')

type Face = TenantSettings<unknown>
type Described = Awaited<ReturnType<Face['describe']>>
type Outcome = Awaited<ReturnType<Face['set']>>
const card = { owner: 'human-intervention', record: 'card/1', revision: '1', digest: 'card' }
const source = { owner: 'human-intervention', record: 'reply/1', revision: '1', digest: 'said' }
const gate = {
  principal: { kind: 'acting-for-tenant' } as never,
  tenant: TOOL_RELEASE_TENANT,
  definition: shell.asset.adoption,
  gate: { id: 'run', title: '执行', default: 'ask' as const },
}

function view(over: Readonly<Record<string, unknown>> = {}): Described {
  return {
    kind: 'described',
    item: {
      kind: 'permission',
      owner: { kind: 'asset', category: 'tool', name: 'Shell' },
      item: 'run',
      revision: '7',
      own: null,
      bound: null,
      editable: { kind: 'yes' },
      ...over,
    } as never,
  }
}

function world(described: Described, outcome: Outcome = { kind: 'written', revision: '8' }) {
  const asked: Parameters<Face['describe']>[0][] = []
  const sets: Parameters<Face['set']>[0][] = []
  const settings = {
    describe: async (input: Parameters<Face['describe']>[0]) => {
      asked.push(input)
      return described
    },
    set: async (input: Parameters<Face['set']>[0]) => {
      sets.push(input)
      return outcome
    },
  } as unknown as Face
  const picks = createTenantPicks({ declarations: () => declarations, settings: () => settings })
  return { picks, asked, sets }
}
const answer = (effect: 'allow' | 'deny') => ({
  ...gate,
  effect,
  option: effect === 'allow' ? 'allow-always' : 'deny-always',
  card,
  source,
})

describe('which lasting picks the tenant setting of a gate can take', () => {
  it('reads the item of the gate as the work of the session, and offers both when it is editable and unbound', async () => {
    const w = world(view())
    expect(await w.picks.writable(gate)).toEqual({ allow: true, deny: true })
    expect(w.asked).toEqual([
      {
        principal: gate.principal,
        tenant: gate.tenant,
        owner: { kind: 'asset', name: 'Shell' },
        item: 'run',
      },
    ])
  })

  it.each([
    ['the bound leaves automatic out', view({ bound: ['deny', 'ask'] }), [false, true]],
    ['the bound leaves prohibition out', view({ bound: ['ask', 'auto'] }), [true, false]],
    [
      'a prohibition above closes the item',
      view({ editable: { kind: 'no', reason: 'prohibited-above' } }),
      [false, false],
    ],
    ['the reader has no standing', { kind: 'denied' }, [false, false]],
    ['the item is not visible', { kind: 'not-visible' }, [false, false]],
    ['two items answer the name', { kind: 'conflict' }, [false, false]],
  ] as const)('offers what can be written when %s', async (_name, described, [allow, deny]) => {
    expect(await world(described as Described).picks.writable(gate)).toEqual({ allow, deny })
  })

  it('offers nothing for a gate no declaration answers, and waits when the settings cannot be read', async () => {
    const other = { ...gate, definition: { ...gate.definition, name: 'Unknown' } }
    const w = world(view())
    expect(await w.picks.writable(other)).toEqual({ allow: false, deny: false })
    expect(w.asked).toEqual([])
    expect(await world({ kind: 'unavailable' }).picks.writable(gate)).toBe('unavailable')
    const absent = createTenantPicks({
      declarations: () => declarations,
      settings: () => undefined,
    })
    expect(await absent.writable(gate)).toBe('unavailable')
  })
})

describe('the setting item and the values a gate declares', () => {
  const declared = (change: (entry: (typeof declarations)[number]) => unknown) =>
    declarations.map(entry => (entry === shell ? (change(entry) as typeof entry) : entry))
  const picksOver = (list: typeof declarations, described: Described = view()) => {
    const sets: Parameters<Face['set']>[0][] = []
    const settings = {
      describe: async () => described,
      set: async (input: Parameters<Face['set']>[0]) => {
        sets.push(input)
        return { kind: 'written', revision: '8' }
      },
    } as unknown as Face
    return {
      sets,
      picks: createTenantPicks({ declarations: () => list, settings: () => settings }),
    }
  }
  const interpretationOf = (entry: (typeof declarations)[number]) =>
    entry.governance.interpretations.find(value => value.binding.enforcementKey === 'tool.run')!

  it('offers nothing for a gate whose permission has no setting item', async () => {
    const unmapped = declared(entry => {
      const interpretation = interpretationOf(entry)
      return {
        ...entry,
        governance: {
          ...entry.governance,
          interpretations: [
            { ...interpretation, definition: { ...interpretation.definition, settings: null } },
          ],
        },
      }
    })
    const w = picksOver(unmapped)
    expect(await w.picks.writable(gate)).toEqual({ allow: false, deny: false })
    expect(await w.picks.write(answer('allow'))).toBe('not-writable')
    expect(w.sets).toEqual([])
  })

  it('offers only the effect exactly one value stands for', async () => {
    const twoAllowing = declared(entry => {
      const interpretation = interpretationOf(entry)
      return {
        ...entry,
        governance: {
          ...entry.governance,
          interpretations: [
            {
              ...interpretation,
              effects: interpretation.effects.map(effect =>
                effect.effect === 'need-decision' ? { ...effect, effect: 'allow' } : effect,
              ),
            },
          ],
        },
      }
    })
    const w = picksOver(twoAllowing)
    expect(await w.picks.writable(gate)).toEqual({ allow: false, deny: true })
    expect(await w.picks.write(answer('allow'))).toBe('not-writable')
    expect(await w.picks.write(answer('deny'))).toBe('written')
    expect(w.sets).toHaveLength(1)
  })

  it('offers nothing for an item that is not a permission', async () => {
    const ordinary = { kind: 'described', item: { kind: 'ordinary', editable: { kind: 'yes' } } }
    const w = picksOver(declarations, ordinary as never)
    expect(await w.picks.writable(gate)).toEqual({ allow: false, deny: false })
    expect(await w.picks.write(answer('allow'))).toBe('not-writable')
  })
})

describe('writing the lasting pick on a card answer', () => {
  it('sets the value of the effect at the revision it read, standing on the answer of the card', async () => {
    const w = world(view())
    expect(await w.picks.write(answer('allow'))).toBe('written')
    expect(w.sets).toHaveLength(1)
    expect(w.sets[0]).toMatchObject({
      principal: {
        kind: 'card-answer',
        principal: gate.principal,
        card,
        source,
        option: 'allow-always',
      },
      owner: { kind: 'asset', name: 'Shell' },
      item: 'run',
      expectedRevision: '7',
      value: { kind: 'permission', pick: 'auto' },
    })
    const deny = world(view())
    expect(await deny.picks.write(answer('deny'))).toBe('written')
    expect(deny.sets[0]).toMatchObject({ value: { kind: 'permission', pick: 'deny' } })
  })

  it('names one operation for one answer at one revision, and another at another revision', async () => {
    const operationOf = async (revision: string, said = source) => {
      const w = world(view({ revision }))
      await w.picks.write({ ...answer('allow'), source: said })
      return w.sets[0]!.operation
    }
    expect(await operationOf('7')).toBe(await operationOf('7'))
    expect(await operationOf('7')).not.toBe(await operationOf('8'))
    expect(await operationOf('7')).not.toBe(await operationOf('7', { ...source, digest: 'other' }))
    expect(await operationOf('7')).toMatch(/^card-answer\/[0-9a-f]{64}$/)
  })

  it('writes nothing when the tenant already holds the value', async () => {
    const w = world(view({ own: 'auto' }))
    expect(await w.picks.write(answer('allow'))).toBe('written')
    expect(w.sets).toEqual([])
    const other = world(view({ own: 'auto' }))
    expect(await other.picks.write(answer('deny'))).toBe('written')
    expect(other.sets).toHaveLength(1)
  })

  it.each([
    [{ kind: 'no-change' }, 'written'],
    [{ kind: 'unknown' }, 'unavailable'],
    [{ kind: 'unavailable' }, 'unavailable'],
    [{ kind: 'conflict' }, 'unavailable'],
    [{ kind: 'denied' }, 'not-writable'],
    [{ kind: 'not-visible' }, 'not-writable'],
    [{ kind: 'invalid' }, 'not-writable'],
    [{ kind: 'not-writable', reason: 'locked' }, 'not-writable'],
    [{ kind: 'not-writable', reason: 'out-of-bound' }, 'not-writable'],
  ] as const)('answers a set that ends %j as %s', async (outcome, expected) => {
    expect(await world(view(), outcome as Outcome).picks.write(answer('allow'))).toBe(expected)
  })

  it('does not write where the item cannot be read as a permission, and waits when it cannot be read now', async () => {
    const denied = world({ kind: 'denied' })
    expect(await denied.picks.write(answer('allow'))).toBe('not-writable')
    expect(denied.sets).toEqual([])
    expect(await world({ kind: 'unavailable' }).picks.write(answer('deny'))).toBe('unavailable')
    const other = { ...answer('allow'), definition: { ...gate.definition, name: 'Unknown' } }
    expect(await world(view()).picks.write(other)).toBe('not-writable')
  })

  it('waits, and writes nothing, while the settings are not there, whether or not the gate has an item', async () => {
    const absent = createTenantPicks({
      declarations: () => declarations,
      settings: () => undefined,
    })
    const other = { ...answer('allow'), definition: { ...gate.definition, name: 'Unknown' } }
    expect(await absent.write(answer('allow'))).toBe('unavailable')
    expect(await absent.write(other)).toBe('unavailable')
    expect(await absent.writable(other)).toBe('unavailable')
  })

  it('does not read the settings for a gate the declarations do not answer, nor write for an effect it has no value for', async () => {
    const other = { ...answer('allow'), definition: { ...gate.definition, name: 'Unknown' } }
    const w = world(view())
    expect(await w.picks.write(other)).toBe('not-writable')
    expect(w.asked).toEqual([])
    expect(w.sets).toEqual([])
  })

  it.each([
    ['not visible', { kind: 'not-visible' }],
    ['conflicting', { kind: 'conflict' }],
    [
      'not a permission',
      { kind: 'described', item: { kind: 'ordinary', editable: { kind: 'yes' } } },
    ],
  ] as const)(
    'writes nothing to an item that is %s, and answers not-writable',
    async (_what, described) => {
      const w = world(described as unknown as Described)
      expect(await w.picks.write(answer('allow'))).toBe('not-writable')
      expect(await w.picks.write(answer('deny'))).toBe('not-writable')
      expect(w.sets).toEqual([])
    },
  )
})
