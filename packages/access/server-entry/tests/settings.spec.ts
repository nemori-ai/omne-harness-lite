// The four setting governance operations at the governance location (SPEC「设置项」): the login and
// acting tenant steps, the principal and tenant handed to the port, a client that cannot name
// another tenant, the mapping of every port outcome, the absent port, a rejected port, and a
// secret that never reaches a response or a diagnostic.
import { afterEach, describe, expect, it } from 'vitest'
import type { ActingForTenantPrincipal, IdentityOperations } from '@omne-harness/identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { SettingsAccess, SettingsGovernance } from '@omne-harness/server-entry'
import { parseInstant, type Instant } from '@omne-harness/utc-instant'
import {
  GOVERNANCE_PATH,
  governed,
  login,
  send,
  startFixture,
  type Fixture,
  type HttpReply,
  type Login,
} from './support/harness.ts'

const SENTINEL = 'exa-sentinel-5f0e-not-for-output'
const AT_TEXT = '2026-11-09T08:00:00Z'
const parsed = parseInstant(AT_TEXT)
if (!parsed.ok) throw new Error('fixture instant')
const AT: Instant = parsed.value

const WEB = { category: 'tool', name: 'Web' }
const ITEM = 'exa.apiKey'
const OPERATIONS = ['list-settings', 'set-setting', 'describe-setting', 'clear-setting'] as const
type Operation = (typeof OPERATIONS)[number]

const BODIES: Readonly<Record<Operation, Record<string, unknown>>> = {
  'list-settings': { asset: WEB },
  'set-setting': { asset: WEB, item: ITEM, secret: SENTINEL },
  'describe-setting': { asset: WEB, item: ITEM },
  'clear-setting': { asset: WEB, item: ITEM },
}

let fixture: Fixture | undefined
afterEach(async () => {
  await fixture?.stop()
  fixture = undefined
})

type Seen = Readonly<{ method: string; access: SettingsAccess; input: Record<string, unknown> }>

const textOf = (tenant: SettingsAccess['tenant']): string => {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('unminted tenant')
  return encoded.value
}

/** An in-memory settings port keyed by tenant text and item. It records every call it receives. */
function settingsDouble() {
  const configured = new Map<string, Instant>()
  const seen: Seen[] = []
  const key = (access: SettingsAccess, item: string) => `${textOf(access.tenant)}/${item}`
  const record = (method: string, input: Readonly<{ access: SettingsAccess }>) => {
    const { access, ...rest } = input
    seen.push({ method, access, input: rest })
  }
  const port: SettingsGovernance = {
    async list(input) {
      record('list', input)
      const at = configured.get(key(input.access, ITEM))
      return {
        kind: 'succeeded',
        items: [
          {
            asset: WEB,
            item: ITEM,
            title: 'Exa API key',
            sensitivity: 'secret',
            state:
              at === undefined
                ? { state: 'unbound' }
                : { state: 'usable', tenantId: input.access.tenant, configuredAt: at },
          },
          {
            asset: WEB,
            item: 'maxResults',
            title: 'Search results',
            sensitivity: 'ordinary',
            state: { state: 'not-writable' },
          },
        ],
      }
    },
    async set(input) {
      record('set', input)
      configured.set(key(input.access, input.item), AT)
      return { kind: 'succeeded', configuredAt: AT }
    },
    async describe(input) {
      record('describe', input)
      const at = configured.get(key(input.access, input.item))
      return {
        kind: 'succeeded',
        setting:
          at === undefined
            ? { state: 'unbound' }
            : { state: 'usable', tenantId: input.access.tenant, configuredAt: at },
      }
    },
    async clear(input) {
      record('clear', input)
      return configured.delete(key(input.access, input.item))
        ? { kind: 'succeeded' }
        : { kind: 'no-change' }
    },
  }
  return { port, seen }
}

function call(
  who: Login,
  operation: string,
  body: unknown,
  acting: string | null = who.tenantText,
): Promise<HttpReply> {
  if (fixture === undefined) throw new Error('no fixture')
  return send(fixture.port, GOVERNANCE_PATH, { body: governed(who, operation, body, acting) })
}

