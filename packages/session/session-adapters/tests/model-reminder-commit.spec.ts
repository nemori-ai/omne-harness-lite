import { describe, expect, it } from 'vitest'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type { JournalCommitResult } from '../src/journal-commit.ts'
import {
  reminderCommand,
  reminderOutcome,
  reminderReadFailure,
} from '../src/cordis/model-reminder-commit.ts'
import { memoryAccess } from '@omne-harness/session-contract/testing'

const rolledBack = (failure: unknown): JournalCommitResult =>
  ({
    kind: 'rolled-back',
    receipt: {
      responses: [
        { participant: 'session', protocol: '2', reply: { kind: 'conflict', basis: { failure } } },
      ],
    },
  }) as never

describe('the reminder commit answers', () => {
  it('committed is told; a Session that moved on is read again', () => {
    expect(reminderOutcome({ kind: 'committed', receipt: {} as never, recalled: false })).toBe(
      'told',
    )
    expect(reminderOutcome(rolledBack({ kind: 'changed', revision: '5' }))).toBe('changed')
  })

  it('any other refusal, an unknown answer and an unavailable storage are failures', () => {
    expect(reminderOutcome(rolledBack({ kind: 'archived' }))).toMatchObject({
      kind: 'unavailable',
      diagnostic: 'the Session refused the runtime context reminder',
    })
    expect(
      reminderOutcome({ kind: 'rolled-back', receipt: { responses: [] } as never }),
    ).toMatchObject({ kind: 'unavailable' })
    expect(reminderOutcome({ kind: 'unknown', diagnostic: 'lost', attempt: 1 })).toMatchObject({
      kind: 'unavailable',
      diagnostic: 'the runtime context reminder: lost',
    })
    expect(reminderOutcome({ kind: 'unavailable', diagnostic: 'down' })).toMatchObject({
      kind: 'unavailable',
      diagnostic: 'the runtime context reminder: down',
    })
    expect(
      reminderOutcome({ kind: 'refused', reason: 'invalid_request' as never, diagnostic: 'no' }),
    ).not.toBe('told')
  })

  it('a denied read is denied; another read failure is unavailable with its diagnostic', () => {
    expect(reminderReadFailure({ kind: 'denied' })).toEqual({
      kind: 'denied',
      action: 'read-runtime-context',
    })
    expect(reminderReadFailure({ kind: 'unavailable', diagnostic: 'gone' })).toMatchObject({
      kind: 'unavailable',
      diagnostic: 'gone',
    })
  })

  it('names the reminder by the scope, the view and the Session revision it was read for', () => {
    const access = memoryAccess('tester', 'reminder-command')
    const message = {
      id: 'msg_reminder' as never,
      role: 'system_reminder' as const,
      blocks: [],
    }
    const scope = { ref: 'session-scope:1' } as ScopeRef
    const at = (revision: string, view = '3') =>
      reminderCommand({
        tenant: access.tenant,
        session: access.session,
        scope,
        at: revision as never,
        viewRevision: view,
        message,
      })
    const first = at('7')
    expect(first.input).toMatchObject({
      expected: '7',
      value: { kind: 'context-reminder', message, source: { revision: '3' } },
    })
    expect(at('7').input.operation).toBe(first.input.operation)
    expect(at('8').input.operation).not.toBe(first.input.operation)
    expect(at('7', '4').input.operation).not.toBe(first.input.operation)
  })
})
