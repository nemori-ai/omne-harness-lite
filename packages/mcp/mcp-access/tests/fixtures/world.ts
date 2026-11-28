import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import {
  accountCodec,
  accountEquals,
  organizationCodec,
  tenant,
  tenantCodec,
  type AccountId,
  type TenantId,
} from '@omne-harness/legal-identity'
import type {
  ActionName,
  CatalogView,
  DefinitionDigest,
  EndpointRef,
  EndpointSettings,
  EndpointChangeListener,
  EndpointStatusView,
  KnownAction,
  Millis,
  RefreshResult,
} from '@omne-harness/mcp-contract'
import { endpointRefOf, jsonOf, millisOf, revisionOf } from '@omne-harness/mcp-contract/testing'
import { fail, succeed } from '@omne-harness/operation-result'
import { createMcpContribution } from '../../src/contribution.ts'
import type { McpFaces, McpPrincipals } from '../../src/ports.ts'

export type FixtureLogin = Readonly<{
  account: AccountId
  loginText: string
  tenant: TenantId
  tenantText: string
}>

const BODY = 'abcdefghjkmnpqrstvwxyz2345'

function parsed<T>(result: { ok: true; value: T } | { ok: false }, text: string): T {
  if (!result.ok) throw new Error(`fixture ${text} did not parse`)
  return result.value
}

export function fixtureLogin(letter: string): FixtureLogin {
  const suffix = `${letter}${BODY.slice(1)}`
  const account = parsed(accountCodec.parse(`acc_${suffix}`), suffix)
  const organization = parsed(organizationCodec.parse(`org_${suffix}`), suffix)
  const minted = tenant(organization, account)
  const text = tenantCodec.encode(minted)
  if (!text.ok) throw new Error('fixture tenant did not encode')
  return { account, loginText: `login-${letter}`, tenant: minted, tenantText: text.value }
}

function textOf(minted: TenantId): string {
  const text = tenantCodec.encode(minted)
  if (!text.ok) throw new Error('fixture tenant did not encode')
  return text.value
}

export const loginIdentity = (login: FixtureLogin): LoginIdentity =>
  login as unknown as LoginIdentity

type Status = Awaited<ReturnType<McpFaces['status']['inspect']>>
type Current = Awaited<ReturnType<McpFaces['discovery']['current']>>
type Refreshed = Awaited<ReturnType<McpFaces['discovery']['refresh']>>
type Connect = NonNullable<McpFaces['connect']>
type Begun = Awaited<ReturnType<Connect['begin']>>
type Ended = Awaited<ReturnType<Connect['disconnect']>>

/** What the faces say of one endpoint; a function is a call that throws or answers when asked. */
export type EndpointScript = {
  /** What the adoption holds of the endpoint: its settings, and how it authenticates. */
  adopted?: { settings?: Partial<EndpointSettings>; auth?: 'none' | 'static' | 'oauth' }
  status?: Status | (() => Status)
  current?: Current | (() => Current)
  refresh?: Refreshed | (() => Refreshed)
  begin?: Begun | (() => Begun)
  disconnect?: Ended | (() => Ended)
}

export const readyStatus = (ref: EndpointRef, fields: Partial<EndpointStatusView> = {}): Status =>
  succeed({
    ref,
    connection: { kind: 'ready' },
    credential: 'present',
    use: { kind: 'usable' },
    ...fields,
  })

export function knownAction(
  name: string,
  facts: {
    description?: string
    unavailable?: 'connection-unavailable' | 'authorization-required' | 'credential-unavailable'
  } = {},
): KnownAction {
  return {
    name: name as ActionName,
    lastLawful: {
      name: name as ActionName,
      definition: jsonOf({
        name,
        ...(facts.description === undefined ? {} : { description: facts.description }),
        inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
      }),
    },
    definitionDigest: `sha256:${name}` as DefinitionDigest,
    availability:
      facts.unavailable === undefined
        ? { kind: 'available' }
        : { kind: 'unavailable', reason: facts.unavailable },
  }
}

