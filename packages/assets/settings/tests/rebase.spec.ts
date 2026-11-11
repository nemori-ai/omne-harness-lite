import { expect, it } from 'vitest'
import { decideSettingsRebase, type SettingDefinitions } from '../src/index.ts'
const definition: SettingDefinitions = {
  providerId: 'service',
  definitionId: 'preferences',
  version: '2',
  groups: [
    { id: 'general', parentId: null, title: 'General', description: 'Preferences', order: 0 },
  ],
  items: [
    {
      id: 'mode',
      groupId: 'general',
      category: 'preference',
      presentation: {
        title: 'Mode',
        description: 'Enable detailed mode',
        impact: 'Next read',
        clear: 'Use default',
        adoption: 'next-read',
      },
      valueSchema: { type: 'boolean' },
      default: { kind: 'absent' },
      merge: 'override',
      sensitivity: 'ordinary',
    },
  ],
}
const previousDefinition = {
  providerId: 'service',
  definitionId: 'preferences',
  version: '1',
  digest: 'a'.repeat(64),
}
const nextDefinition = { ...previousDefinition, version: '2', digest: 'b'.repeat(64) }
const state = {
  revision: 1,
  sources: [
    {
      id: 'tenant',
      values: [
        { itemId: 'old', value: { kind: 'value', value: false }, locked: false },
        { itemId: 'mode', value: { kind: 'value', value: true }, locked: true },
      ],
    },
  ],
}
const command = {
  protocol: 'settings-rebase/1',
  requestId: 'r',
  operationId: 'o',
  target: { policyId: 'independent', targetRef: 'service', scopeRef: 'tenant' },
  from: previousDefinition,
  to: nextDefinition,
  expectedRevision: 1,
  assignments: [
    { sourceId: 'tenant', itemId: 'old', disposition: 'discard' },
    { sourceId: 'tenant', itemId: 'mode', disposition: 'retain' },
  ],
}
const input = {
  command,
  state,
  previousDefinition,
  nextDefinition,
  definition,
  sourceIds: ['tenant'],
}
it('requires explicit disposition for every stored value and lock, and revalidates retained values', () => {
  expect(decideSettingsRebase(input)).toMatchObject({
    kind: 'changed',
    state: { revision: 2, sources: [{ values: [state.sources[0]!.values[1]] }] },
  })
  expect(
    decideSettingsRebase({
      ...input,
      command: { ...command, assignments: command.assignments.slice(1) },
    }),
  ).toEqual({ kind: 'rejected', reason: 'invalid_input' })
  expect(
    decideSettingsRebase({
      ...input,
      definition: {
        ...definition,
        items: definition.items.map(item => ({ ...item, valueSchema: { type: 'string' } })),
      },
    }),
  ).toMatchObject({ kind: 'rejected', reason: 'incompatible' })
})
it('does not silently discard removed sources or accept stale definitions/revisions', () => {
  expect(decideSettingsRebase({ ...input, sourceIds: ['other'] })).toEqual({
    kind: 'rejected',
    reason: 'incompatible',
  })
  expect(
    decideSettingsRebase({
      ...input,
      command: {
        ...command,
        assignments: command.assignments.map(a => ({ ...a, disposition: 'discard' })),
      },
      sourceIds: ['other'],
    }),
  ).toMatchObject({ kind: 'changed', state: { sources: [{ id: 'other', values: [] }] } })
  expect(decideSettingsRebase({ ...input, command: { ...command, expectedRevision: 0 } })).toEqual({
    kind: 'rejected',
    reason: 'revision_conflict',
  })
  expect(decideSettingsRebase({ ...input, command: { ...command, from: nextDefinition } })).toEqual(
    { kind: 'rejected', reason: 'definition_changed' },
  )
})
