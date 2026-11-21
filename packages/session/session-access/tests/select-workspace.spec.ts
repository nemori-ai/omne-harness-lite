import { describe, expect, it } from 'vitest'
import { workspaceCodec } from '@omne-harness/legal-identity'
import type { SessionId } from '@omne-harness/session-contract'
import {
  DEFINITION,
  WORKSPACE,
  WORKSPACE_ATTACHMENT,
  WORKSPACE_BASIS,
  WORKSPACE_DIRECTORY,
  WORKSPACE_INSTANCE,
  createWorld,
  fixtureLogin,
  loginIdentity,
  type World,
} from './fixtures/world.ts'

const signal = new AbortController().signal
const ops = (world: World) => world.contribution.operations
const as = <P>(principal: P) => ({ principal, messageId: 'm-1', signal })

const ALICE = fixtureLogin('a')
const BOB = fixtureLogin('b')
const TARGET = { workspace: WORKSPACE, instance: WORKSPACE_INSTANCE }
const parsed = workspaceCodec.parse(WORKSPACE)
if (!parsed.ok) throw new Error('fixture workspace did not parse')
const WORKSPACE_ID = parsed.value

const create = (world: World, more: Record<string, unknown> = {}, createCallId = 'create-1') =>
  ops(world)['create-session'](as(world.issue(ALICE)), {
    createCallId,
    definition: DEFINITION,
    purpose: 'hello',
    ...more,
  })

async function created(world: World): Promise<SessionId> {
  const answer = await create(world)
  if (answer.outcome !== 'succeeded') throw new Error(`fixture create answered ${answer.outcome}`)
  return answer.body.session as SessionId
}

const select = (
  world: World,
  session: string,
  workspace: typeof TARGET | null = TARGET,
  controlId = 'control-1',
  who = ALICE,
) =>
  ops(world)['select-workspace'](as(loginIdentity(who)), {
    tenant: who.tenant,
    session,
    controlId,
    workspace,
  })

const calls = (world: World, method: string) =>
  world.session.controls.calls().filter(call => call.method === method)

