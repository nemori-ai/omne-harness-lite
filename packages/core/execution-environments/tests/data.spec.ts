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
