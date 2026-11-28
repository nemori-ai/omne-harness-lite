import { identityProtocol } from '@omne-harness/identity-protocol'
import { readTenantText, type ProtocolContract } from '@omne-harness/public-contract'
import {
  ClientRequestError,
  createClient,
  createHttpProtocolTransport,
  type CallReport,
  type CallRequest,
  type ClientOf,
  type Credentials,
  type ObserveEnd,
  type ObserveRequest,
  type ProtocolKey,
  type Transport,
} from '@omne-harness/sdk/core'
import type { JsonValue } from '@omne-harness/json-text'
import type { LoginCredentials, LoginResult, LogoutResult } from '../shared/channel.ts'
import { tenantText } from '../shared/tenant.ts'
import { openPluginFile, type PluginFileAnswer, type PluginFileAt } from './plugin-files.ts'
import type { CookieLogin } from './login-cookie.ts'
import { tenantProtocols } from './tenant-protocols.ts'

export type ServerConnector = (credentials: Credentials) => Transport

export function httpServer(origin: string): ServerConnector {
  createHttpProtocolTransport({ origin })
  return credentials => createHttpProtocolTransport({ origin, credentials: () => credentials })
}

export type RulesOptions = {
  readonly connect: ServerConnector
  readonly contracts: readonly ProtocolContract[]
}

export type LoginAnswer =
  | { readonly result: 'signed-in'; readonly login: CookieLogin }
  | { readonly result: Exclude<LoginResult, 'signed-in'> }

export type LoginStanding = 'valid' | 'invalid' | 'unverified'

/** The rules hold no login: every method takes the login the request's cookie carried. */
export interface ForwardingRules {
  readonly protocols: readonly ProtocolKey[]
  observationCarriesLogin(protocol: ProtocolKey, observation: string): boolean
  call(request: CallRequest, login: CookieLogin | undefined): Promise<CallReport>
  observe(
    request: ObserveRequest,
    login: CookieLogin | undefined,
  ): AsyncGenerator<JsonValue, ObserveEnd, undefined>
  login(credentials: LoginCredentials): Promise<LoginAnswer>
  logout(login: CookieLogin): Promise<LogoutResult>
  standing(login: CookieLogin): Promise<LoginStanding>
  /** One file of a plugin, read with the login the request carried. */
  pluginFile(at: PluginFileAt, login: CookieLogin): Promise<PluginFileAnswer>
}

const NOT_SENT: CallReport = Object.freeze({ kind: 'not-sent' })

const AVAILABILITY = JSON.stringify(['access', 1, 'availability'])

type IssueLoginOutcome = Awaited<
  ReturnType<ClientOf<typeof identityProtocol>['issue-login']>
>['outcome']

const LOGIN_RESULTS: Readonly<
  Record<Exclude<IssueLoginOutcome, 'succeeded'>, Exclude<LoginResult, 'signed-in'>>
> = {
  'uniform-auth-failure': 'auth-failed',
  unknown: 'unknown',
  uncertain: 'unknown',
  unavailable: 'unavailable',
  'basis-unavailable': 'unavailable',
  'stage-not-provided': 'unavailable',
  'protocol-rejected': 'rejected',
}

type Identity = ProtocolContract['operations'][string]['identity']
type Demand = Identity | 'carries-credential'

const targetOf = (key: ProtocolKey, name: string): string =>
  JSON.stringify([key.name, key.major, name])

const keyOf = (key: ProtocolKey): string => JSON.stringify([key.name, key.major])

async function* tapped(
  frames: AsyncGenerator<JsonValue, ObserveEnd, undefined>,
  see: (frame: JsonValue, first: boolean) => void,
): AsyncGenerator<JsonValue, ObserveEnd, undefined> {
  let first = true
  try {
    for (;;) {
      const next = await frames.next()
      if (next.done === true) return next.value
      see(next.value, first)
      first = false
      yield next.value
    }
  } finally {
    await frames.return({ kind: 'aborted' })
  }
}

function demandsOf(contracts: readonly ProtocolContract[]): ReadonlyMap<string, Demand> {
  const demands = new Map<string, Demand>()
  for (const contract of contracts) {
    for (const [name, operation] of Object.entries(contract.operations))
      demands.set(
        targetOf(contract, name),
        operation.carriesCredential === true ? 'carries-credential' : operation.identity,
      )
    for (const [name, observation] of Object.entries(contract.observations))
      demands.set(targetOf(contract, name), observation.identity)
  }
  return demands
}

