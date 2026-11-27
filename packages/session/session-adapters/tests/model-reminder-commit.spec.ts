import { describe, expect, it } from 'vitest'
import type { SystemReminderMessage } from '@omne-harness/message'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import { refusalFailure, type JournalCommitResult } from '../src/journal-commit.ts'
import {
  openContextScope,
  reminderCommand,
  reminderOutcome,
  reminderReadFailure,
} from '../src/cordis/model-reminder-commit.ts'
import { contextScopeOf } from '@omne-harness/session-contract'
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
    const refused = { reason: 'invalid_request' as never, said: 'invalid_request: no' }
    expect(reminderOutcome({ kind: 'refused', ...refused, diagnostic: 'no' })).toEqual(
      refusalFailure(refused),
    )
    expect(refusalFailure(refused)).toEqual({
      kind: 'invalid',
      field: 'storage',
      reason: 'invalid_request: no',
      disclosed: 'invalid_request: no',
    })
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
    const message: SystemReminderMessage = {
      id: 'msg_reminder' as never,
      role: 'system_reminder',
      blocks: [
        {
          kind: 'text',
          id: 'blk_reminder' as never,
          visibility: { toHuman: true, toModel: true },
          text: 'told',
        },
      ],
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

describe('the scope the model is told in', () => {
  const access = memoryAccess('tester', 'reminder-scope')
  const at = (contextScopes: unknown) =>
    openContextScope({
      tenant: access.tenant,
      session: access.session,
      snapshot: (contextScopes === undefined ? {} : { contextScopes }) as never,
    })
  const ended = { owner: 'test', record: 'ended', revision: '1', digest: 'd' }

  it('is the latest scope not ended, the first minted one without a record, and none when all ended', () => {
    expect(at(undefined)).toEqual({
      ref: contextScopeOf({ tenant: access.tenant, session: access.session, generation: '1' }),
    })
    expect(
      at([
        { generation: '1', scope: 'scope-1', operation: 'o1', ended: null },
        { generation: '2', scope: 'scope-2', operation: 'o2', ended: null },
      ]),
    ).toEqual({ ref: 'scope-2' })
    expect(
      at([
        { generation: '1', scope: 'scope-1', operation: 'o1', ended: null },
        { generation: '2', scope: 'scope-2', operation: 'o2', ended },
      ]),
    ).toEqual({ ref: 'scope-1' })
    expect(at([{ generation: '1', scope: 'scope-1', operation: 'o1', ended }])).toBeNull()
  })
})
