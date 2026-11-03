// One call per public entry of the transaction port, for the tenant and session it is given.
import type { EntryId, InputId, RunId, SessionId } from '@omne-harness/session-contract'
import { evidence, operationId } from '@omne-harness/session-contract/testing'
import type { TenantId } from '@omne-harness/legal-identity'
import type { App } from './app.ts'

export type EntryCall = Readonly<{
  name: string
  call(a: App, tenant: TenantId, session: string): Promise<unknown>
}>

const bytes = 100_000

/** The entries that name a tenant and a session. */
export const SESSION_ENTRIES: readonly EntryCall[] = [
  { name: 'commit', call: (a, t, s) => a.accept(t, s, 'late') },
  { name: 'readWork', call: (a, t, s) => a.port.readWork(a.access(t, s)) },
  {
    name: 'readInput',
    call: (a, t, s) => a.port.readInput({ ...a.access(t, s), input: 'input-one' as InputId }),
  },
  {
    name: 'queryOperation',
    call: (a, t, s) =>
      a.port.queryOperation({ ...a.access(t, s), operation: operationId('accept-one') }),
  },
  {
    name: 'queryControlOperation',
    call: (a, t, s) =>
      a.port.queryControlOperation({ ...a.access(t, s), operation: operationId('accept-one') }),
  },
  { name: 'readModelSelection', call: (a, t, s) => a.port.readModelSelection(a.access(t, s)) },
  {
    name: 'history.begin',
    call: (a, t, s) =>
      a.port.history.begin({
        ...a.access(t, s),
        kinds: [],
        from: null,
        direction: 'forward',
        pageBytes: bytes,
      }),
  },
  {
    name: 'history.since',
    call: (a, t, s) =>
      a.port.history.since({
        ...a.access(t, s),
        after: '1' as EntryId,
        kinds: [],
        pageBytes: bytes,
      }),
  },
  {
    name: 'history.next',
    call: (a, t, s) => a.port.history.next({ ...a.access(t, s), cursor: 'a.b.c' }),
  },
  {
    name: 'history.readModelView',
    call: (a, t, s) =>
      a.port.history.readModelView({
        ...a.access(t, s),
        basis: null,
        after: null,
        pageBytes: bytes,
      }),
  },
  {
    name: 'pending',
    call: (a, t) => a.port.pending({ principal: 'tester', tenant: t, after: null, limit: 10 }),
  },
]

/** The system entries: no tenant, every tenant domain. */
export const SYSTEM_ENTRIES: readonly EntryCall[] = [
  {
    name: 'references',
    call: a =>
      a.port.references({
        principal: 'tester',
        scope: 'system',
        key: 'k' as never,
        after: null,
        limit: 10,
      }),
  },
  {
    name: 'releasedScopes',
    call: a =>
      a.port.releasedScopes({ principal: 'tester', scope: 'system', after: null, limit: 10 }),
  },
]

export const kindOf = (value: unknown): string | undefined =>
  (value as { failure?: { kind: string } }).failure?.kind

/**
 * The interpreter entries: they ask no access check (the caller is the trusted interpreter), so
 * they are not in `SESSION_ENTRIES`, whose cases expect an access refusal before any storage call.
 * For another tenant's session they answer `denied`, the same as for a session that never was.
 */
export const INTERPRETER_ENTRIES: readonly EntryCall[] = [
  {
    name: 'commitLog',
    call: (a, t, s) => {
      if (a.port.commitLog === undefined) throw new Error('the SQL port offers no commitLog')
      return a.port.commitLog({
        observation: {
          tenant: t,
          session: s as SessionId,
          run: 'run-of-another' as RunId,
          execution: 'execution-of-another',
          operation: operationId('log-of-another'),
          sequence: '1',
          revision: '1',
          source: evidence('agent/other/event/1'),
          executionEvidence: evidence('agent/other/head/1'),
          consequences: [{ kind: 'observed' }],
        },
      })
    },
  },
]
