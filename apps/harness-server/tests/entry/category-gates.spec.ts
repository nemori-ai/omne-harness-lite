import { describe, expect, it } from 'vitest'
import { SettingDefinitionsSchema } from '@omne-harness/settings'
import {
  categoryGateRelease,
  categoryGateTemplatesSchema,
  gatedCategoryContract,
  gatedSettings,
  storedCategoryGateRelease,
  storedCategoryGateTemplate,
  type CategoryGateTemplate,
} from '../../src/entry/category-gates.ts'
import { resolvePermissionInterpretation } from '../../src/rows/governance/permission-interpretation.ts'

const TEMPLATE: CategoryGateTemplate = {
  category: 'probe',
  ownerId: 'test.probe-gates',
  gates: [{ id: 'invoke', title: '调用', default: 'ask' }],
}
const OWN = SettingDefinitionsSchema.parse({
  providerId: 'probe',
  definitionId: 'preferences',
  version: '1',
  groups: [{ id: 'general', parentId: null, title: '常用', description: '设置', order: 0 }],
  items: [
    {
      id: 'region',
      groupId: 'general',
      category: 'preference',
      presentation: {
        title: '区域',
        description: '请求发到哪个区域',
        impact: '下一次读取时生效',
        clear: '回到缺省',
        adoption: 'next-read',
      },
      valueSchema: { type: 'string' },
      default: { kind: 'value', value: 'east' },
      merge: 'override',
      sensitivity: 'ordinary',
    },
  ],
})
const publication = (name: string, version = '1') => ({
  assetRef: `asset-${name}`,
  category: 'probe',
  name,
  version,
  source: 'tenant',
  bodyDigest: 'a'.repeat(64),
})

describe('the settings of a gated category', () => {
  it('carry the own items and one governance item for each gate, under the identity of the capability', () => {
    const settings = gatedSettings(TEMPLATE, 'alpha', OWN)
    expect([settings.providerId, settings.definitionId]).toEqual([
      'test.probe-gates',
      'probe.alpha',
    ])
    expect(settings.items.map(item => [item.id, item.category])).toEqual([
      ['region', 'preference'],
      ['invoke', 'governance'],
    ])
    expect(settings.items[1]?.default).toEqual({
      kind: 'value',
      value: { pick: 'ask', allowedSet: null },
    })
  })

  it('are the same bytes for the same input, and another version when the own settings change', () => {
    expect(gatedSettings(TEMPLATE, 'alpha', OWN)).toEqual(gatedSettings(TEMPLATE, 'alpha', OWN))
    expect(gatedSettings(TEMPLATE, 'alpha', null).version).not.toBe(
      gatedSettings(TEMPLATE, 'alpha', OWN).version,
    )
    expect(gatedSettings(TEMPLATE, 'alpha', { ...OWN, version: '2' }).version).not.toBe(
      gatedSettings(TEMPLATE, 'alpha', OWN).version,
    )
  })

  it('come from the wrapped contract, which refuses a template of another category', () => {
    const contract = {
      category: 'probe',
      schema: { kind: 'object' as const, entries: [] },
      judge: () => ({ ok: true as const }),
      deriveDeclarations: () => ({ entries: [] }),
      references: () => [],
      settings: () => OWN,
    }
    const gated = gatedCategoryContract(contract, TEMPLATE)
    expect(
      gated.settings?.({ kind: 'null' }, { capabilityName: 'alpha', definition: '1' }),
    ).toEqual(gatedSettings(TEMPLATE, 'alpha', OWN))
    expect(() => gatedCategoryContract({ ...contract, category: 'other' }, TEMPLATE)).toThrow()
  })
})

