// The explicit access check at the public transaction boundary (SPEC「当前操作的访问裁定」): the
// memory factory requires `accessCheck`, commit carries the caller's access, every public read and
// write asks once at its execution point, and a denied, unavailable or throwing check leaves no entry.
import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  ResidentKey,
  SessionAccessRequest,
  SessionCommand,
  SessionTransactionPort,
} from '@omne-harness/session-contract'
import {
  createMemoryInitializationSource,
  createMemorySessionTransactions,
  createScriptedSessionAccessCheck,
  creation,
  evidence,
  memoryAccess,
  memoryOtherAccess,
  operationId,
  ordinaryInput,
  refused,
  succeeded,
  type SessionAccessScript,
} from '@omne-harness/session-contract/testing'
import { initializationGuards } from './initialization-fixture.ts'

const access = memoryAccess('tester')
const allowed = (record: string): SessionAccessScript => ({
  kind: 'allowed',
  evidence: evidence(record),
})

async function scene(answers: readonly SessionAccessScript[]) {
  const initialization = createMemoryInitializationSource()
  const accessCheck = createScriptedSessionAccessCheck<string>(answers)
  const port = createMemorySessionTransactions<string>({ initialization, accessCheck })
  const command = {
    kind: 'create',
    input: {
      tenant: access.tenant,
      session: access.session,
      operation: operationId('create'),
      creation: creation({ initial: ordinaryInput('first') }),
    },
  } satisfies SessionCommand
  const material = initializationGuards(command, null)[0]
  if (material === undefined) throw new Error('missing explicit adoption fixture')
  initialization.controls.register(command, material)
  const guards = succeeded(await initialization.prepare(command), 'prepare')
  const entries = () => port.controls.entriesOf(access.tenant, access.session)
  const create = () => port.commit({ access, command, guards })
  return { port, accessCheck, command, guards, entries, create }
}

const tenantAccess = { principal: access.principal, tenant: access.tenant }

