import { expect, test } from 'vitest'
import {
  attemptStartedPayload,
  checkAttemptStarted,
  checkOperationRef,
  operationRefEquals,
  readAttemptStarted,
} from '@omne-harness-lite/session-runtime'
import { checkAppendInput, checkSourceToken } from '@omne-harness-lite/session-log'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'

const fact = {
  kind: 'attempt_started',
  run: 'run-a',
  attempt: 1,
  reason: 'first',
  at: '2026-10-07T00:00:00Z',
} as const
const tenant = { organization: 'organization-a', account: 'account-a' }
function checkedFact() {
  const checked = checkAttemptStarted(fact)
  if ('failure' in checked) throw new Error('bad test fact')
  return checked.fact
}
test('attempt starts are owner facts, never a message envelope, and are copied at the boundary', () => {
  const payload = attemptStartedPayload(checkedFact())
  expect(payload).toEqual({ owner: 'session-runtime', version: '1', kind: 'fact', value: fact })
  const entry = checkAppendInput(
    'session-a',
    [{ tenant, run: 'run-a', attempt: 1, readKeys: [], payload }],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  if ('failure' in entry || entry.ok.entries[0] === undefined) throw new Error('bad test entry')
  const source = checkSourceToken({
    tenant,
    session: 'session-a',
    journalGeneration: 'generation-a',
    tail: 1,
  })
  if ('failure' in source) throw new Error('bad test token')
  const row = { ...entry.ok.entries[0], session: source.ok.session, position: 1 }
  expect(readAttemptStarted(row)).toEqual({ kind: 'fact', fact })
  expect(readAttemptStarted({ ...row, attempt: 2 })).toEqual({ failure: 'invalidInput' })
  expect(readAttemptStarted({ ...row, payload: { ...payload, version: '2' } })).toEqual({
    failure: 'invalidInput',
  })
})
test.each([
  { ...fact, attempt: 0 },
  { ...fact, attempt: 0.5 },
  { ...fact, reason: 'trigger' },
  { ...fact, run: '' },
  { ...fact, at: 'invalid' },
  { ...fact, message: 'internal' },
])('malformed attempt facts are rejected: %j', input => {
  expect(checkAttemptStarted(input)).toEqual({ failure: 'invalidInput' })
})
test('attempt sequences retain exact integers above Number safety', () => {
  expect(
    checkAttemptStarted({ ...fact, attempt: new LosslessNumber('9007199254740993') }),
  ).toHaveProperty('kind', 'fact')
})
test('receipt identity includes principal, operation and explicit Session, not just operationKey', () => {
  const input = {
    tenant,
    principal: 'principal-a',
    operation: 'createSession',
    operationKey: 'key-a',
    session: null,
  }
  const checked = checkOperationRef(input)
  if ('failure' in checked) throw new Error('bad test operation')
  expect(Object.isFrozen(checked.operation)).toBe(true)
  input.principal = 'principal-b'
  expect(checked.operation.principal).toBe('principal-a')
  expect(
    operationRefEquals(checked.operation, { ...checked.operation, principal: 'principal-b' }),
  ).toBe(false)
  expect(checkOperationRef({ ...input, operation: 'submitInput' })).toEqual({
    failure: 'invalidInput',
  })
  expect(checkOperationRef({ ...input, session: 'session-a' })).toEqual({ failure: 'invalidInput' })
})
test('no caller accessor is executed while checking receipt identity or attempt facts', () => {
  let reads = 0
  expect(
    checkOperationRef({
      get tenant() {
        reads++
        throw new Error('untrusted')
      },
    }),
  ).toEqual({ failure: 'invalidInput' })
  expect(
    checkAttemptStarted({
      get run() {
        reads++
        throw new Error('untrusted')
      },
    }),
  ).toEqual({ failure: 'invalidInput' })
  expect(reads).toBe(0)
})

test('operation and start reason are strings, never objects coerced into policy names', () => {
  expect(
    checkOperationRef({
      tenant,
      principal: 'principal-a',
      operation: { toString: null },
      operationKey: 'key-a',
      session: null,
    }),
  ).toEqual({ failure: 'invalidInput' })
  expect(checkAttemptStarted({ ...fact, reason: { toString: null } })).toEqual({
    failure: 'invalidInput',
  })
})
