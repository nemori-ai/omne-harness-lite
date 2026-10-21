import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import type { AcquisitionState, Rejected } from '@omne-harness/execution-environment-contract'
import {
  ExecutionEnvironmentService,
  executionEnvironmentKey,
} from '@omne-harness/execution-environment-cordis-contract/cordis'

it('writes the service key once, on the abstract Service', () => {
  expect(executionEnvironmentKey).toBe('executionEnvironment')
  expect(ExecutionEnvironmentService.provide).toBe(executionEnvironmentKey)
})

it('exports only the abstract Service and its key', async () => {
  const cordis: Record<string, unknown> =
    await import('@omne-harness/execution-environment-cordis-contract/cordis')
  expect(Object.keys(cordis).sort()).toEqual([
    'ExecutionEnvironmentService',
    'executionEnvironmentKey',
  ])
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
