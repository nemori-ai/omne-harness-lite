import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import type {
  ConsumerClass,
  RuntimeContextOperations,
} from '@omne-harness/runtime-context-contract'
import {
  RUNTIME_CONTEXT_OBLIGATIONS,
  runConformanceCase,
  runtimeContextConformance,
} from '@omne-harness/runtime-context-contract/testing'
import type { RuntimeContextPorts } from '@omne-harness/runtime-context-contract/testing'
import { runtimeContextKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import type { RuntimeContextService } from '@omne-harness/runtime-context-cordis-contract/cordis'
import { RuntimeContextProvider } from '@omne-harness/runtime-context-cordis/cordis'
import { tenantA, tenantB, trustOf } from './support.js'

// The whole contract suite on real Cordis 4.0.4: a fresh Context with a trust provider that hands
// over the suite's ports, and the product provider plugin. `bind` goes through an intercepted
// context whose consumer class is the one the eligibility was issued for. That only routes the
// assembly fact a real consumer plugin would declare; it adds no product behavior.

const CONSUMERS: readonly ConsumerClass[] = ['model', 'tool', 'extension', 'coordinator']
const closers = new WeakMap<object, () => Promise<void>>()

async function subject(
  ports: RuntimeContextPorts<unknown>,
): Promise<RuntimeContextOperations<unknown>> {
  const ctx = new Context()
  await ctx.plugin(trustOf(ports))
  const fiber = await ctx.plugin(RuntimeContextProvider, { retention: 64, replayCapacity: 8 })
  const service = ctx.get(runtimeContextKey)
  if (!service) throw new Error('The provider did not load')
  // Services seen from contexts that declare each consumer class, captured while loaded.
  const declared = new Map<ConsumerClass, RuntimeContextService<unknown>>()
  for (const consumer of CONSUMERS) {
    const seen = ctx.intercept(runtimeContextKey, { consumer }).get(runtimeContextKey)
    if (seen) declared.set(consumer, seen)
  }
  const consumers = new Map<string, ConsumerClass>()
  const operations: RuntimeContextOperations<unknown> = {
    registerProducer: (principal, registration) =>
      service.registerProducer(principal, registration),
    prepareRegistration: (...args) => service.prepareRegistration(...args),
    issueEligibility: async (principal, material) => {
      const issued = await service.issueEligibility(principal, material)
      if (issued.kind === 'issued')
        consumers.set(issued.eligibility.id.eligibility, material.consumer)
      return issued
    },
    revokeEligibility: (...args) => service.revokeEligibility(...args),
    applyCommit: (...args) => service.applyCommit(...args),
    beginReplay: (...args) => service.beginReplay(...args),
    finishReplay: (...args) => service.finishReplay(...args),
    bind: id => {
      const consumer = consumers.get(id.eligibility) ?? 'model'
      const caller = declared.get(consumer)
      if (!caller) throw new Error(`No context declares ${consumer}`)
      return caller.bind(id)
    },
  }
  closers.set(operations, async () => {
    await fiber.dispose()
  })
  return operations
}

const fixture = {
  tenant: tenantA,
  otherTenant: tenantB,
  principal: 'suite' as unknown,
  retention: 64,
  replayCapacity: 8,
  subject,
  close: async (s: object) => {
    await closers.get(s)?.()
  },
}

const cases = runtimeContextConformance<unknown>()

it('runs every contract obligation through the Cordis service', () => {
  expect(cases.map(c => c.name)).toEqual([...RUNTIME_CONTEXT_OBLIGATIONS])
})

for (const c of cases)
  it(c.name, async () => {
    expect(await runConformanceCase(c, fixture)).toEqual({ kind: 'passed' })
  })