function credentialsFor(login: CookieLogin, identity: Exclude<Identity, 'none'>): Credentials {
  return identity === 'login'
    ? { proof: login.proof }
    : { proof: login.proof, tenant: login.tenant }
}

export function createForwardingRules(options: RulesOptions): ForwardingRules {
  const { connect } = options
  const demands = demandsOf(options.contracts)
  const listed = new Set(options.contracts.map(keyOf))
  const tenant = tenantProtocols(login => connect(credentialsFor(login, 'acting-tenant')), targetOf)
  const identityFor = (login: CookieLogin | undefined) =>
    createClient(
      identityProtocol,
      connect(login === undefined ? {} : credentialsFor(login, 'login')),
    )
  // One query in flight per proof; its answer is shared, never kept.
  const asking = new Map<string, Promise<LoginStanding>>()

  function credentialsOf(target: string, login: CookieLogin | undefined): Credentials | undefined {
    const demand = demands.get(target)
    if (demand === undefined || demand === 'carries-credential') return undefined
    return login === undefined || demand === 'none' ? {} : credentialsFor(login, demand)
  }

  async function callCredentials(
    request: CallRequest,
    login: CookieLogin | undefined,
  ): Promise<Credentials | undefined> {
    const target = targetOf(request.protocol, request.operation)
    if (demands.has(target)) return credentialsOf(target, login)
    if (login === undefined || listed.has(keyOf(request.protocol))) return undefined
    return (await tenant.has(login, target)) ? credentialsFor(login, 'acting-tenant') : undefined
  }

  return {
    protocols: options.contracts.map(contract => ({ name: contract.name, major: contract.major })),

    observationCarriesLogin(protocol, observation) {
      const demand = demands.get(targetOf(protocol, observation))
      return demand !== undefined && demand !== 'none' && demand !== 'carries-credential'
    },

    async pluginFile(at, login) {
      const tenant = readTenantText(login.tenant)
      if (tenant === undefined) return { kind: 'unavailable' }
      const transport = connect(credentialsFor(login, 'login'))
      return openPluginFile(transport, tenant, at).catch(() => ({ kind: 'unavailable' as const }))
    },

    async call(request, login) {
      const credentials = await callCredentials(request, login)
      return credentials === undefined ? NOT_SENT : connect(credentials).call(request)
    },

    async *observe(request, login) {
      const credentials = credentialsOf(targetOf(request.protocol, request.observation), login)
      if (credentials === undefined) return { kind: 'not-sent' }
      const frames = connect(credentials).observe(request)
      if (targetOf(request.protocol, request.observation) !== AVAILABILITY) return yield* frames
      return yield* tapped(frames, (frame, first) => tenant.frame(frame, first))
    },

    async login(credentials) {
      let answer
      try {
        answer = await identityFor(undefined)['issue-login']({
          loginIdentifier: credentials.loginIdentifier,
          credential: credentials.credential,
        })
      } catch (error) {
        return { result: error instanceof ClientRequestError ? 'rejected' : 'unknown' }
      }
      if (answer.outcome !== 'succeeded') return { result: LOGIN_RESULTS[answer.outcome] }
      return {
        result: 'signed-in',
        login: {
          proof: answer.body.loginProof,
          tenant: tenantText(answer.body.tenantId),
          loginId: answer.body.loginId,
        },
      }
    },

    async logout(login) {
      try {
        tenant.forget(login)
        const answer = await identityFor(login)['revoke-login']({ targetLoginId: login.loginId })
        return answer.outcome === 'succeeded' || answer.outcome === 'no-change'
          ? 'signed-out'
          : 'unknown'
      } catch {
        return 'unknown'
      }
    },

    standing(login) {
      const pending = asking.get(login.proof)
      if (pending !== undefined) return pending
      const asked = identityFor(login)
        ['query-current-tenant']({})
        .then(
          (answer): LoginStanding =>
            answer.outcome === 'succeeded'
              ? 'valid'
              : answer.outcome === 'denied'
                ? 'invalid'
                : 'unverified',
          (): LoginStanding => 'unverified',
        )
        .finally(() => asking.delete(login.proof))
      asking.set(login.proof, asked)
      return asked
    },
  }
}
