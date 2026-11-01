// The conformance suite of the delegated entry `SessionDelegatedTransactions` (SPEC
// 「当前操作的访问裁定」) and a fixture over the in-memory pair. The Session execution boundary checks one face
// operation once, then binds a view; the suite proves that the view does not ask the access check
// again, that it refuses a call outside the checked tenant, session or command, and that the
// bound evidence goes with the operation record. A passing double proves the in-memory behavior,
// not a real store.
import assert from 'node:assert/strict'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { SessionFailure } from './faces.ts'
import {
  mutationAccessRequest,
  readAccessRequest,
  type SessionCheckedAccess,
  type SessionDelegatedTransactions,
} from './access.ts'
import type { DurableEvidence, SessionAccess, SessionId, SessionOperationId } from './identity.ts'
import type { SessionCreation } from './values.ts'
import type { SessionEntriesObservation, SessionEntriesStart } from './interpretation-values.ts'
import type { GuardCommand, SessionCommand, SessionTransactionPort } from './ports.ts'
import { tenantEquals } from '@omne-harness/legal-identity'
import { createPolicySessionAccessCheck } from './testing-access.ts'
import { createMemorySessionHistorySource } from './testing-history-source.ts'
import { createMemoryInitializationSource } from './testing-initialization-source.ts'
import {
  createMemorySessionTransactionPair,
  memoryInitializationGuards,
  scene,
} from './testing-transactions.ts'
import {
  conformanceCase,
  expectKind,
  handle,
  refused,
  succeeded,
  type ConformanceCase,
} from './testing-case.ts'
import {
  creation as legalCreation,
  evidence,
  inputId,
  memoryAccess,
  memoryOtherAccess,
  operationId,
  ordinaryInput,
  sessionId,
} from './testing-values.ts'

/**
 * What the delegated suite needs. A fresh fixture serves one case. `transactions` is the public
 * port over the same store as `delegated`; the suite creates sessions through it. `access` names
 * the tenant and session of the case, `otherAccess` another tenant. `checks` counts the calls that
 * the access check of `transactions` received so far. `decisionOf`, when offered, reads the access
 * evidence stored with an operation record.
 */
export interface SessionDelegatedTransactionsFixture<P> {
  readonly transactions: SessionTransactionPort<P>
  readonly delegated: SessionDelegatedTransactions<P>
  readonly access: SessionAccess<P>
  readonly otherAccess: SessionAccess<P>
  readonly creation: SessionCreation
  operation(name: string): SessionOperationId
  initializationGuards?(
    command: Extract<SessionCommand, { kind: 'create' }>,
  ): Promise<readonly GuardCommand[]>
  checks(): number
  decisionOf?(
    tenant: TenantId,
    session: SessionId,
    operation: SessionOperationId,
  ): DurableEvidence | null
}

const CLAUSE = '当前操作的访问裁定'

function steps<P>(fixture: SessionDelegatedTransactionsFixture<P>, port = fixture.transactions) {
  const { access, creation, operation } = fixture
  return scene({
    port,
    access,
    creation,
    operation,
    ...(fixture.initializationGuards === undefined
      ? {}
      : { initializationGuards: fixture.initializationGuards }),
  })
}

function acceptOf<P>(
  fixture: SessionDelegatedTransactionsFixture<P>,
  input: string,
  name: string,
  session: SessionId = fixture.access.session,
): Extract<SessionCommand, { kind: 'accept' }> {
  return {
    kind: 'accept',
    input: {
      tenant: fixture.access.tenant,
      session,
      operation: fixture.operation(name),
      value: ordinaryInput(input),
    },
  }
}

function checkedCommand<P>(
  fixture: SessionDelegatedTransactionsFixture<P>,
  command: SessionCommand,
): SessionCheckedAccess<P> {
  return {
    request: mutationAccessRequest(fixture.access, command),
    evidence: evidence(`access/face/${command.kind}/${command.input.operation}`),
  }
}

async function createSession<P>(
  fixture: SessionDelegatedTransactionsFixture<P>,
  session: SessionId,
  name: string,
): Promise<void> {
  const command: Extract<SessionCommand, { kind: 'create' }> = {
    kind: 'create',
    input: {
      tenant: fixture.access.tenant,
      session,
      operation: fixture.operation(name),
      creation: fixture.creation,
    },
  }
  succeeded(
    await fixture.transactions.commit({
      access: { ...fixture.access, session },
      command,
      guards: (await fixture.initializationGuards?.(command)) ?? [],
    }),
    `create ${session}`,
  )
}

