import { expect, it } from 'vitest'
import { parseSessionHostRequest } from '../src/session-host-protocol.ts'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'

const binding = {
  formatVersion: 1,
  centerId: 'a'.repeat(32),
  tenant: { organization: 'team', account: 'owner' },
}
const request = {
  format: 'omne-session-host/1',
  binding,
  command: 'createSession',
  input: {
    operationKey: 'original-create',
    definition: { category: 'agent_definition', name: 'selected' },
    executionType: 'interactive',
    mode: 'never',
    collaboration: 'co-work',
  },
}
it('accepts exact original creation data and normalizes only the exact binding version', () => {
  const wire = readJsonStrict(JSON.stringify(request))
  if ('failed' in wire) throw new Error('fixture syntax failed')
  expect(parseSessionHostRequest(wire.ok)).toEqual(request)
  const parsed = parseSessionHostRequest(wire.ok)
  expect(Object.isFrozen(parsed)).toBe(true)
  expect(Object.isFrozen(parsed?.binding)).toBe(true)
})
it.each([
  { ...request, access: {} },
  { ...request, format: 'unknown' },
  { ...request, binding: { ...binding, centerId: 'fake' } },
  { ...request, binding: { ...binding, formatVersion: 1.5 } },
  { ...request, binding: { ...binding, principal: 'other' } },
  { ...request, input: { ...request.input, permit: {} } },
  { ...request, input: { ...request.input, mode: 'invented' } },
  { ...request, input: { ...request.input, operationKey: '' } },
])('refuses closed-shape and authority injection counterexample %#', value => {
  expect(parseSessionHostRequest(value)).toBeUndefined()
})
it('does not execute accessors or toJSON when parsing a public request', () => {
  let reads = 0
  const value = Object.create(null, {
    format: {
      enumerable: true,
      get() {
        reads++
        return request.format
      },
    },
  })
  expect(parseSessionHostRequest(value)).toBeUndefined()
  expect(
    parseSessionHostRequest({
      ...request,
      toJSON() {
        reads++
        return request
      },
    }),
  ).toBeUndefined()
  expect(reads).toBe(0)
})
it('accepts only user messages, and never interprets a fact as a submission', () => {
  const common = {
    format: request.format,
    binding,
    command: 'submitInput',
    session: 'original-session',
    operationKey: 'original-submit',
  }
  expect(
    parseSessionHostRequest({
      ...common,
      message: { kind: 'attempt_started', run: 'r', attempt: 1 },
    }),
  ).toBeUndefined()
  expect(
    parseSessionHostRequest({
      ...common,
      message: {
        type: 'assistant',
        id: 'model',
        response: 'response',
        ending: 'complete',
        createdAt: '2026-10-08T00:00:00Z',
        blocks: [],
      },
    }),
  ).toBeUndefined()
  expect(
    parseSessionHostRequest({
      ...common,
      message: {
        type: 'user',
        id: 'human',
        createdAt: '2026-10-08T00:00:00Z',
        blocks: [
          {
            id: 'human-block',
            kind: 'text',
            text: 'user input',
            visibility: { toHuman: true, toModel: true },
          },
        ],
      },
    }),
  ).toHaveProperty('operationKey', 'original-submit')
})