describe('select-workspace, row by row', () => {
  it('a login that cannot act for the tenant is refused before Workspace is asked', async () => {
    for (const [refusal, expected] of [
      ['denied', { outcome: 'denied' }],
      ['basis-unavailable', { outcome: 'basis-unavailable' }],
      ['throw', { outcome: 'basis-unavailable' }],
    ] as const) {
      const world = createWorld()
      const session = await created(world)
      world.refuseTargets(refusal)
      expect(await select(world, session)).toEqual(expected)
      expect(world.workspaces.calls()).toEqual([])
      expect(calls(world, 'change')).toEqual([])
    }
  })

  it('a verified target is committed with the attachment and the basis Workspace gave', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await select(world, session)).toEqual({
      outcome: 'succeeded',
      body: { controlId: 'control-1', directory: WORKSPACE_DIRECTORY },
    })
    expect(world.workspaces.calls()).toEqual([
      expect.objectContaining({
        tenant: ALICE.tenant,
        workspace: WORKSPACE_ID,
        instance: WORKSPACE_INSTANCE,
      }),
    ])
    expect(calls(world, 'change').map(call => call.input)).toEqual([
      {
        kind: 'workspace',
        value: WORKSPACE_ID,
        workspaceAttachment: WORKSPACE_ATTACHMENT,
        basis: WORKSPACE_BASIS,
      },
    ])
  })

  it('taking the workspace away asks Workspace nothing and commits no workspace', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await select(world, session, null)).toEqual({
      outcome: 'succeeded',
      body: { controlId: 'control-1', directory: null },
    })
    expect(world.workspaces.calls()).toEqual([])
    expect(calls(world, 'change').map(call => call.input)).toEqual([
      {
        kind: 'workspace',
        value: null,
        workspaceAttachment: null,
        basis: {
          owner: 'session-access',
          record: 'select-workspace/none',
          revision: '1',
          digest: '0'.repeat(64),
        },
      },
    ])
  })

  it.each(['not-permitted', 'instance-unavailable'] as const)(
    'a target Workspace refuses (%s) is invalid with its reason and nothing is committed',
    async reason => {
      const world = createWorld()
      const session = await created(world)
      world.workspaces.answer({ kind: 'refused', reason })
      expect(await select(world, session)).toEqual({ outcome: 'invalid', body: { reason } })
      expect(calls(world, 'change')).toEqual([])
    },
  )

  it('a text that is no workspace identity is not permitted and Workspace is not asked', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await select(world, session, { ...TARGET, workspace: 'not-a-workspace' })).toEqual({
      outcome: 'invalid',
      body: { reason: 'not-permitted' },
    })
    expect(world.workspaces.calls()).toEqual([])
  })

  it.each([
    ['Workspace cannot answer', (world: World) => world.workspaces.answer({ kind: 'unavailable' })],
    ['Workspace throws', (world: World) => world.workspaces.answer('throw')],
    ['the workspace port is not there', (world: World) => world.remove('workspaceTargets')],
  ])('%s: an unavailable basis and nothing is committed', async (_name, arrange) => {
    const world = createWorld()
    const session = await created(world)
    arrange(world)
    expect(await select(world, session)).toEqual({ outcome: 'basis-unavailable' })
    expect(calls(world, 'change')).toEqual([])
  })

  it.each(['throw', 'undescribed'] as const)(
    'a principal whose facts cannot be read (%s) is an unavailable basis and nothing is asked',
    async fault => {
      const world = createWorld()
      const session = await created(world)
      world.breakFacts(fault)
      expect(await select(world, session)).toEqual({ outcome: 'basis-unavailable' })
      expect(world.workspaces.calls()).toEqual([])
      expect(calls(world, 'change')).toEqual([])
    },
  )

  it('a session that does not exist and a session of another tenant get the same answer', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await select(world, 'no-such-session')).toEqual(
      await select(world, session, TARGET, 'control-1', BOB),
    )
  })

  it.each([
    [{ kind: 'archived' }, 'archived'],
    [{ kind: 'frozen' }, 'frozen'],
    [{ kind: 'conflict', operation: 'op' }, 'conflict'],
  ] as const)('Session refusing the command (%j) is answered as %s', async (failure, outcome) => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.failNext(failure as never)
    expect(await select(world, session)).toEqual({ outcome, body: {} })
  })

  it('an unconfirmed commit answers unknown; the same control identity is the same operation', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.throwOn('change', new Error('connection lost'))
    expect(await select(world, session)).toEqual({ outcome: 'unknown' })
    world.session.controls.restore()
    expect((await select(world, session)).outcome).toBe('succeeded')
    expect((await select(world, session, TARGET, 'control-2')).outcome).toBe('succeeded')
    const operations = calls(world, 'change').map(call => call.operation)
    expect(operations[0]).toBe(operations[1])
    expect(operations[2]).not.toBe(operations[0])
  })

  it('a session with a Run in progress takes the selection; the Run is not touched', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.addRun(session, 'run-1')
    expect((await select(world, session)).outcome).toBe('succeeded')
    const methods = world.session.controls.calls().map(call => call.method)
    expect(methods.filter(method => method !== 'create' && method !== 'change')).toEqual([])
  })
})

