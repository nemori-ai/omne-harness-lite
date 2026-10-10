import { expect, test } from 'vitest'
import { checkSessionFact, sessionFactPayload, readSessionFact } from '../src/lifecycle-facts.ts'
import { readAttemptStarted } from '@omne-harness-lite/session-runtime'
import type { SessionFact } from '../src/lifecycle-facts.ts'
import { checkOperationRef } from '../src/operation.ts'
import { checkAppendInput, checkSourceToken } from '@omne-harness-lite/session-log'

const tenant = { organization: 'team', account: 'owner' }
const scope = checkSourceToken({ tenant, session: 'session', journalGeneration: 'test', tail: 1 })
if ('failure' in scope) throw new Error('bad scope')
const creation = checkOperationRef({
  tenant,
  principal: 'owner',
  operation: 'createSession',
  operationKey: 'create',
  session: null,
})
const input = checkOperationRef({
  tenant,
  principal: 'owner',
  operation: 'submitInput',
  operationKey: 'input',
  session: scope.ok.session,
})
if ('failure' in creation || 'failure' in input) throw new Error('bad operation')
const at = '2026-10-08T00:00:00Z'
const facts: readonly SessionFact[] = [
  {
    kind: 'session_created',
    operation: creation.operation,
    definition: { category: 'agent_definition', name: 'agent' },
    executionType: 'main',
    mode: 'auto_permission',
    collaboration: 'co-work',
    workspace: null,
    at,
  },
  {
    kind: 'input_accepted',
    operation: input.operation,
    semanticDigest: 'semantic',
    messagePosition: 2,
    at,
  },
  { kind: 'run_started', run: 'run' as never, inputPosition: 2, stepKey: 'start', at },
  {
    kind: 'input_adopted',
    run: 'run' as never,
    attempt: 1,
    inputPosition: 2,
    stepKey: 'adopt',
    at,
  },
  {
    kind: 'run_finished',
    run: 'run' as never,
    attempt: 1,
    terminal: 'completed',
    reason: 'no actions remain',
    stepKey: 'finish',
    at,
  },
  {
    kind: 'call_prepared',
    run: 'run' as never,
    attempt: 1,
    call: 'call',
    originalPosition: 'loop-position',
    stepKey: 'prepare',
    at,
  },
  {
    kind: 'result_custodied',
    run: 'run',
    attempt: 1,
    call: 'call',
    resultKey: 'original-result',
    semanticDigest: 'a'.repeat(64),
    at,
  },
]
for (const fact of facts)
  test('encodes and reads the owned ' + fact.kind + ' as a fact, never a model message', () => {
    expect(checkSessionFact(fact)).toEqual({ kind: 'fact', fact })
    const payload = sessionFactPayload(fact)
    expect(payload).toMatchObject({
      owner: 'session-runtime',
      version: '1',
      kind: 'fact',
      value: fact,
    })
    const metadata = 'attempt' in fact ? { run: fact.run, attempt: fact.attempt } : {}
    const request = checkAppendInput(
      scope.ok.session,
      [{ tenant, ...metadata, readKeys: [], payload }],
      { kind: 'unfenced' },
      { kind: 'unconditional' },
    )
    if ('failure' in request || !request.ok.entries[0]) throw new Error('bad entry')
    const entry = { ...request.ok.entries[0], session: scope.ok.session, position: 3 }
    expect(readSessionFact(entry)).toEqual({ kind: 'fact', fact })
    expect(readAttemptStarted(entry)).toEqual({ kind: 'other' })
    expect(readAttemptStarted({ ...entry, payload: { ...payload, version: 'unknown' } })).toEqual({
      failure: 'invalidInput',
    })
    expect(
      readSessionFact({ ...entry, tenant: { organization: 'other', account: 'owner' } as never }),
    ).toEqual('operation' in fact ? { failure: 'invalidInput' } : { kind: 'fact', fact })
    if ('run' in fact)
      expect(readSessionFact({ ...entry, run: 'different' as never })).toEqual({
        failure: 'invalidInput',
      })
  })
test.each([
  { ...facts[0], extra: true },
  { ...facts[0], mode: 'unsafe' },
  { ...facts[0], definition: { category: 'tool', name: 'agent' } },
  { ...facts[1], operation: creation.operation },
  { ...facts[1], messagePosition: 0 },
  { ...facts[2], at: 'invalid' },
  { ...facts[3], attempt: 0 },
  { ...facts[4], terminal: 'running' },
  { ...facts[5], call: '' },
  { ...facts[5], originalPosition: '' },
  { ...facts[5], attempt: 0 },
  { ...facts[6], semanticDigest: 'invalid' },
  { ...facts[6], resultKey: '' },
  { ...facts[6], attempt: 0 },
])('refuses malformed or inconsistent lifecycle facts: %j', value => {
  expect(checkSessionFact(value)).toEqual({ failure: 'invalidInput' })
})
test('does not execute getters from an untrusted fact', () => {
  let calls = 0
  expect(
    checkSessionFact({
      get kind() {
        calls++
        throw new Error('untrusted')
      },
    }),
  ).toEqual({ failure: 'invalidInput' })
  expect(calls).toBe(0)
})