function outcomeOf(reply: HttpReply): { outcome: string; body: unknown } {
  const json = reply.json as { outcome: string; body: unknown }
  return { outcome: json.outcome, body: json.body }
}

function countingRecognition() {
  const calls: string[] = []
  const wrap = (base: IdentityOperations): IdentityOperations => ({
    registerAndActivate: input => base.registerAndActivate(input),
    issueLogin: input => base.issueLogin(input),
    recognizeLogin: input => {
      calls.push(input.loginProof)
      return base.recognizeLogin(input)
    },
  })
  return { calls, wrap }
}

describe('with a settings port', () => {
  it('lists, sets, describes and clears the settings of the acting tenant', async () => {
    const settings = settingsDouble()
    fixture = await startFixture({ dependencies: { settings: settings.port } })
    const alice = await login(fixture, 'alice')

    const set = await call(alice, 'set-setting', BODIES['set-setting'])
    expect(set.status).toBe(200)
    expect(outcomeOf(set)).toEqual({ outcome: 'succeeded', body: { configuredAt: AT_TEXT } })
    expect(outcomeOf(await call(alice, 'describe-setting', BODIES['describe-setting']))).toEqual({
      outcome: 'succeeded',
      body: { state: 'usable', tenantId: alice.tenantText, configuredAt: AT_TEXT },
    })
    expect(outcomeOf(await call(alice, 'list-settings', {}))).toEqual({
      outcome: 'succeeded',
      body: {
        items: [
          {
            asset: WEB,
            item: ITEM,
            title: 'Exa API key',
            sensitivity: 'secret',
            state: { state: 'usable', tenantId: alice.tenantText, configuredAt: AT_TEXT },
          },
          {
            asset: WEB,
            item: 'maxResults',
            title: 'Search results',
            sensitivity: 'ordinary',
            state: { state: 'not-writable' },
          },
        ],
        completeness: 'complete',
      },
    })
    expect(outcomeOf(await call(alice, 'clear-setting', BODIES['clear-setting']))).toEqual({
      outcome: 'succeeded',
      body: {},
    })
    const again = await call(alice, 'clear-setting', { asset: { name: 'Web' }, item: ITEM })
    expect(again.status).toBe(200)
    expect(outcomeOf(again)).toEqual({ outcome: 'no-change', body: {} })

    // The port saw what the client selected, and nothing else from the body.
    expect(settings.seen.map(({ method, input }) => ({ method, input }))).toEqual([
      { method: 'set', input: { asset: WEB, item: ITEM, secret: SENTINEL } },
      { method: 'describe', input: { asset: WEB, item: ITEM } },
      { method: 'list', input: {} },
      { method: 'clear', input: { asset: WEB, item: ITEM } },
      { method: 'clear', input: { asset: { name: 'Web' }, item: ITEM } },
    ])
    // Each call carried the acting tenant and a principal issued for it from this login.
    for (const { access } of settings.seen) {
      const principal: ActingForTenantPrincipal = access.principal
      expect(textOf(access.tenant)).toBe(alice.tenantText)
      expect(textOf(principal.tenant)).toBe(alice.tenantText)
      expect(principal.work.owner).toBe('identity-login')
    }
  })

  it('a client that names another tenant is denied or rejected, and the port is not called', async () => {
    const settings = settingsDouble()
    fixture = await startFixture({ dependencies: { settings: settings.port } })
    const alice = await login(fixture, 'alice')
    const bob = await login(fixture, 'bob')
    for (const operation of OPERATIONS) {
      // Another tenant as the acting tenant: the login's selection decides, not the client.
      const other = await call(alice, operation, BODIES[operation], bob.tenantText)
      expect(other.status, operation).toBe(403)
      expect(outcomeOf(other), operation).toEqual({ outcome: 'denied', body: {} })
      // A target tenant in the body is not this protocol.
      const smuggled = await call(alice, operation, {
        ...BODIES[operation],
        tenant: bob.tenantText,
      })
      expect(outcomeOf(smuggled).outcome, operation).toBe('protocol-rejected')
      expect(other.text + smuggled.text).not.toContain(SENTINEL)
    }
    expect(settings.seen).toEqual([])
    // Bob's own call reaches the port with Bob's tenant.
    await call(bob, 'describe-setting', BODIES['describe-setting'])
    expect(settings.seen.map(({ access }) => textOf(access.tenant))).toEqual([bob.tenantText])
  })

  it('a tenant of the same account that is not the current selection is denied', async () => {
    const settings = settingsDouble()
    fixture = await startFixture({ dependencies: { settings: settings.port } })
    const alice = await login(fixture, 'alice')
    const created = await call(alice, 'create-organization', {
      createCallId: 'c-1',
      name: 'Team',
      governanceModelId: 'default-team',
    })
    const team = (created.json as { body: { tenantId: string } }).body.tenantId
    expect(team).not.toBe(alice.tenantText)
    for (const operation of OPERATIONS)
      expect(outcomeOf(await call(alice, operation, BODIES[operation], team)), operation).toEqual({
        outcome: 'denied',
        body: {},
      })
    expect(settings.seen).toEqual([])
  })

  it('a principal that cannot be issued answers basis-unavailable and calls no port', async () => {
    const settings = settingsDouble()
    fixture = await startFixture({
      dependencies: { settings: settings.port },
      issuer: base => ({
        ...base,
        issueActingForTenant: () => ({ failure: { field: 'tenant', reason: 'unissued' } }),
      }),
    })
    const alice = await login(fixture, 'alice')
    for (const operation of OPERATIONS)
      expect(outcomeOf(await call(alice, operation, BODIES[operation])), operation).toEqual({
        outcome: 'basis-unavailable',
        body: {},
      })
    expect(settings.seen).toEqual([])
  })

  it('maps each refusal of the port to its outcome and status', async () => {
    const statuses = {
      denied: 403,
      'not-visible': 404,
      conflict: 409,
      'not-writable': 501,
      'basis-unavailable': 503,
      unknown: 500,
    } as const
    const kinds = Object.keys(statuses) as (keyof typeof statuses)[]
    for (const kind of kinds) {
      const port: SettingsGovernance = {
        list: async () => ({ kind: kind === 'denied' ? 'denied' : 'basis-unavailable' }),
        set: async () => ({ kind }),
        describe: async () => ({ kind: kind === 'unknown' ? 'basis-unavailable' : kind }),
        clear: async () => ({ kind }),
      }
      fixture = await startFixture({ dependencies: { settings: port } })
      const alice = await login(fixture, 'alice')
      for (const operation of ['set-setting', 'clear-setting'] as const) {
        const reply = await call(alice, operation, BODIES[operation])
        expect(reply.status, `${operation} ${kind}`).toBe(statuses[kind])
        expect(outcomeOf(reply), `${operation} ${kind}`).toEqual({ outcome: kind, body: {} })
      }
      if (kind !== 'unknown')
        expect(
          outcomeOf(await call(alice, 'describe-setting', BODIES['describe-setting'])),
        ).toEqual({ outcome: kind, body: {} })
      expect(outcomeOf(await call(alice, 'list-settings', {}))).toEqual({
        outcome: kind === 'denied' ? 'denied' : 'basis-unavailable',
        body: {},
      })
      await fixture.stop()
      fixture = undefined
    }
  })

  it('a rejected write is unknown, a rejected read is basis-unavailable, and no secret leaks', async () => {
    const fail = async (input: object): Promise<never> => {
      throw new Error(`store failed while handling ${JSON.stringify(input)}`)
    }
    const port: SettingsGovernance = { list: fail, set: fail, describe: fail, clear: fail }
    fixture = await startFixture({ dependencies: { settings: port } })
    const alice = await login(fixture, 'alice')
    const replies: HttpReply[] = []
    for (const operation of OPERATIONS)
      replies.push(await call(alice, operation, BODIES[operation]))
    expect(replies.map(outcomeOf)).toEqual([
      { outcome: 'basis-unavailable', body: {} },
      { outcome: 'unknown', body: {} },
      { outcome: 'basis-unavailable', body: {} },
      { outcome: 'unknown', body: {} },
    ])
    expect(replies.map(reply => reply.status)).toEqual([503, 500, 503, 500])
    expect(fixture.diagnostics.filter(event => event.code === 'settings.fault')).toEqual(
      OPERATIONS.map(operation => ({ code: 'settings.fault', operation })),
    )
    // The port's error text held the secret; neither the replies nor the diagnostics do.
    for (const reply of replies) expect(reply.text).not.toContain(SENTINEL)
    expect(JSON.stringify(fixture.diagnostics)).not.toContain(SENTINEL)
  })

  it('a port result that echoes the secret is projected to the time only', async () => {
    const port: SettingsGovernance = {
      ...settingsDouble().port,
      // A faulty port that echoes the secret where only presence may appear.
      set: async ({ secret }) =>
        ({ kind: 'succeeded', configuredAt: AT, secret }) as unknown as Awaited<
          ReturnType<SettingsGovernance['set']>
        >,
    }
    fixture = await startFixture({ dependencies: { settings: port } })
    const alice = await login(fixture, 'alice')
    const reply = await call(alice, 'set-setting', BODIES['set-setting'])
    // The entry copies only the fields of the success body; the rest of the port result stays out.
    expect(reply.status).toBe(200)
    expect(outcomeOf(reply)).toEqual({ outcome: 'succeeded', body: { configuredAt: AT_TEXT } })
    expect(reply.text).not.toContain(SENTINEL)
    expect(JSON.stringify(fixture.diagnostics)).not.toContain(SENTINEL)
  })

  it('a state or item that carries the secret does not encode: the empty 500, no secret', async () => {
    const leaked = { state: 'usable', tenantId: undefined, configuredAt: AT, value: SENTINEL }
    const port: SettingsGovernance = {
      ...settingsDouble().port,
      describe: async ({ access }) =>
        ({
          kind: 'succeeded',
          setting: { ...leaked, tenantId: access.tenant },
        }) as unknown as Awaited<ReturnType<SettingsGovernance['describe']>>,
      list: async ({ access }) =>
        ({
          kind: 'succeeded',
          items: [
            {
              asset: WEB,
              item: ITEM,
              title: 'Exa API key',
              sensitivity: 'secret',
              state: { ...leaked, tenantId: access.tenant },
            },
          ],
        }) as unknown as Awaited<ReturnType<SettingsGovernance['list']>>,
    }
    fixture = await startFixture({ dependencies: { settings: port } })
    const alice = await login(fixture, 'alice')
    for (const [operation, body] of [
      ['describe-setting', BODIES['describe-setting']],
      ['list-settings', {}],
    ] as const) {
      const reply = await call(alice, operation, body)
      expect(reply.status, operation).toBe(500)
      expect(reply.text, operation).toBe('')
      expect(fixture.diagnostics).toContainEqual({ code: 'encode.fault', operation })
    }
    expect(JSON.stringify(fixture.diagnostics)).not.toContain(SENTINEL)
  })
})

describe('without a settings port', () => {
  it('the four operations are not provided, before the login is checked', async () => {
    const recognition = countingRecognition()
    fixture = await startFixture({ identity: recognition.wrap })
    const alice = await login(fixture, 'alice')
    const before = recognition.calls.length
    for (const operation of OPERATIONS)
      for (const who of [alice, { ...alice, loginProof: 'not-a-proof' }]) {
        const reply = await call(who, operation, BODIES[operation])
        expect(reply.status, operation).toBe(501)
        expect(outcomeOf(reply), operation).toEqual({ outcome: 'stage-not-provided', body: {} })
        expect(reply.text).not.toContain(SENTINEL)
      }
    expect(recognition.calls.length).toBe(before)
    // A request that fails the closed field check is still protocol-rejected.
    expect(outcomeOf(await call(alice, 'set-setting', { asset: WEB, item: ITEM })).outcome).toBe(
      'protocol-rejected',
    )
    // Control: a governed operation with the same proof does reach the recognition.
    await call(alice, 'query-current-tenant', {}, null)
    expect(recognition.calls.length).toBe(before + 1)
  })
})
