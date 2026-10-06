import { expect, test } from 'vitest'
import { captureEnvironmentAdoption } from '../src/index.ts'

function adoption() {
  const scope = { tenant: { organization: 'org', account: 'alice' }, session: 'session' }
  return {
    placement: {
      scope,
      tool: { name: 'shell', definition: 'original' },
      execution: 'call',
      requirement: { bindingLayer: 'stateless_sandbox', facilities: ['command', 'files'] },
      permission: 'always-allow',
      revision: 'input/policy',
      evidence: { input: 'one' },
    },
    source: { name: 'current-tools', generation: 'original' },
    description: {
      reference: { provider: 'sandbox', reference: { instance: 'one' } },
      bindingLayer: 'stateless_sandbox',
      binding: { kind: 'stateless_sandbox', scope, execution: 'call' },
      facilities: ['command', 'files'],
      instance: { id: 'one', generation: 'original' },
      continuity: { kind: 'notGuaranteed' },
    },
    providerEvidence: { nonce: 'original' },
  }
}

test('adoption captures owned data for the original call and complete facility requirement', () => {
  const original = adoption(),
    expected = structuredClone(original)
  const captured = captureEnvironmentAdoption(original)
  expect(captured).toEqual(expected)
  original.placement.evidence.input = 'changed'
  original.description.reference.reference.instance = 'changed'
  original.providerEvidence.nonce = 'changed'
  original.source.generation = 'changed'
  expect(captured).toEqual(expected)
})
test.each([
  (v: ReturnType<typeof adoption>) => ({ ...v, providerEvidence: undefined }),
  (v: ReturnType<typeof adoption>) => ({ ...v, extra: true }),
  (v: ReturnType<typeof adoption>) => ({ ...v, placement: undefined }),
  (v: ReturnType<typeof adoption>) => ({ ...v, source: {} }),
  (v: ReturnType<typeof adoption>) => ({ ...v, source: { name: '', generation: 'one' } }),
  (v: ReturnType<typeof adoption>) => ({ ...v, source: { name: 'one', generation: '' } }),
  (v: ReturnType<typeof adoption>) => ({ ...v, source: { ...v.source, extra: true } }),
  (v: ReturnType<typeof adoption>) => ({ ...v, description: undefined }),
  (v: ReturnType<typeof adoption>) => ({
    ...v,
    description: { ...v.description, facilities: ['command'] },
  }),
  (v: ReturnType<typeof adoption>) => ({
    ...v,
    description: { ...v.description, binding: { ...v.description.binding, execution: 'other' } },
  }),
  (v: ReturnType<typeof adoption>) => ({
    ...v,
    description: {
      ...v.description,
      binding: { ...v.description.binding, scope: { ...v.placement.scope, session: 'other' } },
    },
  }),
  (v: ReturnType<typeof adoption>) => ({
    ...v,
    description: {
      ...v.description,
      binding: {
        ...v.description.binding,
        scope: { ...v.placement.scope, tenant: { ...v.placement.scope.tenant, account: 'other' } },
      },
    },
  }),
])('invalid or unrelated adoption data is rejected (%#)', change => {
  expect(captureEnvironmentAdoption(change(adoption()))).toBeUndefined()
})
test('a never-allow placement cannot adopt host facilities, while explicit always-allow can', () => {
  const original = adoption()
  const host = {
    ...original,
    placement: {
      ...original.placement,
      requirement: { ...original.placement.requirement, bindingLayer: 'host_machine' },
    },
    description: {
      ...original.description,
      bindingLayer: 'host_machine',
      binding: { kind: 'host_machine' },
    },
  }
  expect(captureEnvironmentAdoption(host)).toEqual(host)
  expect(
    captureEnvironmentAdoption({
      ...host,
      placement: { ...host.placement, permission: 'never-allow' },
    }),
  ).toBeUndefined()
})
