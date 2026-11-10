import { expect, it } from 'vitest'
import * as adapters from '../src/index.ts'
import {
  projectSessionPermissionMode,
  SESSION_PERMISSION_MODE_TRANSLATION,
  type SessionPermissionModeInput,
} from '../src/index.ts'
import type { Adoption, Modes } from '@omne-harness/session-contract'
import { decideInquiry } from '@omne-harness/authorization'

it('publishes the source-bound permission-mode projection', () => {
  expect(adapters).toHaveProperty('projectSessionPermissionMode')
})

const adoption: Adoption = {
  owner: 'entry',
  name: 'assistant/modes',
  revision: '1',
  digest: 'sha256:original',
}
const source = { owner: 'session', record: 'creation-1', revision: '1', digest: 'creation-digest' }
const defaultSource = {
  owner: 'entry',
  record: 'assistant/modes',
  revision: '1',
  digest: adoption.digest,
}
const modes: Modes = {
  permission: 'auto_permission',
  environment: adoption,
  collaboration: 'co-work',
}
const input: SessionPermissionModeInput = {
  adopted: { kind: 'tenant-default', source: adoption },
  creationSource: source,
  override: null,
  defaultMode: { kind: 'available', adoption, value: 'auto_permission', source: defaultSource },
}

it.each([
  ['never', 'deny'],
  ['auto_permission', 'ask-human'],
  ['bypass-permissions', 'skip-ask'],
] as const)(
  'projects %s with its committed source and translation version',
  (permission, onAsk) => {
    expect(
      projectSessionPermissionMode({
        ...input,
        adopted: { kind: 'explicit', value: { ...modes, permission } },
        defaultMode: { kind: 'unavailable' },
      }),
    ).toEqual({
      kind: 'projected',
      value: {
        policy: { onAsk },
        source,
        translation: SESSION_PERMISSION_MODE_TRANSLATION,
      },
    })
  },
)

it('uses the exact adopted default and retains its original evidence', () => {
  expect(projectSessionPermissionMode(input)).toEqual({
    kind: 'projected',
    value: {
      policy: { onAsk: 'ask-human' },
      source: defaultSource,
      translation: SESSION_PERMISSION_MODE_TRANSLATION,
    },
  })
})

it.each(['owner', 'name', 'revision', 'digest'] as const)(
  'rejects a default with a different %s',
  field => {
    expect(
      projectSessionPermissionMode({
        ...input,
        defaultMode: {
          kind: 'available',
          adoption: { ...adoption, [field]: 'different' },
          value: 'bypass-permissions',
          source: defaultSource,
        },
      }),
    ).toEqual({ kind: 'unavailable', reason: 'default-mode-mismatch' })
  },
)

it('does not invent an auto or bypass mode when the adopted default is unavailable', () => {
  expect(projectSessionPermissionMode({ ...input, defaultMode: { kind: 'unavailable' } })).toEqual({
    kind: 'unavailable',
    reason: 'default-mode-missing',
  })
})

it('uses an explicit override without requiring an unrelated default to remain available', () => {
  const changedSource = { ...source, record: 'changed-mode', revision: '3' }
  expect(
    projectSessionPermissionMode({
      ...input,
      defaultMode: { kind: 'unavailable' },
      override: { value: 'never', source: changedSource },
    }),
  ).toEqual({
    kind: 'projected',
    value: {
      policy: { onAsk: 'deny' },
      source: changedSource,
      translation: SESSION_PERMISSION_MODE_TRANSLATION,
    },
  })
})

it('captures the published evidence instead of retaining mutable caller state', () => {
  const changedSource = { ...source }
  const result = projectSessionPermissionMode({
    ...input,
    override: { value: 'never', source: changedSource },
  })
  changedSource.record = 'another-operation'
  expect(result).toMatchObject({ kind: 'projected', value: { source } })
  if (result.kind !== 'projected') throw new Error('not projected')
  expect(Object.isFrozen(result.value.policy)).toBe(true)
  expect(Object.isFrozen(result.value.source)).toBe(true)
})

it('never lets a projected bypass override a structural prohibition or missing basis', () => {
  for (const permission of ['never', 'auto_permission', 'bypass-permissions'] as const) {
    const result = projectSessionPermissionMode({
      ...input,
      override: { value: permission, source },
    })
    if (result.kind !== 'projected') throw new Error('not projected')
    expect(decideInquiry('prohibited', result.value.policy)).toBe('deny')
    expect(decideInquiry('unavailable', result.value.policy)).toBe('unavailable')
  }
})