describe('the declaration of one held capability of a gated category', () => {
  it('names the capability and the gate, and its interpretation resolves', () => {
    const release = categoryGateRelease({
      template: TEMPLATE,
      publication: publication('alpha'),
      settings: gatedSettings(TEMPLATE, 'alpha', OWN),
    })
    expect(release?.declaration.reference).toMatchObject({
      ownerId: 'test.probe-gates',
      definitionId: 'probe.alpha',
    })
    expect(release?.declaration.enforcementBindings).toMatchObject([
      { capabilityId: 'probe.alpha', enforcementKey: 'probe.invoke', action: 'invoke' },
    ])
    expect(release?.declaration.origin).toEqual({
      kind: 'asset',
      assetId: 'asset-alpha',
      releaseRef: 'asset-alpha/1',
    })
    const [interpretation] = release?.interpretations ?? []
    expect(
      resolvePermissionInterpretation(interpretation, release!.declaration.enforcementBindings[0]!)
        .kind,
    ).toBe('supported')
  })

  it('is the same for the same facts and another version for another publication or settings', () => {
    const settings = gatedSettings(TEMPLATE, 'alpha', OWN)
    const one = categoryGateRelease({
      template: TEMPLATE,
      publication: publication('alpha'),
      settings,
    })
    expect(
      categoryGateRelease({ template: TEMPLATE, publication: publication('alpha'), settings }),
    ).toEqual(one)
    const next = categoryGateRelease({
      template: TEMPLATE,
      publication: publication('alpha', '2'),
      settings,
    })
    expect(next?.declaration.reference.version).not.toBe(one?.declaration.reference.version)
    const bare = categoryGateRelease({
      template: TEMPLATE,
      publication: publication('alpha'),
      settings: gatedSettings(TEMPLATE, 'alpha', null),
    })
    expect(bare?.declaration.reference.version).not.toBe(one?.declaration.reference.version)
  })

  it('keeps two capabilities of one category apart', () => {
    const of = (name: string) =>
      categoryGateRelease({
        template: TEMPLATE,
        publication: publication(name),
        settings: gatedSettings(TEMPLATE, name, OWN),
      })
    expect(of('alpha')?.declaration.enforcementBindings[0]?.capabilityId).toBe('probe.alpha')
    expect(of('beta')?.declaration.enforcementBindings[0]?.capabilityId).toBe('probe.beta')
    expect(of('alpha')?.declaration.settings[0]?.definitionId).not.toBe(
      of('beta')?.declaration.settings[0]?.definitionId,
    )
  })

  it.each([
    ['settings without the gate item', OWN],
    ['settings of another capability', gatedSettings(TEMPLATE, 'beta', OWN)],
    [
      'a gate item that is not the projected one',
      (() => {
        const settings = gatedSettings(TEMPLATE, 'alpha', OWN)
        return {
          ...settings,
          items: settings.items.map(item =>
            item.id === 'invoke'
              ? { ...item, default: { kind: 'value', value: { pick: 'auto', allowedSet: null } } }
              : item,
          ),
        }
      })(),
    ],
  ])('has no declaration for %s', (_name, settings) => {
    expect(
      categoryGateRelease({
        template: TEMPLATE,
        publication: publication('alpha'),
        settings: SettingDefinitionsSchema.parse(settings),
      }),
    ).toBeUndefined()
  })

  it('is found again from the stored settings alone, with the template the category named', () => {
    const settings = gatedSettings(TEMPLATE, 'alpha', OWN)
    expect(storedCategoryGateTemplate(publication('alpha'), settings)).toEqual(TEMPLATE)
    expect(storedCategoryGateRelease(publication('alpha'), settings)).toEqual({
      template: TEMPLATE,
      release: categoryGateRelease({
        template: TEMPLATE,
        publication: publication('alpha'),
        settings,
      }),
    })
    expect(storedCategoryGateRelease(publication('alpha'), OWN)).toBeUndefined()
  })

  it('has no declaration for a publication of another category', () => {
    expect(
      categoryGateRelease({
        template: TEMPLATE,
        publication: { ...publication('alpha'), category: 'other' },
        settings: gatedSettings(TEMPLATE, 'alpha', OWN),
      }),
    ).toBeUndefined()
  })
})

describe('the templates an assembly names', () => {
  it('are one for each category and owner', () => {
    expect(categoryGateTemplatesSchema.safeParse([TEMPLATE]).success).toBe(true)
    expect(categoryGateTemplatesSchema.safeParse([TEMPLATE, TEMPLATE]).success).toBe(false)
    expect(
      categoryGateTemplatesSchema.safeParse([TEMPLATE, { ...TEMPLATE, category: 'other' }]).success,
    ).toBe(false)
  })
})
