import { describe, expect, it } from 'vitest'
import { SettingDefinitionsSchema } from '@omne-harness/settings'
import {
  SettingsProjectionBindingSchema,
  SettingsValueProjectionSchema,
  type SettingsProjectionBinding,
  type SettingsValueProjection,
} from '@omne-harness/settings-local'
import {
  HELD_SETTINGS_CONFIGURATION,
  heldSettingsCommands,
  heldSettingsCurrentMaterial,
} from '../../../src/rows/governance/held-settings-current.ts'

const TENANT = 'tenant-a'
const TARGET = { kind: 'asset', holdingRef: 'held-1', scopeRef: TENANT } as const
const definition = SettingDefinitionsSchema.parse({
  providerId: 'test.gadget',
  definitionId: 'preferences',
  version: 'v1',
  groups: [{ id: 'general', parentId: null, title: 'General', description: 'Gadget', order: 0 }],
  items: [
    {
      id: 'enabled',
      groupId: 'general',
      category: 'preference',
      presentation: {
        title: 'Enabled',
        description: 'Whether it runs',
        impact: 'Used on next read',
        clear: 'Use the outer value',
        adoption: 'next-read',
      },
      valueSchema: { type: 'boolean' },
      default: { kind: 'value', value: false },
      merge: 'override',
      sensitivity: 'ordinary',
    },
  ],
})
const definitionRef = {
  providerId: 'test.gadget',
  definitionId: 'preferences',
  version: 'v1',
  digest: 'a'.repeat(64),
}

function capture(targets: readonly unknown[] = [TARGET]): SettingsProjectionBinding {
  return SettingsProjectionBindingSchema.parse({
    domain: { scope: { kind: 'tenant', tenant: TENANT }, transactionDomain: 'assets.test' },
    principalRef: 'writer',
    captureId: 'capture-1',
    request: { deploymentRef: 'deployment', mode: 'management', targets, selectionRef: null },
  })
}

function view(overrides: Record<string, unknown> = {}) {
  return {
    target: TARGET,
    enabled: true,
    definitionRef,
    definition,
    sources: [
      {
        sourceId: 'tenant',
        ownerRef: 'assets.tenant-publishing',
        scope: { kind: 'tenant', subjectRef: TENANT },
        authorityRevision: '3',
      },
    ],
    grants: [{ sourceId: 'tenant', actions: ['set', 'clear'] }],
    ownerRevision: 3,
    state: { revision: 2, sources: [] },
    ...overrides,
  }
}

function values(
  binding: SettingsProjectionBinding,
  views: readonly unknown[] = [{ view: view(), presence: 'present' }],
): SettingsValueProjection {
  return SettingsValueProjectionSchema.parse({ binding, views })
}

describe('the current facts of an asset target that no release governs', () => {
  it('come from the holding: the stored definition, its reference, the revisions, the sources and the grants', () => {
    const bound = capture()
    const material = heldSettingsCurrentMaterial(values(bound), bound, HELD_SETTINGS_CONFIGURATION)
    expect(material).toMatchObject({
      basis: {
        target: TARGET,
        definitionRef,
        ownerRevision: 3,
        enabled: true,
        valueRevision: 2,
        declaration: { ownerRef: 'assets' },
        selection: { kind: 'not-required', authority: { ownerRef: 'assets' } },
        policies: [
          {
            policyRef: 'settings.target-grants/asset',
            inputs: [{ presence: 'present', valueRevision: '2' }],
          },
        ],
      },
      standing: {
        kind: 'identity',
        destination: HELD_SETTINGS_CONFIGURATION.destination,
        scopeRef: TENANT,
      },
      sources: { route: HELD_SETTINGS_CONFIGURATION.sourceRoute, sources: [] },
      definition,
      grants: [{ sourceId: 'tenant', actions: ['set', 'clear'] }],
    })
  })

  it('change their declaration revision when the stored definition reference changes', () => {
    const bound = capture()
    const first = heldSettingsCurrentMaterial(values(bound), bound, HELD_SETTINGS_CONFIGURATION)
    const other = values(bound, [
      { view: view({ definitionRef: { ...definitionRef, version: 'v2' } }), presence: 'present' },
    ])
    const second = heldSettingsCurrentMaterial(other, bound, HELD_SETTINGS_CONFIGURATION)
    expect(second?.basis.declaration.revision).not.toBe(first?.basis.declaration.revision)
  })

  it.each([
    [
      'values captured for another binding',
      () => {
        const bound = capture()
        return [
          values(capture([{ ...TARGET, holdingRef: 'held-2' }]), [
            { view: view({ target: { ...TARGET, holdingRef: 'held-2' } }), presence: 'present' },
          ]),
          bound,
        ] as const
      },
    ],
    [
      'no view: the holding is not held',
      () => {
        const bound = capture()
        return [values(bound, []), bound] as const
      },
    ],
    [
      'a view of another target',
      () => {
        const bound = capture()
        return [
          values(bound, [
            { view: view({ target: { ...TARGET, holdingRef: 'held-2' } }), presence: 'present' },
          ]),
          bound,
        ] as const
      },
    ],
    [
      'two views',
      () => {
        const bound = capture()
        const one = { view: view(), presence: 'present' }
        return [values(bound, [one, one]), bound] as const
      },
    ],
    [
      'values that could not be read',
      () => {
        const { state: _state, ...unread } = view()
        const bound = capture()
        return [
          values(bound, [{ view: unread, presence: 'unavailable', reason: 'unavailable' }]),
          bound,
        ] as const
      },
    ],
    [
      'a source of another tenant',
      () => {
        const bound = capture()
        const foreign = view({
          sources: [
            {
              sourceId: 'tenant',
              ownerRef: 'assets.tenant-publishing',
              scope: { kind: 'tenant', subjectRef: 'tenant-b' },
              authorityRevision: '3',
            },
          ],
        })
        return [values(bound, [{ view: foreign, presence: 'present' }]), bound] as const
      },
    ],
    [
      'an independent target',
      () => {
        const independent = {
          kind: 'independent',
          providerId: 'p',
          definitionId: 'd',
          scopeRef: TENANT,
        }
        const bound = capture([independent])
        return [
          values(bound, [{ view: view({ target: independent }), presence: 'present' }]),
          bound,
        ] as const
      },
    ],
    [
      'two targets in the capture',
      () => {
        const bound = capture([TARGET, { ...TARGET, holdingRef: 'held-2' }])
        return [values(bound), bound] as const
      },
    ],
  ])('are absent for %s', (_case, make) => {
    const [projection, bound] = make()
    expect(
      heldSettingsCurrentMaterial(projection, bound, HELD_SETTINGS_CONFIGURATION),
    ).toBeUndefined()
  })

  it('are read through the asset projection, the independent projection and the value projection', () => {
    expect(heldSettingsCommands(capture()).map(command => command.participant)).toEqual([
      'assets.settings',
      'settings.target-projection',
      'settings.value-projection',
    ])
  })
})
