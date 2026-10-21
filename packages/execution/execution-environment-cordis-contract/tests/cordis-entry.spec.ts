import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import {
  createRecoveryAccess,
  type AcquisitionState,
  type EnvironmentBinding,
  type Rejected,
} from '@omne-harness/execution-environment-contract'
import {
  ExecutionEnvironmentService,
  ExecutionRecoveryAuthorityService,
  executionEnvironmentKey,
  executionRecoveryAuthorityKey,
} from '@omne-harness/execution-environment-cordis-contract/cordis'

type ScopeText = Extract<EnvironmentBinding, { kind: 'session_sandbox' }>['scope']['ref']

function isScopeText(text: string): text is ScopeText {
  return text.length > 0
}

function scopeRef(text: string): ScopeText {
  if (!isScopeText(text)) throw new TypeError('empty scope')
  return text
}

it('writes the service key once, on the abstract Service', () => {
  expect(executionEnvironmentKey).toBe('executionEnvironment')
  expect(ExecutionEnvironmentService.provide).toBe(executionEnvironmentKey)
})

it('exports only the two abstract Services and their keys', async () => {
  const cordis: Record<string, unknown> =
    await import('@omne-harness/execution-environment-cordis-contract/cordis')
  expect(Object.keys(cordis).sort()).toEqual([
    'ExecutionEnvironmentService',
    'ExecutionRecoveryAuthorityService',
    'executionEnvironmentKey',
    'executionRecoveryAuthorityKey',
  ])
})

it('writes the recovery authority key once, on its abstract Service, and provides it from a loaded subclass', async () => {
  expect(executionRecoveryAuthorityKey).toBe('executionRecoveryAuthority')
  expect(ExecutionRecoveryAuthorityService.provide).toBe(executionRecoveryAuthorityKey)
  class Authority extends ExecutionRecoveryAuthorityService {
    async authorizeRecovery(): Promise<'notAuthorized'> {
      return 'notAuthorized'
    }
  }
  const ctx = new Context()
  const fiber = await ctx.plugin(Authority)
  const authority = ctx.get(executionRecoveryAuthorityKey)
  expect(authority).toBeInstanceOf(Authority)
  expect(
    await authority?.authorizeRecovery(createRecoveryAccess(), { ref: scopeRef('scope-1') }, []),
  ).toBe('notAuthorized')
  await fiber.dispose()
  expect(ctx.get(executionRecoveryAuthorityKey)).toBeUndefined()
})

it('registers a subclass under the key on the fiber that loads it and removes it on unload', async () => {
  const refused: Rejected = { kind: 'rejected', reason: 'unavailable' }
  const unrecorded: AcquisitionState = { kind: 'unrecorded' }
  class Probe extends ExecutionEnvironmentService<unknown> {
    async resolvePlacement() {
      return refused
    }
    async acquire() {
      return refused
    }
    async inspectAcquisition() {
      return unrecorded
    }
    async describe() {
      return []
    }
    async recoverOwned() {
      return refused
    }
    async releaseScope() {
      return refused
    }
    registerFacility() {
      return async () => undefined
    }
    registerProvider() {
      return async () => undefined
    }
  }
  const ctx = new Context()
  const fiber = await ctx.plugin(Probe)
  expect(ctx.get(executionEnvironmentKey)).toBeInstanceOf(Probe)
  await fiber.dispose()
  expect(ctx.get(executionEnvironmentKey)).toBeUndefined()
})