describe('the memory transaction factory requires the explicit access check', () => {
  it('cannot be built without one and cannot commit without the caller access', async () => {
    const s = await scene([allowed('never-used')])
    // Type-level only: these calls are never executed.
    const rejectedAtCompileTime = () => {
      // @ts-expect-error accessCheck is a required dependency; there is no default permission
      createMemorySessionTransactions<string>({
        initialization: createMemoryInitializationSource(),
      })
      // @ts-expect-error commit carries the explicit SessionAccess of this call
      return s.port.commit({ command: s.command, guards: s.guards })
    }
    expectTypeOf(rejectedAtCompileTime).toBeFunction()
    expectTypeOf<Parameters<SessionTransactionPort<string>['commit']>[0]>().toHaveProperty('access')
    // A caller outside the type system that omits the access is refused before any write.
    const untyped = s.port.commit as unknown as (input: object) => ReturnType<typeof s.create>
    expect(refused(await untyped({ command: s.command, guards: s.guards }), 'no access')).toEqual({
      kind: 'denied',
      action: 'create',
    })
    expect(s.entries()).toEqual([])
    expect(s.accessCheck.controls.asked()).toEqual([])
  })

  it('refuses a denied commit before any entry exists and records the full request', async () => {
    const s = await scene([{ kind: 'denied' }])
    expect(refused(await s.create(), 'denied create')).toEqual({ kind: 'denied', action: 'create' })
    expect(s.entries()).toEqual([])
    expect(s.accessCheck.controls.asked()).toEqual([
      {
        access: tenantAccess,
        operation: 'create',
        target: { kind: 'session', session: access.session, command: s.command },
      },
    ] satisfies readonly SessionAccessRequest<string>[])
  })

  it('does not write on unavailable or on a throwing check', async () => {
    const s = await scene([
      { kind: 'unavailable', diagnostic: 'directory down' },
      { kind: 'throw', error: new Error('source failed') },
    ])
    expect(refused(await s.create(), 'unavailable create')).toMatchObject({
      kind: 'unavailable',
      diagnostic: expect.stringContaining('directory down'),
    })
    expect(s.entries()).toEqual([])
    expect(refused(await s.create(), 'throwing create')).toMatchObject({ kind: 'unavailable' })
    expect(s.entries()).toEqual([])
    expect(s.accessCheck.controls.asked()).toHaveLength(2)
  })

  it('refuses an access that names another tenant or session without asking', async () => {
    const s = await scene([allowed('never-used')])
    const foreign = memoryOtherAccess('stranger')
    expect(
      refused(await s.port.commit({ access: foreign, command: s.command, guards: s.guards }), 'x'),
    ).toEqual({ kind: 'denied', action: 'create' })
    expect(
      refused(
        await s.port.commit({
          access: { ...access, session: memoryAccess('tester', 'session-2').session },
          command: s.command,
          guards: s.guards,
        }),
        'other session',
      ),
    ).toEqual({ kind: 'denied', action: 'create' })
    expect(s.entries()).toEqual([])
    expect(s.accessCheck.controls.asked()).toEqual([])
  })

  it('asks once per call and never reuses an allowed answer, including a recall', async () => {
    const s = await scene([allowed('create'), allowed('read-1'), { kind: 'denied' }])
    succeeded(await s.create(), 'create')
    succeeded(await s.port.readWork(access), 'first read')
    expect(refused(await s.port.readWork(access), 'second read')).toEqual({
      kind: 'denied',
      action: 'readWork',
    })
    expect(refused(await s.create(), 'recall after exhaustion')).toMatchObject({
      kind: 'unavailable',
    })
    expect(s.accessCheck.controls.asked().map(item => item.operation)).toEqual([
      'create',
      'readWork',
      'readWork',
      'create',
    ])
  })

  it('binds the allowed evidence to the commit of the same call only', async () => {
    const s = await scene([allowed('decision-1'), allowed('decision-2')])
    const first = succeeded(await s.create(), 'create')
    expect(
      s.port.controls.decisionOf(access.tenant, access.session, s.command.input.operation),
    ).toEqual(evidence('decision-1'))
    const recalled = succeeded(await s.create(), 'recall')
    expect(recalled.receipt.recovered).toBe(true)
    expect(recalled.receipt.revision).toBe(first.receipt.revision)
    expect(
      s.port.controls.decisionOf(access.tenant, access.session, s.command.input.operation),
    ).toEqual(evidence('decision-1'))
  })

  it('asks once for every history page and the model view', async () => {
    const s = await scene([
      allowed('create'),
      allowed('begin'),
      { kind: 'denied' },
      allowed('view'),
      { kind: 'unavailable', diagnostic: 'gone' },
    ])
    succeeded(await s.create(), 'create')
    const page = succeeded(
      await s.port.history.begin({
        ...access,
        kinds: [],
        from: null,
        direction: 'forward',
        pageBytes: 1,
      }),
      'first page',
    )
    if (page.next === null) throw new Error('cursor missing')
    expect(refused(await s.port.history.next({ ...access, cursor: page.next }), 'next')).toEqual({
      kind: 'denied',
      action: 'history.next',
    })
    succeeded(
      await s.port.history.readModelView({ ...access, basis: null, after: null, pageBytes: 1000 }),
      'view',
    )
    expect(
      refused(
        await s.port.history.since({
          ...access,
          after: page.entries[0]!.id,
          kinds: [],
          pageBytes: 1,
        }),
        'since',
      ),
    ).toMatchObject({ kind: 'unavailable' })
    expect(s.accessCheck.controls.asked().map(item => item.operation)).toEqual([
      'create',
      'history.begin',
      'history.next',
      'history.readModelView',
      'history.since',
    ])
    expect(s.accessCheck.controls.asked()[2]).toEqual({
      access: tenantAccess,
      operation: 'history.next',
      target: { kind: 'session', session: access.session },
    })
  })

  it('asks the tenant directory and the two system directories with their own targets', async () => {
    const s = await scene([{ kind: 'denied' }, { kind: 'denied' }, { kind: 'denied' }])
    const key = 'resident-1' as ResidentKey
    expect(
      refused(await s.port.pending({ ...tenantAccess, after: null, limit: 1 }), 'pending'),
    ).toEqual({ kind: 'denied', action: 'pending' })
    expect(
      refused(
        await s.port.references({
          principal: 'tester',
          scope: 'system',
          key,
          after: null,
          limit: 1,
        }),
        'references',
      ),
    ).toEqual({ kind: 'denied', action: 'references' })
    expect(
      refused(
        await s.port.releasedScopes({
          principal: 'tester',
          scope: 'system',
          after: null,
          limit: 1,
        }),
        'releasedScopes',
      ),
    ).toEqual({ kind: 'denied', action: 'releasedScopes' })
    expect(s.accessCheck.controls.asked()).toEqual([
      {
        access: tenantAccess,
        operation: 'pending',
        target: { kind: 'tenant', tenant: access.tenant },
      },
      {
        access: { principal: 'tester', scope: 'system' },
        operation: 'references',
        target: { kind: 'resident-references', key },
      },
      {
        access: { principal: 'tester', scope: 'system' },
        operation: 'releasedScopes',
        target: { kind: 'released-scopes' },
      },
    ] satisfies readonly SessionAccessRequest<string>[])
  })
})
