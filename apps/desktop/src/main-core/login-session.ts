import type { LoginState, LoginStateSource } from '@omne-harness/client-assembly/cordis'
import { identityProtocol } from '@omne-harness/identity-protocol'
import type { ProtocolContract } from '@omne-harness/public-contract'
import {
  ClientRequestError,
  createClient,
  type CallReport,
  type ClientOf,
  type Credentials,
  type ObserveEnd,
  type ProtocolKey,
  type Transport,
} from '@omne-harness/sdk/core'
import type { LoginCredentials, LoginResult, LogoutResult } from '../shared/host-bridge.ts'
import { tenantText } from '../shared/tenant.ts'
import type { CredentialStore, StoredLogin } from './credential-store.ts'

type SessionState =
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'signing-in' }
  | { readonly kind: 'signed-in'; readonly login: StoredLogin }
  | { readonly kind: 'signing-out'; readonly login: StoredLogin }

export type ServerConnector = (credentials: Credentials) => Transport

export type LoginSessionOptions = {
  readonly connect: ServerConnector
  readonly store: CredentialStore
  readonly contracts: readonly ProtocolContract[]
}

export interface LoginSession extends LoginStateSource {
  readonly transport: Transport
  login(credentials: LoginCredentials): Promise<LoginResult>
  logout(): Promise<LogoutResult>
}

const NOT_SENT: CallReport = Object.freeze({ kind: 'not-sent' })

type IssueLoginOutcome = Awaited<
  ReturnType<ClientOf<typeof identityProtocol>['issue-login']>
>['outcome']

const LOGIN_RESULTS: Readonly<Record<Exclude<IssueLoginOutcome, 'succeeded'>, LoginResult>> = {
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

function credentialsFor(login: StoredLogin, identity: Exclude<Identity, 'none'>): Credentials {
  return identity === 'login'
    ? { proof: login.proof }
    : { proof: login.proof, tenant: login.tenant }
}

function endedDenied(end: ObserveEnd): boolean {
  return (
    (end.kind === 'refused' && end.outcome === 'denied') ||
    (end.kind === 'ended' && end.reason === 'denied')
  )
}

export async function openLoginSession(options: LoginSessionOptions): Promise<LoginSession> {
  const { connect, store } = options
  const demands = demandsOf(options.contracts)
  const identityFor = (login: StoredLogin | undefined) =>
    createClient(
      identityProtocol,
      connect(login === undefined ? {} : credentialsFor(login, 'login')),
    )

  const saved = await store.read()
  let state: SessionState =
    saved === undefined ? { kind: 'signed-out' } : { kind: 'signed-in', login: saved }
  const listeners = new Set<(state: LoginState) => void>()
  let probing = false

  function enter(next: SessionState): void {
    state = next
    for (const listener of Array.from(listeners)) listener(next.kind)
  }

  const held = (): StoredLogin | undefined =>
    state.kind === 'signed-in' || state.kind === 'signing-out' ? state.login : undefined

  async function invalidated(login: StoredLogin): Promise<void> {
    if (held() !== login) return
    enter({ kind: 'signed-out' })
    await store.erase()
  }

  function probe(login: StoredLogin): void {
    if (probing) return
    probing = true
    void identityFor(login)
      ['query-current-tenant']({})
      .then(answer => (answer.outcome === 'denied' ? invalidated(login) : undefined))
      .catch(() => undefined)
      .finally(() => {
        probing = false
      })
  }

  function route(
    target: string,
  ): { readonly credentials: Credentials; readonly carried: StoredLogin | undefined } | 'refuse' {
    const demand = demands.get(target)
    if (demand === undefined || demand === 'carries-credential' || state.kind === 'signing-out')
      return 'refuse'
    if (state.kind !== 'signed-in' || demand === 'none')
      return { credentials: {}, carried: undefined }
    return { credentials: credentialsFor(state.login, demand), carried: state.login }
  }

  const transport: Transport = {
    async call(request) {
      const sending = route(targetOf(request.protocol, request.operation))
      if (sending === 'refuse') return NOT_SENT
      const report = await connect(sending.credentials).call(request)
      if (
        sending.carried !== undefined &&
        report.kind === 'answered' &&
        report.outcome === 'denied'
      )
        probe(sending.carried)
      return report
    },
    async *observe(request) {
      const sending = route(targetOf(request.protocol, request.observation))
      if (sending === 'refuse') return { kind: 'not-sent' }
      const end = yield* connect(sending.credentials).observe(request)
      if (sending.carried !== undefined && endedDenied(end)) probe(sending.carried)
      return end
    },
  }

  async function login(credentials: LoginCredentials): Promise<LoginResult> {
    if (state.kind !== 'signed-out') return 'unavailable'
    enter({ kind: 'signing-in' })
    const answer = await identityFor(undefined)
      ['issue-login']({
        loginIdentifier: credentials.loginIdentifier,
        credential: credentials.credential,
      })
      .catch((error: unknown) => {
        if (error instanceof ClientRequestError) return { outcome: 'unavailable' as const }
        enter({ kind: 'signed-out' })
        throw error
      })
    if (answer.outcome !== 'succeeded') {
      enter({ kind: 'signed-out' })
      return LOGIN_RESULTS[answer.outcome]
    }
    const login: StoredLogin = {
      proof: answer.body.loginProof,
      tenant: tenantText(answer.body.tenantId),
      loginId: answer.body.loginId,
    }
    await store.write(login)
    enter({ kind: 'signed-in', login })
    return 'signed-in'
  }

  async function logout(): Promise<LogoutResult> {
    if (state.kind === 'signed-out') return 'signed-out'
    if (state.kind !== 'signed-in') return 'unknown'
    const login = state.login
    enter({ kind: 'signing-out', login })
    let revoked = false
    try {
      const answer = await identityFor(login)['revoke-login']({ targetLoginId: login.loginId })
      revoked = answer.outcome === 'succeeded' || answer.outcome === 'no-change'
    } finally {
      if (held() === login) {
        enter({ kind: 'signed-out' })
        await store.erase()
      }
    }
    return revoked ? 'signed-out' : 'unknown'
  }

  return {
    transport,
    state: () => state.kind,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    login,
    logout,
  }
}
