import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { McpPorts } from '@omne-harness/mcp-contract'
import type {
  CallbackReceiver,
  ConnectInput,
  GrantConnector,
  GrantStanding,
} from '@omne-harness/mcp-contract/provider'
import { endpointRefOf } from '@omne-harness/mcp-contract/testing'
import { createMcp } from '../src/index.ts'
import { alice, mallory, type Principal } from './doubles/identities.ts'
import { CONFIG, INVALID, TARGET, VALUE, adoptHttp, world } from './doubles/world.ts'

const desk = endpointRefOf('desk')
const REDIRECT = 'http://127.0.0.1:7801/callback'
const NOW = new Date('2026-11-03T12:00:00Z').getTime()
const OAUTH = { pendingMs: 600_000, requestMs: 5_000 }

function oauthWorld(
  standing: GrantStanding | 'unavailable' = { grant: 'none', connecting: false },
) {
  const w = world()
  const begun: Omit<ConnectInput, 'signal'>[] = []
  const opened: number[] = []
  const ended: unknown[] = []
  let now = standing
  let refusal: 'no-registration' | undefined
  let receiverDown = false
  const grants: GrantConnector = {
    async begin({ signal: _signal, ...input }) {
      begun.push(input)
      return refusal === undefined
        ? succeed({ url: 'https://auth.example/authorize?x', expiresAt: NOW + 1 })
        : fail(refusal)
    },
    async disconnect(key) {
      ended.push(key)
      return succeed(true)
    },
    async standing() {
      return now === 'unavailable' ? fail('unavailable') : succeed(now)
    },
  }
  const callbacks: CallbackReceiver = {
    async open(until) {
      opened.push(until)
      return receiverDown ? fail('unavailable') : succeed(REDIRECT)
    },
  }
  const ports: McpPorts<Principal, string> = { ...w.ports, grants, callbacks }
  const mcp = createMcp(ports, {
    ...CONFIG,
    oauth: { ...OAUTH, metadataDocument: 'https://omne.example/client' },
  })
  return {
    w,
    mcp,
    begun,
    opened,
    ended,
    set: (next: GrantStanding | 'unavailable') => {
      now = next
    },
    refuse: (reason: 'no-registration') => {
      refusal = reason
    },
    downReceiver: () => {
      receiverDown = true
    },
  }
}

