import { describe, expect, it } from 'vitest'
import { isStandingBinding } from '@omne-harness/identity'
import { canonical } from '../src/encoding.ts'
import {
  decodeSettingsRecoveryReference,
  encodeSettingsRecoveryReference,
  settingsRecoveryKey,
  type SettingsRecoveryIdentity,
  type SettingsRecoveryReference,
} from '../src/recovery-reference.ts'

const target = { policyId: 'catalog', targetRef: 'example', scopeRef: 'tenant/one' }
const capture: SettingsRecoveryReference = {
  version: 'settings-recovery/1',
  kind: 'capture',
  target,
}
const attempt: SettingsRecoveryReference = {
  version: 'settings-recovery/1',
  kind: 'attempt',
  target,
  rootOperationId: 'root-1',
  rootCommandDigest: 'a'.repeat(64),
  commandKind: 'change',
}

describe('Settings recovery references', () => {
  it.each<SettingsRecoveryReference>([capture, attempt, { ...attempt, commandKind: 'rebase' }])(
    'round trips the exact $kind reference',
    reference => {
      const encoded = canonical(reference)
      expect(decodeSettingsRecoveryReference(encoded)).toEqual(reference)
      expect(encodeSettingsRecoveryReference(reference)).toBe(encoded)
      expect(
        isStandingBinding({
          version: 'standing/1',
          owner: 'settings',
          operationId: 'same-exact-id',
          principalRef: 'principal',
          destination: 'settings',
          scopeRef: 'tenant/one',
          targetRef: encoded,
          inputDigest: 'b'.repeat(64),
        }),
      ).toBe(true)
    },
  )

  it.each([
    target,
    { ...capture, version: 'settings-recovery/2' },
    { ...capture, kind: 'change' },
    { ...capture, domain: { scope: { kind: 'system' }, transactionDomain: 'settings' } },
    { ...capture, rootOperationId: 'unexpected' },
    { ...attempt, rootCommandDigest: 'short' },
    { ...attempt, rootOperationId: '' },
    { ...attempt, commandKind: 'capture' },
    { ...attempt, sourceUpdate: true },
  ])('rejects unversioned, malformed or caller-selected routes %#', reference => {
    expect(decodeSettingsRecoveryReference(canonical(reference))).toBeUndefined()
  })

  it.each([
    undefined,
    12,
    '',
    '{',
    JSON.stringify(capture, null, 2),
    `${canonical(capture)} `,
    `{"kind":"attempt",${canonical(capture).slice(1)}`,
  ])('rejects invalid and noncanonical input %#', reference => {
    expect(decodeSettingsRecoveryReference(reference)).toBeUndefined()
  })

  it('bounds UTF-8 bytes to the Identity routing limit', () => {
    const oversized = {
      ...capture,
      target: { ...target, scopeRef: '界'.repeat(4096), targetRef: '界'.repeat(4096) },
    }
    expect(canonical(oversized).length).toBeLessThan(16384)
    expect(Buffer.byteLength(canonical(oversized))).toBeGreaterThan(16384)
    expect(encodeSettingsRecoveryReference(oversized)).toBeUndefined()
    expect(decodeSettingsRecoveryReference(canonical(oversized))).toBeUndefined()
  })

  it('accepts the byte limit and rejects its adjacent value', () => {
    const base = { ...capture, target: { ...target, scopeRef: '界'.repeat(4096) } }
    const room = 16384 - Buffer.byteLength(canonical(base))
    const exact = { ...base, target: { ...base.target, targetRef: 'example' + 'x'.repeat(room) } }
    expect(Buffer.byteLength(canonical(exact))).toBe(16384)
    expect(decodeSettingsRecoveryReference(encodeSettingsRecoveryReference(exact))).toEqual(exact)
    const over = { ...exact, target: { ...exact.target, targetRef: exact.target.targetRef + 'x' } }
    expect(encodeSettingsRecoveryReference(over)).toBeUndefined()
    expect(decodeSettingsRecoveryReference(canonical(over))).toBeUndefined()
  })
})

describe('exact recovery identities', () => {
  const identity: SettingsRecoveryIdentity = {
    domain: { scope: { kind: 'tenant', tenant: 'tenant/one' }, transactionDomain: 'settings' },
    principalRef: 'principal',
    kind: 'capture',
    operationId: 'same-exact-id',
  }

  it.each<SettingsRecoveryIdentity>([
    { ...identity, kind: 'attempt' },
    { ...identity, principalRef: 'other-principal' },
    { ...identity, operationId: 'next-attempt' },
    { ...identity, domain: { ...identity.domain, transactionDomain: 'other-domain' } },
    {
      ...identity,
      domain: { ...identity.domain, scope: { kind: 'tenant', tenant: 'tenant/two' } },
    },
    { ...identity, domain: { ...identity.domain, scope: { kind: 'system' } } },
  ])('partitions each component of the exact identity %#', other => {
    expect(settingsRecoveryKey(other)).not.toBe(settingsRecoveryKey(identity))
  })

  it('retains the same key across serialization and object property order', () => {
    expect(
      settingsRecoveryKey({
        operationId: identity.operationId,
        kind: identity.kind,
        principalRef: identity.principalRef,
        domain: { transactionDomain: 'settings', scope: { tenant: 'tenant/one', kind: 'tenant' } },
      }),
    ).toBe(settingsRecoveryKey(identity))
  })
})
