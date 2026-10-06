import { expect, test } from 'vitest'
import {
  captureEnvironmentDescription,
  captureCommandRequest,
  captureEnvironmentFacilities,
  matchesEnvironmentRequirement,
  environmentBelongsTo,
  captureEnvironmentScope,
  captureEnvironmentCall,
} from '../src/index.ts'

const scope = captureEnvironmentScope({
  tenant: { organization: 'org', account: 'alice' },
  session: 'one',
})
if (!scope) throw new Error('scope invalid')
const call = captureEnvironmentCall({
    tool: { name: 'tool', definition: 'version' },
    execution: 'original',
  }),
  otherCall = captureEnvironmentCall({
    tool: { name: 'tool', definition: 'version' },
    execution: 'another',
  })
if (!call || !otherCall) throw new Error('call invalid')
const data = {
  reference: { provider: 'sandbox', reference: 'one' },
  bindingLayer: 'stateless_sandbox',
  binding: { kind: 'stateless_sandbox', scope, execution: 'original' },
  facilities: ['command', 'files'],
  instance: { id: 'one', generation: 'generation' },
  continuity: { kind: 'notGuaranteed' },
}

test('description shape, binding ownership and facility requirements are independent checks', () => {
  const description = captureEnvironmentDescription(data)
  if (!description) throw new Error('valid description rejected')
  expect(environmentBelongsTo(description, scope, call)).toBe(true)
  expect(environmentBelongsTo(description, scope, otherCall)).toBe(false)
  expect(
    matchesEnvironmentRequirement(description, {
      bindingLayer: 'stateless_sandbox',
      facilities: ['files', 'command'],
    }),
  ).toBe(true)
  expect(
    matchesEnvironmentRequirement(description, {
      bindingLayer: 'session_sandbox',
      facilities: ['files'],
    }),
  ).toBe(false)
  expect(
    matchesEnvironmentRequirement(description, {
      bindingLayer: 'stateless_sandbox',
      facilities: ['browser'],
    }),
  ).toBe(false)
  expect(
    captureEnvironmentDescription({ ...data, binding: { kind: 'host_machine' } }),
  ).toBeUndefined()
  expect(
    captureEnvironmentDescription({ ...data, continuity: { kind: 'continuous', data: 'one' } }),
  ).toBeUndefined()
  expect(captureEnvironmentFacilities({ description, command: { start() {} } })).toBeUndefined()
})

test('command data has explicit env, captures bytes/arrays, and never infers ambient data', () => {
  const input = {
    executable: 'echo',
    args: ['$HOME'],
    cwd: '/owned',
    env: { ONLY: 'one' },
    stdin: new Uint8Array([1]),
  }
  const captured = captureCommandRequest(input)
  input.args[0] = 'changed'
  input.env.ONLY = 'changed'
  input.stdin[0] = 9
  expect(captured).toEqual({
    executable: 'echo',
    args: ['$HOME'],
    cwd: '/owned',
    env: { ONLY: 'one' },
    stdin: new Uint8Array([1]),
  })
  expect(captureCommandRequest({ executable: 'echo', args: [], cwd: '/owned' })).toBeUndefined()
})

test('all four binding layers admit their own descriptions and enforce their declared ownership', () => {
  const cases = [
    { kind: 'host_machine' },
    { kind: 'stateless_sandbox', scope, execution: call.execution },
    { kind: 'session_sandbox', scope },
    { kind: 'tenant_sandbox', tenant: scope.tenant },
  ] as const
  const foreignTenant = captureEnvironmentScope({
    ...scope,
    tenant: { ...scope.tenant, account: 'bob' },
  })
  const foreignSession = captureEnvironmentScope({ ...scope, session: 'another' })
  if (!foreignTenant || !foreignSession) throw new Error('valid foreign fixture rejected')
  for (const binding of cases) {
    const description = captureEnvironmentDescription({
      ...data,
      bindingLayer: binding.kind,
      binding,
    })
    if (!description) throw new Error(`valid ${binding.kind} description rejected`)
    expect(environmentBelongsTo(description, scope, call)).toBe(true)
    expect(environmentBelongsTo(description, foreignTenant, call)).toBe(
      binding.kind === 'host_machine',
    )
    expect(environmentBelongsTo(description, foreignSession, call)).toBe(
      binding.kind === 'host_machine' || binding.kind === 'tenant_sandbox',
    )
    expect(environmentBelongsTo(description, scope, otherCall)).toBe(
      binding.kind !== 'stateless_sandbox',
    )
    expect(
      matchesEnvironmentRequirement(description, {
        bindingLayer: binding.kind,
        facilities: ['command', 'files'],
      }),
    ).toBe(true)
  }
})
