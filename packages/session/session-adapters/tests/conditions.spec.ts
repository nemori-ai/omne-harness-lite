// J06 on real Cordis 4.0.4: the current conditions provider over the node:sqlite double of the
// storage (real participants, migrations and read handlers). What is checked: with every source
// present the fields are the committed Session facts (the Run adoption, the collaboration mode as
// the directive, the saved route, the open context scope, the residents) and the same facts give the
// same `source`; a declared collaboration change wins over the tenant default; each absent source
// closes the read with `unavailable` and no default takes its place; another tenant's Access finds
// nothing; a superseded Authority is `stale-advance` whatever `previous` says; a stopped provider
// answers `unavailable`.
import { afterEach, describe, expect, it } from 'vitest'
import type { Authority, DurableEvidence } from '@omne-harness/agent-contract'
import { agentConditionsKey } from '@omne-harness/agent-cordis-contract/cordis'
import { fail, succeed } from '@omne-harness/operation-result'
import type { DeclarationChange, Modes } from '@omne-harness/session-contract'
import {
  adoption,
  evidence,
  memoryOtherAccess,
  operationId,
} from '@omne-harness/session-contract/testing'
import {
  createSessionConditionsPlugin,
  type SessionConditionsInput,
} from '../src/cordis/conditions.ts'
import { ok } from './fixtures/common-journal.ts'
import { cordisScene, sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

const MODES_BASIS = evidence('tenant-defaults/modes')
/** Its record differs from the route name, so the projection of `name` is told apart from it. */
const ROUTE_BASIS = evidence('route-a/saving-commit')

const modesOf = (collaboration: Modes['collaboration']): Modes => ({
  permission: 'never',
  environment: adoption('environment-mode'),
  collaboration,
})

/** The Agent access of the scene: its principal and tenant, without the session. */
const agentAccess = (s: SqlScene) => ({ principal: s.access.principal, tenant: s.access.tenant })

const scenes: SqlScene[] = []
const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
  for (const s of scenes.splice(0)) await s.close()
})

type Options = Readonly<{
  /** What the tenant-default resolver answers; `co-work` modes with `MODES_BASIS` when absent. */
  defaults?: 'co-work' | 'auto-drive' | 'unavailable'
  /** Leaves the saved model selection out. */
  selection?: 'absent'
}>

/** The scene, its Cordis root, the provider and the Authority of the opened execution. */
async function provided(name: string, options: Options = {}) {
  const s = await sqlScene(name)
  scenes.push(s)
  const c = await cordisScene(s)
  disposers.push(() => c.dispose())
  const asked: Parameters<SessionConditionsInput['defaultModes']>[0][] = []
  const defaultModes: SessionConditionsInput['defaultModes'] = input => {
    asked.push(input)
    return Promise.resolve(
      options.defaults === 'unavailable'
        ? fail({ kind: 'unavailable', diagnostic: 'no mapping entry' })
        : succeed({ modes: modesOf(options.defaults ?? 'co-work'), basis: MODES_BASIS }),
    )
  }
  const fiber = await c.mount(createSessionConditionsPlugin<string>({ defaultModes }))
  if (options.selection !== 'absent')
    await change(s, 'model-a', { kind: 'model', name: 'route-a', basis: ROUTE_BASIS })
  const opened = ok(await c.journal().open(s.openInput))
  const conditions = () => {
    const found = c.ctx.get(agentConditionsKey)
    if (found === undefined) throw new Error('agentConditions is not provided')
    return found
  }
  const read = (advance: Authority = opened.authority, previous: DurableEvidence | null = null) =>
    conditions().read({ ...agentAccess(s), advance, previous })
  return { s, c, fiber, asked, advance: opened.authority, read }
}

/** One declaration change of the scene's session, committed through the Session port. */
function change(s: SqlScene, operation: string, declaration: DeclarationChange) {
  return s.port.commit({
    access: s.sessionAccess,
    command: {
      kind: 'change',
      input: {
        tenant: s.access.tenant,
        session: s.access.session,
        operation: operationId(operation),
        declaration,
      },
    },
    guards: [],
  })
}

