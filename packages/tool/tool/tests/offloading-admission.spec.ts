import { expect, it } from 'vitest'
import {
  adoption,
  functionDefinition,
  harness,
  principalA,
  request,
  tenantA,
} from './runtime-values.ts'

function boundedTo(maxInlineUtf8Bytes: number) {
  const definition = functionDefinition()
  if (definition.kind !== 'function') throw new Error('fixture must define a function')
  return request({
    availability: {
      kind: 'available',
      definition: {
        ...definition,
        returns: {
          ...definition.returns,
          offloading: {
            inline: { kind: 'bounded', maxInlineUtf8Bytes },
            retention: { kind: 'system' },
          },
        },
      },
      executor: adoption('exec'),
      layer: { kind: 'official' },
    },
  })
}

it('rejects at admission a declaration whose header and preview cannot fit its threshold', async () => {
  const assembly = harness()
  const before = assembly.store.commits
  expect(
    await assembly.runtime.invoke({
      principal: principalA,
      tenant: tenantA,
      request: boundedTo(1024),
    }),
  ).toEqual({
    kind: 'rejected',
    failure: {
      kind: 'invalid',
      field: 'request.returns.offloading',
      reason: 'header-and-preview-exceed-threshold',
    },
  })
  expect(assembly.internalBindings).toEqual([])
  expect(assembly.store.commits).toBe(before)
})

it('admits a declaration whose header and preview fit its threshold', async () => {
  const assembly = harness()
  const outcome = await assembly.runtime.invoke({
    principal: principalA,
    tenant: tenantA,
    request: boundedTo(2048),
  })
  expect(outcome.kind).toBe('accepted')
})
