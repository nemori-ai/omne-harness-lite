// The explicit access check at the public transaction boundary of the common-journal double
// (session-contract SPEC「当前操作的访问裁定」): `createMemorySessionJournal` requires `accessCheck`,
// `transactions.commit` carries the caller's access, every public read and write asks once before
// any effect, and the internal commit paths are not exposed on the public transactions object.
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { ResidentKey, SessionCommand } from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  createMemoryInitializationSource,
  createScriptedSessionAccessCheck,
  creation,
  evidence,
  initializationFixtureFacts,
  initializationFixtureGuard,
  memoryAccess,
  memoryOtherAccess,
  operationId,
  ordinaryInput,
  type SessionAccessScript,
} from '@omne-harness/session-contract/testing'
import { createMemorySessionJournal } from '../src/testing.ts'

const access = memoryAccess('tester', 'access-session')
const tenantAccess = { principal: access.principal, tenant: access.tenant }
const allowed = (record: string): SessionAccessScript => ({
  kind: 'allowed',
  evidence: evidence(record),
})

async function scene(answers: readonly SessionAccessScript[]) {
  const initialization = createMemoryInitializationSource()
  const accessCheck = createScriptedSessionAccessCheck<string>(answers)
  const backend = createMemorySessionJournal<string>({
    initialization,
    accessCheck,
    authorize: () => 'allowed',
  })
  const command = {
    kind: 'create',
    input: {
      tenant: access.tenant,
      session: access.session,
      operation: operationId('create'),
      creation: creation({ initial: ordinaryInput('input-1') }),
    },
  } satisfies SessionCommand
  initialization.controls.register(
    command,
    initializationFixtureGuard(
      initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
    ),
  )
  const prepared = await initialization.prepare(command)
  if ('failure' in prepared) throw new Error('fixture preparation failed')
  const guards = prepared.ok
  const port = backend.transactions
  const entries = () => backend.controls.entriesOf(access.tenant, access.session)
  const create = () => port.commit({ access, command, guards })
  return { backend, port, accessCheck, command, guards, entries, create }
}

