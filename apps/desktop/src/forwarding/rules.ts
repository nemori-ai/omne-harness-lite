import { identityProtocol } from '@omne-harness/identity-protocol'
import type { ProtocolContract } from '@omne-harness/public-contract'
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
import type { CookieLogin } from './login-cookie.ts'

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
}

const NOT_SENT: CallReport = Object.freeze({ kind: 'not-sent' })

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
  'protocol-rejected': 'unavailable',
}

type Identity = ProtocolContract['operations'][string]['identity']
type Demand = Identity | 'carries-credential'

const targetOf = (key: ProtocolKey, name: string): string =>
  JSON.stringify([key.name, key.major, name])

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

  return {
    protocols: options.contracts.map(contract => ({ name: contract.name, major: contract.major })),

    observationCarriesLogin(protocol, observation) {
      const demand = demands.get(targetOf(protocol, observation))
      return demand !== undefined && demand !== 'none' && demand !== 'carries-credential'
    },

    async call(request, login) {
      const credentials = credentialsOf(targetOf(request.protocol, request.operation), login)
      return credentials === undefined ? NOT_SENT : connect(credentials).call(request)
    },

    async *observe(request, login) {
      const credentials = credentialsOf(targetOf(request.protocol, request.observation), login)
      if (credentials === undefined) return { kind: 'not-sent' }
      return yield* connect(credentials).observe(request)
    },

    async login(credentials) {
      let answer
      try {
        answer = await identityFor(undefined)['issue-login']({
          loginIdentifier: credentials.loginIdentifier,
          credential: credentials.credential,
        })
      } catch (error) {
        return { result: error instanceof ClientRequestError ? 'unavailable' : 'unknown' }
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
