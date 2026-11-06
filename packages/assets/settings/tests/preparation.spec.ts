import { describe, expect, it } from 'vitest'
import {
  SettingsAbortedOperationSchema,
  SettingsCancelChangeSchema,
  SettingsPreparedCommitSchema,
  SettingsPreparationRefSchema,
} from '../src/index.ts'

const operation = {
  target: { policyId: 'catalog', targetRef: 'target', scopeRef: 'tenant' },
  operationId: 'original-operation',
}
const preparation = {
  protocol: 'settings-preparation/1',
  operation,
  attemptId: 'attempt-1',
  commandDigest: 'a'.repeat(64),
}

describe('Settings preparation protocol', () => {
  it('preserves the exact original operation and attempt across transport', () => {
    const command = { requestId: 'transport-2', preparation }
    expect(SettingsPreparedCommitSchema.parse(JSON.parse(JSON.stringify(command)))).toEqual(command)
    expect(SettingsCancelChangeSchema.parse({ requestId: 'cancel-1', operation })).toEqual({
      requestId: 'cancel-1',
      operation,
    })
  })

  it.each([
    { ...preparation, protocol: 'settings-preparation/2' },
    { ...preparation, attemptId: '' },
    { ...preparation, commandDigest: 'a'.repeat(63) },
    { ...preparation, commandDigest: 'g'.repeat(64) },
    { ...preparation, principalRef: 'another-principal' },
    { ...preparation, operation: { ...operation, principalRef: 'another-principal' } },
  ])('rejects unsupported or caller-authorized preparation data: %j', input => {
    expect(SettingsPreparationRefSchema.safeParse(input).success).toBe(false)
  })

  it('does not let commit carry a replacement command or selected SQL destination', () => {
    for (const extra of [
      { command: { action: { kind: 'set', value: 'replacement' } } },
      { destination: 'another-database' },
      { principal: 'admin' },
    ]) {
      expect(
        SettingsPreparedCommitSchema.safeParse({ requestId: 'r1', preparation, ...extra }).success,
      ).toBe(false)
    }
  })

  it('cannot serialize unavailable or a stale preparation as a root abort', () => {
    for (const reason of ['unavailable', 'basis_changed', 'closing', 'operation_conflict']) {
      expect(
        SettingsAbortedOperationSchema.safeParse({
          kind: 'aborted',
          operation,
          reason,
        }).success,
      ).toBe(false)
    }
    expect(
      SettingsAbortedOperationSchema.parse({
        kind: 'aborted',
        operation,
        reason: 'sealed',
      }),
    ).toEqual({ kind: 'aborted', operation, reason: 'sealed' })
  })
})