describe('the conditions of a current Authority', () => {
  it('every field is the committed Session fact, and the same facts give the same source', async () => {
    const f = await provided('conditions-full')
    const work = ok(await f.s.port.readWork(f.s.access))
    if (work.run.kind !== 'active') throw new Error('fixture: no active Run')
    const scope = work.contextScopes?.[0]
    if (scope === undefined) throw new Error('fixture: no context scope')
    const first = ok(await f.read())
    expect(first.configuration).toEqual(work.run.adoption)
    expect(first.configuration).toEqual(adoption('assistant@1'))
    expect(first.progression).toEqual({ kind: 'evaluate-completion', basis: MODES_BASIS })
    expect(first.model).toEqual({
      owner: ROUTE_BASIS.owner,
      name: 'route-a',
      revision: ROUTE_BASIS.revision,
      digest: ROUTE_BASIS.digest,
    })
    expect(first.context).toMatchObject({
      owner: 'session',
      record: scope.scope,
      revision: scope.generation,
    })
    expect(first.context.digest).toMatch(/^[0-9a-f]{64}$/)
    expect(first.bindings).toEqual([])
    expect(first.source).toMatchObject({
      owner: 'session-adapters/conditions',
      record: `${f.s.tenantText(f.s.access.tenant)}/${f.s.access.session}/${work.run.run}`,
    })
    // The resolver was asked for exactly the source the creation named, with the definition.
    expect(f.asked).toEqual([
      {
        tenant: f.s.access.tenant,
        session: f.s.access.session,
        definition: work.definition,
        source: adoption('tenant-defaults'),
      },
    ])
    const second = ok(await f.read(f.advance, first.source))
    expect(second).toEqual(first)
  })

  it('an auto-drive tenant default is the continue directive', async () => {
    const f = await provided('conditions-auto-default', { defaults: 'auto-drive' })
    expect(ok(await f.read()).progression).toEqual({ kind: 'continue', basis: MODES_BASIS })
  })

  it('a declared collaboration change wins over the tenant default, with its own authorization', async () => {
    const f = await provided('conditions-change')
    const authorization = evidence('hitl/auto-drive')
    ok(
      await change(f.s, 'mode-1', {
        kind: 'collaboration-mode',
        value: 'auto-drive',
        authorization,
      }),
    )
    const read = ok(await f.read())
    expect(read.progression).toEqual({ kind: 'continue', basis: authorization })
    expect(f.asked).toEqual([])
    // The directive is part of the facts, so the source moved with it.
    ok(
      await change(f.s, 'mode-2', {
        kind: 'collaboration-mode',
        value: 'co-work',
        authorization: evidence('hitl/co-work'),
      }),
    )
    const back = ok(await f.read(f.advance, read.source))
    expect(back.progression).toEqual({
      kind: 'evaluate-completion',
      basis: evidence('hitl/co-work'),
    })
    expect(back.source).not.toEqual(read.source)
  })
})

describe('an absent source closes the read', () => {
  it('a tenant default the resolver cannot give is unavailable, not a default directive', async () => {
    const f = await provided('conditions-no-default', { defaults: 'unavailable' })
    expect(await f.read()).toMatchObject({
      failure: { kind: 'unavailable', owner: 'session-adapters/conditions' },
    })
    expect(f.asked).toHaveLength(1)
  })

  it('a session with no saved model selection is unavailable, not a default route', async () => {
    const f = await provided('conditions-no-model', { selection: 'absent' })
    expect(await f.read()).toMatchObject({
      failure: { kind: 'unavailable', owner: 'session-adapters/conditions' },
    })
  })

  it('an execution the tenant never started is denied', async () => {
    const f = await provided('conditions-unknown-execution')
    const foreign = { ...f.advance, execution: 'exec-never-started' as never }
    expect(await f.read(foreign)).toEqual({
      failure: { kind: 'denied', action: 'read-conditions' },
    })
  })

  it('a stopped provider answers unavailable through a held reference', async () => {
    const f = await provided('conditions-stopped')
    const held = f.c.ctx.get(agentConditionsKey)
    if (held === undefined) throw new Error('agentConditions is not provided')
    const input = { ...agentAccess(f.s), advance: f.advance, previous: null }
    ok(await held.read(input))
    await f.fiber.dispose()
    expect(await held.read(input)).toMatchObject({ failure: { kind: 'unavailable' } })
  })
})

describe('tenant and advance', () => {
  it("another tenant's Access with this tenant's Authority finds nothing and reads no snapshot", async () => {
    const f = await provided('conditions-other-tenant')
    const other = memoryOtherAccess('conditions-other-tenant')
    const before = f.s.controls?.reads.length ?? 0
    const answer = await f.c.ctx.get(agentConditionsKey)?.read({
      principal: other.principal,
      tenant: other.tenant,
      advance: f.advance,
      previous: null,
    })
    expect(answer).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(f.s.controls?.reads.length ?? 0).toBe(before)
  })

  it('a superseded Authority is stale-advance, and a previous source grants nothing', async () => {
    const f = await provided('conditions-stale')
    const current = ok(await f.read())
    const stale = { ...f.advance, executionAttachment: 'attachment-superseded' as never }
    expect(await f.read(stale, current.source)).toEqual({ failure: { kind: 'stale-advance' } })
    expect(await f.read(stale)).toEqual({ failure: { kind: 'stale-advance' } })
  })
})