describe('the common-journal double requires the explicit access check', () => {
  it('cannot be built without one, cannot commit without access, and hides the internal paths', async () => {
    const s = await scene([allowed('never-used')])
    const rejectedAtCompileTime = () => {
      // @ts-expect-error accessCheck is a required dependency; there is no default permission
      createMemorySessionJournal<string>({
        initialization: createMemoryInitializationSource(),
        authorize: () => 'allowed',
      })
      // @ts-expect-error commit carries the explicit SessionAccess of this call
      return s.port.commit({ command: s.command, guards: s.guards })
    }
    expectTypeOf(rejectedAtCompileTime).toBeFunction()
    expect(s.port).not.toHaveProperty('prepareCommand')
    expect(s.port).not.toHaveProperty('prepareReconciliation')
    const untyped = s.port.commit as unknown as (input: object) => ReturnType<typeof s.create>
    expect(await untyped({ command: s.command, guards: s.guards })).toEqual({
      failure: { kind: 'denied', action: 'create' },
    })
    expect(s.entries()).toEqual([])
    expect(s.accessCheck.controls.asked()).toEqual([])
  })

  it('refuses denied, unavailable and throwing checks before any entry exists', async () => {
    const s = await scene([
      { kind: 'denied' },
      { kind: 'unavailable', diagnostic: 'directory down' },
      { kind: 'throw', error: new Error('source failed') },
    ])
    expect(await s.create()).toEqual({ failure: { kind: 'denied', action: 'create' } })
    expect(await s.create()).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(await s.create()).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(s.entries()).toEqual([])
    expect(s.accessCheck.controls.asked()).toHaveLength(3)
    expect(s.accessCheck.controls.asked()[0]).toEqual({
      access: tenantAccess,
      operation: 'create',
      target: { kind: 'session', session: access.session, command: s.command },
    })
  })

  it('refuses an access of another tenant or session without asking', async () => {
    const s = await scene([allowed('never-used')])
    const foreign = { ...memoryOtherAccess('stranger'), session: access.session }
    expect(await s.port.commit({ access: foreign, command: s.command, guards: s.guards })).toEqual({
      failure: { kind: 'denied', action: 'create' },
    })
    expect(
      await s.port.commit({
        access: memoryAccess('tester', 'another-session'),
        command: s.command,
        guards: s.guards,
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'create' } })
    expect(s.entries()).toEqual([])
    expect(s.accessCheck.controls.asked()).toEqual([])
  })

  it('refuses a denied or unavailable readInput and queryOperation without the answer', async () => {
    const s = await scene([
      allowed('create'),
      { kind: 'denied' },
      { kind: 'unavailable', diagnostic: 'directory down' },
      { kind: 'denied' },
      { kind: 'unavailable', diagnostic: 'directory down' },
      allowed('read-input'),
      allowed('query'),
    ])
    const created = await s.create()
    if ('failure' in created) throw new Error('create failed')
    const input = s.command.input.creation.initial!.input,
      operation = created.ok.receipt.operation
    expect(await s.port.readInput({ ...access, input })).toEqual({
      failure: { kind: 'denied', action: 'readInput' },
    })
    expect(await s.port.readInput({ ...access, input })).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('directory down') },
    })
    expect(await s.port.queryOperation({ ...access, operation })).toEqual({
      failure: { kind: 'denied', action: 'queryOperation' },
    })
    expect(await s.port.queryOperation({ ...access, operation })).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('directory down') },
    })
    // The same reads answer once the check allows them: the refusals above hid real answers.
    expect(await s.port.readInput({ ...access, input })).toMatchObject({ ok: { input } })
    expect(await s.port.queryOperation({ ...access, operation })).toMatchObject({
      ok: { kind: 'committed' },
    })
    expect(s.accessCheck.controls.asked().map(item => item.operation)).toEqual([
      'create',
      'readInput',
      'readInput',
      'queryOperation',
      'queryOperation',
      'readInput',
      'queryOperation',
    ])
  })

  it('asks once per public call, never reuses allowed, and records the evidence with the commit', async () => {
    const s = await scene([
      allowed('decision-create'),
      allowed('read-1'),
      { kind: 'denied' },
      allowed('decision-recall'),
    ])
    const created = await s.create()
    if ('failure' in created) throw new Error('create failed')
    expect(
      s.backend.controls.decisionOf(access.tenant, access.session, s.command.input.operation),
    ).toEqual(evidence('decision-create'))
    expect(await s.port.readWork(access)).toHaveProperty('ok')
    expect(await s.port.readWork(access)).toEqual({
      failure: { kind: 'denied', action: 'readWork' },
    })
    const recalled = await s.create()
    if ('failure' in recalled) throw new Error('recall failed')
    expect(recalled.ok.receipt.recovered).toBe(true)
    expect(
      s.backend.controls.decisionOf(access.tenant, access.session, s.command.input.operation),
    ).toEqual(evidence('decision-create'))
    expect(await s.create()).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(s.accessCheck.controls.asked().map(item => item.operation)).toEqual([
      'create',
      'readWork',
      'readWork',
      'create',
      'create',
    ])
  })

  it('asks for every history page, the operation query and the three directories', async () => {
    const s = await scene([
      allowed('create'),
      allowed('begin'),
      { kind: 'denied' },
      { kind: 'denied' },
      { kind: 'denied' },
      { kind: 'denied' },
      { kind: 'denied' },
    ])
    const created = await s.create()
    if ('failure' in created) throw new Error('create failed')
    const page = await s.port.history.begin({
      ...access,
      kinds: [],
      from: null,
      direction: 'forward',
      pageBytes: 1,
    })
    if ('failure' in page || page.ok.next === null) throw new Error('cursor missing')
    expect(await s.port.history.next({ ...access, cursor: page.ok.next })).toEqual({
      failure: { kind: 'denied', action: 'history.next' },
    })
    expect(
      await s.port.queryOperation({ ...access, operation: s.command.input.operation }),
    ).toEqual({ failure: { kind: 'denied', action: 'queryOperation' } })
    const key = 'resident-1' as ResidentKey
    expect(await s.port.pending({ ...tenantAccess, after: null, limit: 1 })).toEqual({
      failure: { kind: 'denied', action: 'pending' },
    })
    expect(
      await s.port.references({ principal: 'tester', scope: 'system', key, after: null, limit: 1 }),
    ).toEqual({ failure: { kind: 'denied', action: 'references' } })
    expect(
      await s.port.releasedScopes({ principal: 'tester', scope: 'system', after: null, limit: 1 }),
    ).toEqual({ failure: { kind: 'denied', action: 'releasedScopes' } })
    expect(s.accessCheck.controls.asked().map(item => item.operation)).toEqual([
      'create',
      'history.begin',
      'history.next',
      'queryOperation',
      'pending',
      'references',
      'releasedScopes',
    ])
    expect(s.accessCheck.controls.asked()[4]).toEqual({
      access: tenantAccess,
      operation: 'pending',
      target: { kind: 'tenant', tenant: access.tenant },
    })
    expect(s.accessCheck.controls.asked()[5]).toEqual({
      access: { principal: 'tester', scope: 'system' },
      operation: 'references',
      target: { kind: 'resident-references', key },
    })
  })
})
