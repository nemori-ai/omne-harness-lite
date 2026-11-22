import { describe, expect, it } from 'vitest'
import type { Principal } from '@omne-harness/access-cordis-contract'
import type { JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { HistoryEntry, HistoryPage, RunId, SessionId } from '@omne-harness/session-contract'
import {
  failureCauseOf,
  runFailureCausesOf,
  type TerminalReader,
} from '../../../src/rows/session-access/causes.ts'

function tree(value: unknown): JsonValue {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(tree) }
  return {
    kind: 'object',
    entries: Object.entries(value as Record<string, unknown>).map(([key, item]) => ({
      key,
      value: tree(item),
    })),
  }
}

const terminal = (run: string, failure: unknown) =>
  ({
    id: `entry-${run}`,
    kind: 'run.terminal',
    payload: tree({
      terminal: { run, outcome: 'failed' },
      end: failure === undefined ? null : { conclusion: 'fail', failure },
    }),
  }) as unknown as HistoryEntry

const pageOf = (entries: readonly HistoryEntry[], next: string | null = null) =>
  succeed({ entries, next, exhausted: next === null } as unknown as HistoryPage)

const input = {
  principal: { kind: 'login-principal' } as unknown as Principal,
  tenant: { organization: 'o', account: 'a' } as unknown as TenantId,
  session: 'session-1' as SessionId,
  run: 'run-2' as RunId,
}

describe('failureCauseOf', () => {
  it('names the cause by the kind of the failure the terminal entry carries', () => {
    expect(failureCauseOf(tree({ kind: 'guard' }))).toEqual({ kind: 'guard', detail: null })
    expect(failureCauseOf(tree({ kind: 'extension-stop' }))).toEqual({
      kind: 'extension-stop',
      detail: null,
    })
  })

  it('takes the detail only from the diagnostic of a call without reply', () => {
    const noReply = (diagnostic: string | null) =>
      tree({ kind: 'no-reply', cause: 'upstream', upstreamStatus: '503', diagnostic })
    expect(failureCauseOf(noReply('http-503'))).toEqual({ kind: 'no-reply', detail: 'http-503' })
    expect(failureCauseOf(noReply(null))).toEqual({ kind: 'no-reply', detail: null })
    expect(failureCauseOf(noReply(''))).toEqual({ kind: 'no-reply', detail: null })
  })

  it('gives no detail for a refused model call', () => {
    expect(failureCauseOf(tree({ kind: 'model-refused', failure: 'invalid' }))).toEqual({
      kind: 'model-refused',
      detail: null,
    })
  })
})

describe('runFailureCausesOf', () => {
  it('is absent without the history of Session', () => {
    expect(runFailureCausesOf(undefined)).toBeUndefined()
  })

  it('reads the terminal entries backward with the access of the caller until the Run of the read', async () => {
    const calls: unknown[] = []
    const history: TerminalReader = {
      begin: async asked => {
        calls.push(asked)
        return pageOf([terminal('run-3', { kind: 'guard' })], 'cursor-1')
      },
      next: async asked => {
        calls.push(asked)
        return pageOf([
          terminal('run-2', {
            kind: 'no-reply',
            cause: 'upstream-unavailable',
            upstreamStatus: '400',
            diagnostic: 'http-400',
          }),
        ])
      },
    }
    expect(await runFailureCausesOf(history)?.read(input)).toEqual({
      kind: 'cause',
      cause: { kind: 'no-reply', detail: 'http-400' },
    })
    const access = { principal: input.principal, tenant: input.tenant, session: input.session }
    expect(calls).toEqual([
      { ...access, kinds: ['run.terminal'], from: null, direction: 'backward', pageBytes: 65536 },
      { ...access, cursor: 'cursor-1' },
    ])
  })

  it.each([
    ['no terminal entry of the Run', pageOf([terminal('run-9', { kind: 'guard' })])],
    ['a terminal entry without the end', pageOf([terminal('run-2', undefined)])],
    ['an end without a failure', pageOf([terminal('run-2', null)])],
  ])('answers none to %s', async (_label, page) => {
    const history: TerminalReader = { begin: async () => page, next: async () => page }
    expect(await runFailureCausesOf(history)?.read(input)).toEqual({ kind: 'none' })
  })

  it('answers unavailable to a refused history read', async () => {
    const history: TerminalReader = {
      begin: async () => fail({ kind: 'denied', action: 'history' }),
      next: async () => fail({ kind: 'denied', action: 'history' }),
    }
    expect(await runFailureCausesOf(history)?.read(input)).toEqual({ kind: 'unavailable' })
  })
})
