import { describe, expect, it } from 'vitest'
import type { InProcessCall } from '@omne-harness/access-cordis-contract'
import { createServerEntry, createStandaloneRegistry } from '../src/index.ts'
import { accessSide, TENANT } from './support/access-kit.ts'
import { baseConfig } from './support/entry.ts'

const NOTES = { name: 'notes', major: 1 } as const

function world() {
  const side = accessSide({}, () => undefined)
  const entry = createServerEntry({ config: baseConfig(), access: side.access })
  const ask = (over: Partial<InProcessCall> = {}) =>
    entry.call({
      protocol: NOTES,
      operation: 'read-note',
      body: { noteId: 'n-1' },
      login: 'login-alice',
      tenant: TENANT,
      id: 'call-1',
      ...over,
    })
  const leftAll = () => side.log.entries.every(entry => entry.left)
  return { side, entry, ask, leftAll }
}

describe('an operation done in process for a person identified earlier', () => {
  it('the protocol is not there: nothing ran, and it says why', async () => {
    const w = world()
    expect(await w.ask({ protocol: { name: 'absent', major: 1 } })).toEqual({
      kind: 'not-executed',
      reason: 'not-mounted',
    })
    await w.side.takeDown()
    expect(await w.ask()).toEqual({ kind: 'not-executed', reason: 'not-mounted' })
    expect(w.side.notes.calls).toEqual([])
  })

  it('the protocol has no such operation, or the name is an observation: not offered, and the entry is left', async () => {
    const w = world()
    expect(await w.ask({ operation: 'no-such' })).toEqual({
      kind: 'not-executed',
      reason: 'not-offered',
    })
    expect(await w.ask({ operation: 'watch-note' })).toEqual({
      kind: 'not-executed',
      reason: 'not-offered',
    })
    expect(w.leftAll()).toBe(true)
    expect(w.side.notes.calls).toEqual([])
  })

  it('a body the contract does not take is rejected before the handler, and the entry is left', async () => {
    const w = world()
    expect(await w.ask({ body: { noteId: 7 } })).toEqual({
      kind: 'answered',
      outcome: 'protocol-rejected',
      body: { rejection: { at: ['noteId'], given: '7', allows: 'a text that is not empty' } },
    })
    expect(await w.ask({ body: { noteId: 'n-1', extra: true } })).toMatchObject({
      outcome: 'protocol-rejected',
    })
    expect(w.side.notes.calls).toEqual([])
    expect(w.leftAll()).toBe(true)
  })

  it('a login that cannot be resumed is denied, one the identity cannot read now is unavailable; the handler is not called', async () => {
    const w = world()
    expect(await w.ask({ login: 'login-mallory' })).toEqual({
      kind: 'answered',
      outcome: 'denied',
      body: undefined,
    })
    w.side.accessIdentity.resumeLogin = { kind: 'answer', value: { outcome: 'basis-unavailable' } }
    expect(await w.ask()).toMatchObject({ outcome: 'basis-unavailable' })
    w.side.accessIdentity.resumeLogin = { kind: 'throw' }
    expect(await w.ask()).toMatchObject({ outcome: 'basis-unavailable' })
    expect(w.side.notes.calls).toEqual([])
    expect(w.leftAll()).toBe(true)
  })

  it('the operation answers with its own refusal or its own success, with the identity the contract names', async () => {
    const w = world()
    expect(await w.ask()).toEqual({
      kind: 'answered',
      outcome: 'succeeded',
      body: { noteId: 'n-1', title: 'first note' },
    })
    const [read] = w.side.notes.calls
    expect(read?.call.principal).toBe(w.side.accessIdentity.logins.get('proof-alice-7f3c'))
    expect(read?.call.messageId).toBe('call-1')
    w.side.notes.scripts['save-note'] = async () => ({ outcome: 'conflict', body: {} })
    const saved = await w.ask({ operation: 'save-note', body: { noteId: 'n-1', title: 't' } })
    expect(saved).toEqual({ kind: 'answered', outcome: 'conflict', body: {} })
    const login = w.side.accessIdentity.logins.get('proof-alice-7f3c')!
    expect(w.side.notes.calls[1]?.call.principal).toBe(
      w.side.accessIdentity.principalOf(login, TENANT),
    )
    expect(w.side.accessIdentity.calls).toContainEqual({
      method: 'resumeLogin',
      login: 'login-alice',
      tenant: TENANT,
    })
    expect(w.leftAll()).toBe(true)
  })

  it('a handler that throws: a commit is unknown, a read is unavailable; the entry is left', async () => {
    const w = world()
    w.side.notes.scripts['save-note'] = async () => {
      throw new Error('fault')
    }
    w.side.notes.scripts['read-note'] = async () => {
      throw new Error('fault')
    }
    expect(
      await w.ask({ operation: 'save-note', body: { noteId: 'n-1', title: 't' } }),
    ).toMatchObject({ outcome: 'unknown' })
    expect(await w.ask()).toMatchObject({ outcome: 'basis-unavailable' })
    expect(w.leftAll()).toBe(true)
  })

  it("a protocol the tenant's own plugin mounts is reached in that tenant's scope, only for a login that acts for it", async () => {
    const side = accessSide({}, () => undefined)
    const deployment = createStandaloneRegistry()
    const asked: unknown[] = []
    const registry = {
      ...deployment,
      enter(
        key: Parameters<typeof deployment.enter>[0],
        name: string,
        scope: readonly string[] = [],
      ) {
        asked.push(scope)
        const own = scope.length === 2 && scope[0] === 'tenant' && scope[1] === TENANT
        return own ? side.access.registry.enter(key, name) : deployment.enter(key, name)
      },
    }
    const entry = createServerEntry({
      config: baseConfig(),
      access: { ...side.access, registry, tenantScope: (tenant: string) => ['tenant', tenant] },
    })
    const body = {
      protocol: NOTES,
      operation: 'read-note',
      body: { noteId: 'n-1' },
      tenant: TENANT,
      id: 'c',
    }
    expect(await entry.call({ ...body, login: 'login-alice' })).toMatchObject({
      outcome: 'succeeded',
    })
    expect(asked).toEqual([[], ['tenant', TENANT]])
    expect(await entry.call({ ...body, login: 'login-mallory' })).toEqual({
      kind: 'not-executed',
      reason: 'not-mounted',
    })
    expect(asked).toEqual([[], ['tenant', TENANT], []])
  })

  it('without access the entry does nothing in process', async () => {
    const entry = createServerEntry({ config: baseConfig() })
    expect(
      await entry.call({
        protocol: NOTES,
        operation: 'read-note',
        body: {},
        login: 'l',
        tenant: TENANT,
        id: 'x',
      }),
    ).toEqual({ kind: 'not-executed', reason: 'unavailable' })
  })
})