describe('create-session with a workspace', () => {
  const creationOf = (world: World) =>
    (calls(world, 'create')[0]?.input ?? {}) as {
      workspace?: unknown
      workspaceAttachment?: unknown
    }

  it('without one, the session has no workspace and Workspace is not asked', async () => {
    const world = createWorld()
    await created(world)
    expect(creationOf(world)).toMatchObject({ workspace: null, workspaceAttachment: null })
    expect(world.workspaces.calls()).toEqual([])
  })

  it('a verified target is created with the workspace and the attachment Workspace gave', async () => {
    const world = createWorld()
    expect((await create(world, { workspace: TARGET })).outcome).toBe('succeeded')
    expect(creationOf(world)).toMatchObject({
      workspace: WORKSPACE_ID,
      workspaceAttachment: WORKSPACE_ATTACHMENT,
    })
    expect(world.workspaces.calls()).toEqual([
      expect.objectContaining({
        tenant: ALICE.tenant,
        workspace: WORKSPACE_ID,
        instance: WORKSPACE_INSTANCE,
      }),
    ])
  })

  it.each([
    ['not-permitted', { kind: 'refused', reason: 'not-permitted' }],
    ['instance-unavailable', { kind: 'refused', reason: 'instance-unavailable' }],
  ] as const)(
    'a refused target (%s) fails the creation: no session without the workspace',
    async (_n, answer) => {
      const world = createWorld()
      world.workspaces.answer(answer)
      expect(await create(world, { workspace: TARGET })).toEqual({ outcome: 'invalid', body: {} })
      expect(calls(world, 'create')).toEqual([])
    },
  )

  it('a text that is no workspace identity fails the creation', async () => {
    const world = createWorld()
    expect(await create(world, { workspace: { ...TARGET, workspace: 'nope' } })).toEqual({
      outcome: 'invalid',
      body: {},
    })
    expect(calls(world, 'create')).toEqual([])
  })

  it.each([
    ['Workspace cannot answer', (world: World) => world.workspaces.answer({ kind: 'unavailable' })],
    ['Workspace throws', (world: World) => world.workspaces.answer('throw')],
    ['the workspace port is not there', (world: World) => world.remove('workspaceTargets')],
  ])('%s: an unavailable basis and no session', async (_name, arrange) => {
    const world = createWorld()
    arrange(world)
    expect(await create(world, { workspace: TARGET })).toEqual({ outcome: 'basis-unavailable' })
    expect(calls(world, 'create')).toEqual([])
  })
})

describe('read-workspace-selection', () => {
  const read = (world: World, session: string, who = ALICE) =>
    ops(world)['read-workspace-selection'](as(loginIdentity(who)), {
      tenant: who.tenant,
      session,
    })
  const selected = { workspace: WORKSPACE_ID, attachment: WORKSPACE_ATTACHMENT }

  it('answers no workspace and the default directory when the session stands at none', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await read(world, session)).toEqual({
      outcome: 'succeeded',
      body: {
        workspace: null,
        state: 'default',
        directory: '/srv/default',
        reason: null,
        revision: '1',
      },
    })
  })

  it('answers the instance the session stands at, with the state and directory of its step', async () => {
    const world = createWorld()
    const session = await created(world)
    const attached = { state: 'attached', directory: WORKSPACE_DIRECTORY } as const
    world.holdSelection({ kind: 'read', selection: selected, directory: attached, revision: '7' })
    expect(await read(world, session)).toEqual({
      outcome: 'succeeded',
      body: {
        workspace: TARGET,
        state: 'attached',
        directory: WORKSPACE_DIRECTORY,
        reason: null,
        revision: '7',
      },
    })
    const unusable = { state: 'unusable', reason: 'not-permitted' } as const
    world.holdSelection({ kind: 'read', selection: selected, directory: unusable, revision: '8' })
    expect(await read(world, session)).toMatchObject({
      body: { workspace: TARGET, state: 'unusable', directory: null, reason: 'not-permitted' },
    })
    expect(world.selectionReads().map(({ tenant, session: id }) => [tenant, id])).toEqual([
      [ALICE.tenant, session],
      [ALICE.tenant, session],
    ])
  })

  it('answers what the session refuses as the session does', async () => {
    const world = createWorld()
    const session = await created(world)
    world.holdSelection({ kind: 'refused', failure: { kind: 'not-found' } as never })
    expect(await read(world, session)).toEqual({ outcome: 'not-found', body: {} })
    world.holdSelection({ kind: 'refused', failure: { kind: 'denied' } as never })
    expect(await read(world, session)).toEqual({ outcome: 'denied' })
  })

  it('answers basis-unavailable when the selection cannot be read', async () => {
    for (const held of [{ kind: 'unavailable' } as const, 'throw' as const]) {
      const world = createWorld()
      const session = await created(world)
      world.holdSelection(held)
      expect(await read(world, session), JSON.stringify(held)).toEqual({
        outcome: 'basis-unavailable',
      })
    }
    const world = createWorld()
    const session = await created(world)
    world.remove('workspaceSelections')
    expect(await read(world, session)).toEqual({ outcome: 'basis-unavailable' })
  })

  it('a login that cannot act for the tenant is refused before the selection is read', async () => {
    const world = createWorld()
    const session = await created(world)
    world.refuseTargets('denied')
    expect(await read(world, session)).toEqual({ outcome: 'denied' })
    expect(world.selectionReads()).toEqual([])
  })
})