describe('connecting an OAuth endpoint (C201, C206)', () => {
  it('opens the callback receiver for the pending time, then begins with the endpoint, the target, the person and the operator document', async () => {
    const o = oauthWorld()
    adoptHttp(o.w, desk, { auth: 'oauth' })
    const heard: string[] = []
    o.mcp.status.subscribe({ changed: () => heard.push('changed'), closed: () => undefined })
    expect(await o.mcp.connect.begin(alice, desk)).toEqual({
      ok: { url: 'https://auth.example/authorize?x', expiresAt: NOW + 1 },
    })
    expect(o.opened).toEqual([NOW + OAUTH.pendingMs])
    expect(o.begun).toEqual([
      {
        key: { tenant: alice.tenant, holding: desk.holding, endpoint: desk.name },
        target: TARGET,
        initiator: 'alice',
        redirectUri: REDIRECT,
        metadataDocument: 'https://omne.example/client',
      },
    ])
    expect(heard).toEqual(['changed'])
  })

  it('passes the client identifier the person set; an unreadable one or a missing target refuses before anything goes out', async () => {
    const o = oauthWorld()
    adoptHttp(o.w, desk, { auth: 'oauth', settings: { clientId: VALUE('mine') } })
    await o.mcp.connect.begin(alice, desk)
    expect(o.begun[0]?.configured).toEqual({ clientId: 'mine' })
    const bad = oauthWorld()
    adoptHttp(bad.w, desk, { auth: 'oauth', settings: { clientId: INVALID } })
    expect(await bad.mcp.connect.begin(alice, desk)).toEqual({
      failure: { kind: 'config-invalid', item: 'client-id' },
    })
    const bare = oauthWorld()
    adoptHttp(bare.w, desk, { auth: 'oauth', settings: { target: { kind: 'absent' } } })
    expect(await bare.mcp.connect.begin(alice, desk)).toEqual({
      failure: { kind: 'config-missing', item: 'target' },
    })
    expect([...bad.opened, ...bare.opened, ...bad.begun, ...bare.begun]).toEqual([])
  })

  it('an endpoint that does not use OAuth, one not available to the asker and a disabled one are refused; a disabled one can still be disconnected', async () => {
    const o = oauthWorld()
    adoptHttp(o.w, desk, { auth: 'static' })
    expect(await o.mcp.connect.begin(alice, desk)).toEqual({ failure: { kind: 'not-oauth' } })
    expect(await o.mcp.connect.disconnect(alice, desk)).toEqual({ failure: { kind: 'not-oauth' } })
    const p = oauthWorld()
    adoptHttp(p.w, desk, { auth: 'oauth' })
    expect(await p.mcp.connect.begin(mallory, desk)).toEqual({
      failure: { kind: 'not-available-to-you' },
    })
    p.w.eligibility.block(alice, desk, 'disabled')
    expect(await p.mcp.connect.begin(alice, desk)).toEqual({
      failure: { kind: 'blocked', reason: 'disabled' },
    })
    expect(await p.mcp.connect.disconnect(alice, desk)).toEqual({ ok: 'disconnected' })
    expect(p.ended).toEqual([{ tenant: alice.tenant, holding: desk.holding, endpoint: desk.name }])
    expect(p.begun).toEqual([])
  })

  it('a refusal of the grants is told with its reason; a receiver or grants that are away are unavailable', async () => {
    const o = oauthWorld()
    adoptHttp(o.w, desk, { auth: 'oauth' })
    o.refuse('no-registration')
    expect(await o.mcp.connect.begin(alice, desk)).toEqual({
      failure: { kind: 'refused', reason: 'no-registration' },
    })
    const r = oauthWorld()
    adoptHttp(r.w, desk, { auth: 'oauth' })
    r.downReceiver()
    expect(await r.mcp.connect.begin(alice, desk)).toEqual({
      failure: { kind: 'refused', reason: 'unavailable' },
    })
    expect(r.begun).toEqual([])
    const n = world()
    adoptHttp(n, desk, { auth: 'oauth' })
    const bare = createMcp(n.ports, CONFIG)
    expect(await bare.connect.begin(alice, desk)).toEqual({
      failure: { kind: 'refused', reason: 'unavailable' },
    })
  })
})

describe('how an OAuth endpoint shows its credential (C201, C204)', () => {
  it('none is absent and connectable, valid is present, reconnect asks for it, a begun one is connecting', async () => {
    const o = oauthWorld()
    adoptHttp(o.w, desk, { auth: 'oauth' })
    const seen = async () => {
      const view = await o.mcp.status.inspect(alice, desk)
      return 'ok' in view ? [view.ok.credential, view.ok.connect] : view
    }
    expect(await seen()).toEqual(['absent', 'available'])
    o.set({ grant: 'none', connecting: true })
    expect(await seen()).toEqual(['absent', 'connecting'])
    o.set({ grant: 'valid', connecting: false })
    expect(await seen()).toEqual(['present', 'available'])
    o.set({ grant: 'reconnect', connecting: false })
    expect(await seen()).toEqual(['reconnect-required', 'available'])
    o.set('unavailable')
    expect(await o.mcp.status.inspect(alice, desk)).toEqual({ failure: { kind: 'unknown' } })
    expect(await o.mcp.status.list(alice, 'ws')).toEqual({ failure: 'unknown' })
  })

  it('a static endpoint shows its credential setting and nothing about connecting', async () => {
    const o = oauthWorld({ grant: 'valid', connecting: true })
    adoptHttp(o.w, desk, { auth: 'static' })
    const view = await o.mcp.status.inspect(alice, desk)
    expect(view).toMatchObject({ ok: { credential: 'present' } })
    expect('ok' in view && 'connect' in view.ok).toBe(false)
  })
})