export const acquired = (actions: readonly KnownAction[]): Current =>
  succeed({
    kind: 'acquired',
    revision: revisionOf(1),
    basis: undefined as never,
    freshness: { acquiredAt: '2026-11-23T00:00:00.000Z', changedNotified: false },
    basisCurrent: 'no-connection',
    actions,
  } satisfies Extract<CatalogView, { kind: 'acquired' }>)

export const notAcquired: Current = succeed({ kind: 'not-acquired' })
export const published: Refreshed = succeed({
  kind: 'published',
  revision: revisionOf(2),
} satisfies RefreshResult)

export const SECRET = 'sk-live-0123456789-secret'

export const ref = (name: string): EndpointRef => endpointRefOf(name)

export type WorldOptions = Readonly<{ faces?: boolean; connect?: boolean }>

export const BEGUN_AT = 1_800_000_000_000

export function createWorld(options: WorldOptions = {}) {
  const authority = inProcessPrincipalAuthority()
  const system = authority.issuer.issueSystem({ component: 'mcp-access-fixture' })
  if ('failure' in system) throw new Error('fixture system principal not issued')
  const byTenant = new Map<string, Map<string, EndpointScript>>()
  const principalAsks: string[] = []
  const issuedPrincipals: Principal[] = []
  const refusals = new Map<number, 'denied' | 'basis-unavailable' | 'throw'>()
  const seen: {
    op: string
    principal: Principal
    tenant: TenantId
    name?: string
    bound?: Millis
  }[] = []
  const listeners = new Set<EndpointChangeListener>()
  let breakSubscribe = false
  let adoptionFailure: 'throw' | 'unknown' | undefined
  let present = options.faces !== false

  const principals: McpPrincipals = {
    async actingFor(login, tenantText) {
      const ask = principalAsks.length
      principalAsks.push(tenantText)
      const refusal = refusals.get(ask)
      if (refusal === 'throw') throw new Error('identity fault')
      if (refusal !== undefined) return { refused: refusal }
      const caller = login as unknown as FixtureLogin
      const target = tenantCodec.parse(tenantText)
      if (!target.ok || !accountEquals(target.value.account, caller.account))
        return { refused: 'denied' }
      const issued = authority.issuer.issueActingForTenant({
        actor: system.ok,
        tenant: target.value,
        work: { owner: 'identity-login', work: caller.loginText },
      })
      if ('failure' in issued) throw new Error('fixture principal not issued')
      const principal = issued.ok as unknown as Principal
      issuedPrincipals.push(principal)
      return { ok: principal }
    },
  }

  const scriptOf = (tenantId: TenantId, name: string) => byTenant.get(textOf(tenantId))?.get(name)
  const run = <T>(value: T | (() => T) | undefined, absent: T): T =>
    value === undefined ? absent : typeof value === 'function' ? (value as () => T)() : value

  const faces: McpFaces = {
    adoption: {
      async endpoints(access) {
        seen.push({ op: 'endpoints', principal: access.principal, tenant: access.tenant })
        if (adoptionFailure === 'throw') throw new Error('adoption fault')
        if (adoptionFailure === 'unknown') return fail('unknown')
        const endpoints = byTenant.get(textOf(access.tenant)) ?? new Map<string, EndpointScript>()
        return succeed(
          [...endpoints].map(
            ([name, script]) =>
              ({
                ref: ref(name),
                revision: '1',
                body: jsonOf({
                  name,
                  transport: 'streamable-http',
                  auth: script.adopted?.auth ?? 'none',
                }),
                settings: {
                  target: { kind: 'value', value: 'https://peer.example/mcp' },
                  credential: { kind: 'value', value: SECRET },
                  connectTimeout: { kind: 'absent' },
                  ...script.adopted?.settings,
                },
              }) as never,
          ),
        )
      },
    },
    status: {
      async inspect(access, endpoint) {
        seen.push({
          op: 'inspect',
          principal: access.principal,
          tenant: access.tenant,
          name: endpoint.name,
        })
        return run(
          scriptOf(access.tenant, endpoint.name)?.status,
          fail({ kind: 'unknown' as const }),
        )
      },
      subscribe(listener) {
        if (breakSubscribe) throw new Error('feed fault')
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    discovery: {
      async current(access, endpoint) {
        seen.push({
          op: 'current',
          principal: access.principal,
          tenant: access.tenant,
          name: endpoint.name,
        })
        return run(scriptOf(access.tenant, endpoint.name)?.current, notAcquired)
      },
      async refresh(access, request) {
        seen.push({
          op: 'refresh',
          principal: access.principal,
          tenant: access.tenant,
          name: request.ref.name,
          ...(request.connectBound === undefined ? {} : { bound: request.connectBound }),
        })
        return run(scriptOf(access.tenant, request.ref.name)?.refresh, published)
      },
    },
    ...(options.connect === false
      ? {}
      : {
          connect: {
            async begin(access, endpointRef) {
              seen.push({
                op: 'begin',
                principal: access.principal,
                tenant: access.tenant,
                name: endpointRef.name,
              })
              const begun: Begun = succeed({
                url: 'https://auth.example/authorize?s=1',
                expiresAt: BEGUN_AT,
              })
              return run(scriptOf(access.tenant, endpointRef.name)?.begin, begun)
            },
            async disconnect(access, endpointRef) {
              seen.push({
                op: 'disconnect',
                principal: access.principal,
                tenant: access.tenant,
                name: endpointRef.name,
              })
              const ended: Ended = succeed('disconnected')
              return run(scriptOf(access.tenant, endpointRef.name)?.disconnect, ended)
            },
          },
        }),
  }

  const contribution = createMcpContribution({
    faces: () => (present ? faces : undefined),
    principals,
    settings: { refresh: { connectBoundMs: millisOf(10_000) } },
  })
  const signal = new AbortController().signal
  const callOf = (login: FixtureLogin) => ({
    principal: loginIdentity(login),
    messageId: 'm-1',
    signal,
  })

  return {
    principals,
    faces: () => (present ? faces : undefined),
    principalAsks,
    issuedPrincipals,
    seen,
    define(login: FixtureLogin, name: string, script: EndpointScript) {
      const key = login.tenantText
      const endpoints = byTenant.get(key) ?? new Map<string, EndpointScript>()
      byTenant.set(key, endpoints)
      endpoints.set(name, script)
    },
    refuseAsk(ask: number, refusal: 'denied' | 'basis-unavailable' | 'throw') {
      refusals.set(ask, refusal)
    },
    failAdoption(how: 'throw' | 'unknown') {
      adoptionFailure = how
    },
    removeFaces() {
      present = false
    },
    feed: {
      listeners,
      changed: (login: FixtureLogin) => {
        for (const listener of listeners) listener.changed(login.tenant)
      },
      close: () => {
        for (const listener of listeners) listener.closed()
      },
      breakSubscribe: () => {
        breakSubscribe = true
      },
    },
    observe: (
      login: FixtureLogin,
      target: FixtureLogin = login,
      controller = new AbortController(),
    ) =>
      contribution.observations['observe-endpoints'](
        { principal: loginIdentity(login), signal: controller.signal } as never,
        { tenant: target.tenant },
      ),
    list: (login: FixtureLogin, target: FixtureLogin = login) =>
      contribution.operations['list-endpoints'](callOf(login), { tenant: target.tenant }),
    read: (login: FixtureLogin, name: string, target: FixtureLogin = login) =>
      contribution.operations['read-endpoint'](callOf(login), { tenant: target.tenant, name }),
    refresh: (login: FixtureLogin, name: string, target: FixtureLogin = login) =>
      contribution.operations['refresh-endpoint'](callOf(login), { tenant: target.tenant, name }),
    begin: (login: FixtureLogin, name: string, target: FixtureLogin = login) =>
      contribution.operations['begin-connect'](callOf(login), { tenant: target.tenant, name }),
    disconnect: (login: FixtureLogin, name: string, target: FixtureLogin = login) =>
      contribution.operations['disconnect'](callOf(login), { tenant: target.tenant, name }),
  }
}

export type World = ReturnType<typeof createWorld>
