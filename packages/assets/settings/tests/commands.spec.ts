import { expect, it } from 'vitest'
import { decideSettingsChange } from '../src/index.ts'
const definition = {
  providerId: 'example',
  definitionId: 'preferences',
  version: '1',
  groups: [
    {
      id: 'general',
      parentId: null,
      title: 'General',
      description: 'Common preferences',
      order: 0,
    },
  ],
  items: [
    {
      id: 'enabled',
      groupId: 'general',
      category: 'preference',
      presentation: {
        title: 'Show tips',
        description: 'Display help during use',
        impact: 'Used on the next read',
        clear: 'Use the outer value',
        adoption: 'next-read',
      },
      valueSchema: { type: 'boolean' },
      default: { kind: 'value', value: false },
      merge: 'override',
      sensitivity: 'ordinary',
    },
  ],
}
const definitionRef = {
  providerId: 'example',
  definitionId: 'preferences',
  version: '1',
  digest: 'a'.repeat(64),
}
const command = {
  protocol: 'settings/1',
  requestId: 'r1',
  operationId: 'o1',
  target: { policyId: 'independent', targetRef: 'service', scopeRef: 'tenant-a' },
  definitionRef,
  expectedRevision: 0,
  sourceId: 'tenant',
  itemId: 'enabled',
  action: { kind: 'set', value: true },
}
const state = {
  revision: 0,
  sources: [
    { id: 'organization', values: [] },
    { id: 'tenant', values: [] },
  ],
}
const grants = [{ sourceId: 'tenant', actions: ['set', 'clear', 'lock', 'unlock'] }]
const input = { command, definition, definitionRef, state, grants }
it('checks revisions and definition identity before deciding a mutation', () => {
  expect(decideSettingsChange({ ...input, command: { ...command, expectedRevision: 1 } })).toEqual({
    kind: 'rejected',
    reason: 'revision_conflict',
  })
  expect(
    decideSettingsChange({
      ...input,
      command: { ...command, definitionRef: { ...definitionRef, version: '2' } },
    }),
  ).toEqual({ kind: 'rejected', reason: 'definition_changed' })
  for (const field of ['providerId', 'definitionId', 'version', 'digest'] as const) {
    const different = field === 'digest' ? 'b'.repeat(64) : 'other'
    expect(
      decideSettingsChange({
        ...input,
        command: { ...command, definitionRef: { ...definitionRef, [field]: different } },
      }),
    ).toEqual({ kind: 'rejected', reason: 'definition_changed' })
  }
  for (const field of ['providerId', 'definitionId', 'version'] as const)
    expect(
      decideSettingsChange({ ...input, definition: { ...definition, [field]: 'other' } }),
    ).toEqual({ kind: 'rejected', reason: 'definition_changed' })
})
it('sets, clears and recognizes no-op without incrementing revision', () => {
  const set = decideSettingsChange(input)
  expect(set).toMatchObject({
    kind: 'changed',
    state: { revision: 1 },
    evaluation: { entries: [{ value: { kind: 'value', value: true } }] },
  })
  if (set.kind === 'rejected') throw new Error('expected set')
  const repeated = decideSettingsChange({
    ...input,
    state: set.state,
    command: { ...command, expectedRevision: 1 },
  })
  expect(repeated).toMatchObject({ kind: 'no_change', state: { revision: 1 } })
  expect(
    decideSettingsChange({
      ...input,
      state: set.state,
      command: { ...command, expectedRevision: 1, action: { kind: 'clear' } },
    }),
  ).toMatchObject({
    kind: 'changed',
    state: { revision: 2 },
    evaluation: { entries: [{ source: 'default' }] },
  })
})
it('refuses ungranted operations and outer locks', () => {
  expect(decideSettingsChange({ ...input, grants: [] })).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
  const locked = {
    ...state,
    sources: [
      {
        id: 'organization',
        values: [{ itemId: 'enabled', value: { kind: 'absent' }, locked: true }],
      },
      state.sources[1],
    ],
  }
  expect(decideSettingsChange({ ...input, state: locked })).toEqual({
    kind: 'rejected',
    reason: 'locked',
  })
})
it('counts raw changes even when a more specific assignment masks them', () => {
  const current = {
    revision: 0,
    sources: [
      state.sources[0],
      {
        id: 'tenant',
        values: [{ itemId: 'enabled', value: { kind: 'value', value: false }, locked: false }],
      },
    ],
  }
  const result = decideSettingsChange({
    ...input,
    state: current,
    grants: [{ sourceId: 'organization', actions: ['set'] }],
    command: { ...command, sourceId: 'organization' },
  })
  expect(result).toMatchObject({
    kind: 'changed',
    state: { revision: 1 },
    evaluation: { entries: [{ value: { kind: 'value', value: false }, source: 'tenant' }] },
  })
})
it('returns bounded failures for cycles and large graphs', () => {
  const cyclic: Record<string, unknown> = {}
  cyclic['cycle'] = cyclic
  expect(decideSettingsChange(cyclic)).toEqual({ kind: 'rejected', reason: 'limit_exceeded' })
  expect(
    decideSettingsChange({
      ...input,
      command: { ...command, action: { kind: 'set', value: 'x'.repeat(1024 * 1024) } },
    }),
  ).toEqual({ kind: 'rejected', reason: 'limit_exceeded' })
})

it('accepts opaque legal identity references without treating text as authorization', () => {
  const scopeRef = '{"organization":"org-1","account":"account-1"}'
  expect(
    decideSettingsChange({
      ...input,
      command: { ...command, target: { ...command.target, scopeRef } },
    }),
  ).toMatchObject({ kind: 'changed' })
})

it('refuses revision exhaustion without breaking no-op recovery', () => {
  const revision = Number.MAX_SAFE_INTEGER - 1
  const exhausted = {
    ...input,
    state: { ...state, revision },
    command: { ...command, expectedRevision: revision },
  }
  expect(decideSettingsChange(exhausted)).toEqual({ kind: 'rejected', reason: 'limit_exceeded' })
  expect(
    decideSettingsChange({
      ...exhausted,
      command: { ...exhausted.command, action: { kind: 'clear' } },
    }),
  ).toMatchObject({ kind: 'no_change', state: { revision } })
})
