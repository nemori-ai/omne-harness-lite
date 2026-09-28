import { expect, test } from 'vitest'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { ownOpenCallInput } from '../src/service-calls.ts'
import type { OpenCallInput, SessionRuntimeBinding } from '../src/service-types.ts'

const session = unwrap(parseOpaqueIdentifier('session_open_call', 'SessionRef'))
const host = {} as SessionRuntimeBinding

function request(change: Partial<OpenCallInput> = {}): OpenCallInput {
  return {
    session,
    target: 'model_a',
    basis: {
      routeName: 'model_a',
      profile: { origin: 'official', routeName: 'model_a' },
      selectedBy: 'session',
      selected: 'model_a',
    },
    parameters: { extra: { attemptTag: 'first' } },
    messages: [],
    tools: [],
    host,
    ...change,
  }
}

test('captures an owned complete request before a provider read', () => {
  const source = request()
  const result = ownOpenCallInput(source)
  if (!('request' in result)) throw new Error('valid request rejected')
  const owned = result.request
  expect(owned).not.toBe(source)
  expect(owned.basis).not.toBe(source.basis)
  expect(owned.parameters).not.toBe(source.parameters)
  expect(owned.messages).not.toBe(source.messages)
  expect(owned.tools).not.toBe(source.tools)
  const parameters = source.parameters
  if (parameters?.extra === undefined) throw new Error('parameters absent')
  parameters.extra.attemptTag = 'later'
  expect(owned.parameters?.extra?.attemptTag).toBe('first')
})

test('rejects changed target without provenance, mismatched basis, and incomplete Run identity', () => {
  expect(ownOpenCallInput(request({ target: 'model_b' }))).toEqual({
    invalidInput: { reason: 'malformed' },
  })
  expect(
    ownOpenCallInput(
      request({
        basis: {
          routeName: 'model_a',
          profile: { origin: 'official', routeName: 'model_b' },
          selectedBy: 'session',
          selected: 'model_a',
        },
      }),
    ),
  ).toEqual({ invalidInput: { reason: 'malformed' } })
  const incomplete = { ...request(), run: 'run_a', attempt: 1 }
  expect(ownOpenCallInput(incomplete as OpenCallInput)).toEqual({
    invalidInput: { reason: 'malformed' },
  })
})
