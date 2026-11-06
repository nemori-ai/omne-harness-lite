import { expect, it } from 'vitest'
import { validateBundle } from '../src/definition.ts'
import { bundle } from './operation-world.ts'
import { declaration } from './definition-fixture.ts'
it('uses the public definition validators and requires the complete permission setting projection', () => {
  const value = declaration()
  expect(validateBundle(value)).toEqual({ kind: 'valid', itemCount: 2 })
  const incomplete = structuredClone(value)
  incomplete.settings[0]!.items[0]!.default = {
    kind: 'value',
    value: { pick: 'allow', allowedSet: null },
  }
  expect(validateBundle(incomplete)).toEqual({ kind: 'conflict', reason: 'definition' })
  const renamed = structuredClone(value)
  renamed.settings[0]!.groups[0]!.description = 'Different meaning'
  expect(validateBundle(renamed)).toEqual({ kind: 'conflict', reason: 'definition' })
})
it('rejects duplicate identities, wrong origins and missing enforcement bindings', () => {
  const value = declaration()
  expect(
    validateBundle({ ...value, permissions: [...value.permissions, ...value.permissions] }),
  ).toEqual({ kind: 'conflict', reason: 'definition' })
  expect(validateBundle({ ...value, settings: [...value.settings, ...value.settings] })).toEqual({
    kind: 'conflict',
    reason: 'definition',
  })
  expect(validateBundle({ ...value, enforcementBindings: [] })).toEqual({
    kind: 'conflict',
    reason: 'definition',
  })
  const wrong = structuredClone(value)
  wrong.permissions[0]!.reference.origin = { ...bundle.origin, providerId: 'other' }
  expect(validateBundle(wrong)).toEqual({ kind: 'conflict', reason: 'definition' })
})
it('enforces cumulative item and encoded bundle budgets', () => {
  const value = declaration(),
    definition = value.settings[0]!
  const many = {
    ...value,
    settings: [
      {
        ...definition,
        items: Array.from({ length: 128 }, (_, i) => ({
          ...definition.items[0]!,
          id: 'item-' + i,
        })),
      },
    ],
  }
  expect(validateBundle(many)).toEqual({ kind: 'limited', resource: 'declaration' })
  const huge = structuredClone(value)
  huge.settings[0]!.items[0]!.valueSchema = { description: 'x'.repeat(256 * 1024) }
  expect(validateBundle(huge)).toEqual({ kind: 'limited', resource: 'declaration' })
})
