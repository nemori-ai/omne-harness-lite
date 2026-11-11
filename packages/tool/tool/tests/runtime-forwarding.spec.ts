import { expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { createToolForwardRuntime } from '@omne-harness/tool'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import type { ToolForwardSource } from '@omne-harness/tool-contract/provider'
import { testAssembly } from './testing-values.ts'
import {
  callId,
  operationId,
  request,
  principalA,
  tenantA,
  instanceId,
  evidence,
} from './runtime-values.ts'

it('passes the complete original programmatic source to shared admission and resumes the same fixed request', async () => {
  const base = testAssembly()
  const fixed: FixedToolRequest = {
    ...request(),
    invocation: { kind: 'programmatic', source: evidence('original-program') },
  }
  if (fixed.availability.kind !== 'available') throw new Error('fixture unavailable')
  const bound = {
    call: callId('target'),
    admission: operationId('admit-target'),
    request: fixed,
    recovered: false,
  }
  const source: ToolForwardSource<typeof principalA> = {
    resolve: async () => ({ kind: 'bound', ...bound }),
    lookup: async () => succeed({ kind: 'bound', binding: { ...bound, recovered: true } }),
  }
  const seen: FixedToolRequest[] = []
  const runtime = createToolForwardRuntime(
    {
      ...base.dependencies,
      admissions: {
        admit: async input => {
          seen.push(input.request)
          return fail({ kind: 'commit-unknown', operation: input.operation })
        },
      },
    },
    source,
  )
  const parent = {
    principal: principalA,
    tenant: tenantA,
    call: callId('parent'),
    request: fixed,
    start: {
      kind: 'start' as const,
      operation: operationId('parent-start'),
      executor: fixed.availability.executor,
      execution: { tenant: tenantA, call: callId('parent'), instance: instanceId, generation: '1' },
    },
  }
  if (fixed.availability.kind !== 'available') throw new Error('fixture unavailable')
  const { invocation: _, ...target } = fixed
  const first = await runtime.invoke({
    ...parent,
    target,
    intent: {
      name: fixed.availability.definition.name,
      command: null,
      arguments: { kind: 'object', entries: [] },
    },
  })
  expect(first.kind).toBe('commit-unknown')
  if (first.kind !== 'commit-unknown') throw new Error('expected fixed reference')
  expect(
    await runtime.resume({ principal: principalA, tenant: tenantA, reference: first.reference }),
  ).toEqual(first)
  expect(seen).toEqual([fixed, fixed])
  expect(base.source.bindings()).toHaveLength(0)
})
it('never admits when the original association is unresolved', async () => {
  const base = testAssembly()
  let admissions = 0
  const source: ToolForwardSource<typeof principalA> = {
    resolve: async () => ({ kind: 'association-unknown' }),
    lookup: async () => succeed({ kind: 'unresolved' }),
  }
  const runtime = createToolForwardRuntime(
    {
      ...base.dependencies,
      admissions: {
        admit: async input => {
          admissions++
          return fail({ kind: 'commit-unknown', operation: input.operation })
        },
      },
    },
    source,
  )
  const fixed: FixedToolRequest = {
    ...request(),
    invocation: { kind: 'direct', source: evidence('parent') },
  }
  if (fixed.availability.kind !== 'available') throw new Error('fixture unavailable')
  const { invocation: _, ...target } = fixed
  expect(
    await runtime.invoke({
      principal: principalA,
      tenant: tenantA,
      call: callId('parent'),
      request: fixed,
      start: {
        kind: 'start',
        operation: operationId('parent-start'),
        executor: fixed.availability.executor,
        execution: {
          tenant: tenantA,
          call: callId('parent'),
          instance: instanceId,
          generation: '1',
        },
      },
      target,
      intent: { name: 'target', command: null, arguments: { kind: 'null' } },
    }),
  ).toEqual({ kind: 'association-unknown' })
  expect(admissions).toBe(0)
})