function deniedOf(answer: Outcome<unknown, SessionFailure>, what: string) {
  return expectKind(refused(answer, what), 'denied', what)
}

export function sessionDelegatedTransactionsConformance<P>(): readonly ConformanceCase<
  SessionDelegatedTransactionsFixture<P>
>[] {
  return [
    conformanceCase(
      CLAUSE,
      'a view serves the checked face operation without asking the access check, on the store of the public port',
      async fixture => {
        succeeded(await steps(fixture).create(), 'create')
        const command = acceptOf(fixture, 'input-a', 'accept-a')
        const view = fixture.delegated.bind(checkedCommand(fixture, command))
        const asked = fixture.checks()
        const query = { ...fixture.access, operation: command.input.operation }
        expectKind(
          succeeded(await view.queryOperation(query), 'recall point query'),
          'unknown',
          'recall point query',
        )
        succeeded(await view.readWork(fixture.access), 'authoritative read')
        succeeded(
          await view.commit({ access: fixture.access, command, guards: [] }),
          'commit of the checked command',
        )
        expectKind(
          succeeded(await view.queryOperation(query), 'point query after the commit'),
          'committed',
          'point query after the commit',
        )
        assert.equal(fixture.checks(), asked, 'the bound view asked the access check')
        const read = succeeded(
          await fixture.transactions.readInput({ ...fixture.access, input: inputId('input-a') }),
          'public readInput',
        )
        assert.equal(read.input, inputId('input-a'), 'the view wrote another store')
      },
    ),

    conformanceCase(
      CLAUSE,
      'a view answers denied to another session or another tenant, without asking the access check',
      async fixture => {
        succeeded(await steps(fixture).create(), 'create')
        const other = sessionId(`${fixture.access.session}-other`)
        await createSession(fixture, other, 'create-other')
        const view = fixture.delegated.bind({
          request: readAccessRequest(fixture.access, 'readWork'),
          evidence: evidence('access/face/readWork'),
        })
        const asked = fixture.checks()
        const sibling = { ...fixture.access, session: other }
        const stranger = { ...fixture.otherAccess, session: fixture.access.session }
        deniedOf(await view.readWork(sibling), 'readWork of another session')
        deniedOf(await view.readWork(stranger), 'readWork under another tenant')
        deniedOf(
          await view.history.begin({
            ...sibling,
            kinds: [],
            from: null,
            direction: 'forward',
            pageBytes: 1_000_000,
          }),
          'history of another session',
        )
        const foreign = acceptOf(fixture, 'input-x', 'accept-x', other)
        deniedOf(
          await view.commit({ access: sibling, command: foreign, guards: [] }),
          'commit on another session',
        )
        const elsewhere: Extract<SessionCommand, { kind: 'accept' }> = {
          kind: 'accept',
          input: {
            ...foreign.input,
            tenant: fixture.otherAccess.tenant,
            session: fixture.access.session,
          },
        }
        deniedOf(
          await view.commit({ access: stranger, command: elsewhere, guards: [] }),
          'commit under another tenant',
        )
        assert.equal(fixture.checks(), asked, 'the bound view asked the access check')
        expectKind(
          succeeded(
            await fixture.transactions.queryOperation({
              ...sibling,
              operation: foreign.input.operation,
            }),
            'public query of the refused commit',
          ),
          'unknown',
          'a refused commit wrote',
        )
      },
    ),

    conformanceCase(
      CLAUSE,
      'a view commits only the checked command: another input, operation or a read binding is denied',
      async fixture => {
        succeeded(await steps(fixture).create(), 'create')
        const command = acceptOf(fixture, 'input-a', 'accept-a')
        const view = fixture.delegated.bind(checkedCommand(fixture, command))
        const asked = fixture.checks()
        const otherInput = acceptOf(fixture, 'input-b', 'accept-a')
        deniedOf(
          await view.commit({ access: fixture.access, command: otherInput, guards: [] }),
          'commit of another input',
        )
        const otherOperation = acceptOf(fixture, 'input-a', 'accept-a-again')
        deniedOf(
          await view.commit({ access: fixture.access, command: otherOperation, guards: [] }),
          'commit under another operation',
        )
        const reader = fixture.delegated.bind({
          request: readAccessRequest(fixture.access, 'readWork'),
          evidence: evidence('access/face/readWork'),
        })
        deniedOf(
          await reader.commit({ access: fixture.access, command, guards: [] }),
          'commit through a read binding',
        )
        assert.equal(fixture.checks(), asked, 'the bound view asked the access check')
        for (const name of ['accept-a', 'accept-a-again'])
          expectKind(
            succeeded(
              await fixture.transactions.queryOperation({
                ...fixture.access,
                operation: fixture.operation(name),
              }),
              `public query of ${name}`,
            ),
            'unknown',
            `a refused commit of ${name} wrote`,
          )
      },
    ),

    conformanceCase(
      CLAUSE,
      'a changed retry with a fresh expected stays bound to the checked command',
      async fixture => {
        const s = steps(fixture)
        await s.openRun()
        const snapshot = await s.readWork()
        const run = expectKind(snapshot.run, 'active', 'run')
        const finish = (expected: string): Extract<SessionCommand, { kind: 'finishRun' }> => ({
          kind: 'finishRun',
          input: {
            ...s.base,
            operation: fixture.operation('finish'),
            run: run.run,
            expected: expected as typeof snapshot.revision,
            bounded: { kind: 'uninterpretable', evidence: evidence('agent/uninterpretable') },
          },
        })
        const stale = finish(String(BigInt(snapshot.revision) - 1n))
        const view = fixture.delegated.bind(checkedCommand(fixture, stale))
        const asked = fixture.checks()
        expectKind(
          refused(
            await view.commit({ access: fixture.access, command: stale, guards: [] }),
            'first attempt',
          ),
          'changed',
          'first attempt',
        )
        succeeded(
          await view.commit({
            access: fixture.access,
            command: finish(snapshot.revision),
            guards: [],
          }),
          'retry with the fresh expected',
        )
        assert.equal(fixture.checks(), asked, 'the bound view asked the access check')
      },
    ),

    conformanceCase(
      CLAUSE,
      'a view commit stores the bound evidence with the operation record',
      async fixture => {
        const decisionOf = handle(fixture.decisionOf, 'decisionOf')
        succeeded(await steps(fixture).create(), 'create')
        const command = acceptOf(fixture, 'input-a', 'accept-a')
        const checked = checkedCommand(fixture, command)
        const view = fixture.delegated.bind(checked)
        succeeded(await view.commit({ access: fixture.access, command, guards: [] }), 'commit')
        assert.deepEqual(
          decisionOf(fixture.access.tenant, fixture.access.session, command.input.operation),
          checked.evidence,
        )
      },
    ),

    conformanceCase(
      CLAUSE,
      'a view answers denied to pending, references, releasedScopes and commitEntries',
      async fixture => {
        succeeded(await steps(fixture).create(), 'create')
        const view = fixture.delegated.bind({
          request: readAccessRequest(fixture.access, 'readWork'),
          evidence: evidence('access/face/readWork'),
        })
        const asked = fixture.checks()
        const { principal, tenant } = fixture.access
        deniedOf(await view.pending({ principal, tenant, after: null, limit: 10 }), 'pending')
        deniedOf(
          await view.references({
            principal,
            scope: 'system',
            key: 'resident-key' as Parameters<typeof view.references>[0]['key'],
            after: null,
            limit: 10,
          }),
          'references',
        )
        deniedOf(
          await view.releasedScopes({ principal, scope: 'system', after: null, limit: 10 }),
          'releasedScopes',
        )
        deniedOf(
          await view.commitEntries({
            observation: { tenant, session: fixture.access.session } as SessionEntriesObservation,
            start: {} as SessionEntriesStart,
          }),
          'commitEntries',
        )
        assert.equal(fixture.checks(), asked, 'the bound view asked the access check')
      },
    ),
  ]
}

/** A fresh fixture over a fresh in-memory pair, with a counting policy check. */
export function memorySessionDelegatedTransactionsFixture(): SessionDelegatedTransactionsFixture<string> {
  const initialization = createMemoryInitializationSource()
  const access = memoryAccess('tester')
  // The same explicit policy as the transaction fixture: only the fixture's tenant may touch a session.
  const accessCheck = createPolicySessionAccessCheck<string>(request =>
    request.target.kind === 'session' &&
    'tenant' in request.access &&
    !tenantEquals(request.access.tenant, access.tenant)
      ? { kind: 'denied' }
      : { kind: 'allowed', evidence: evidence(`access/${request.operation}`) },
  )
  const { transactions, delegated } = createMemorySessionTransactionPair<string>({
    history: createMemorySessionHistorySource(),
    initialization,
    accessCheck,
  })
  return {
    transactions,
    delegated,
    access,
    otherAccess: memoryOtherAccess('stranger'),
    creation: legalCreation(),
    operation: operationId,
    initializationGuards: memoryInitializationGuards(initialization),
    checks: () => accessCheck.controls.asked().length,
    decisionOf: transactions.controls.decisionOf,
  }
}
