// The login session (RFC-0015 §10「登录会话」, §13「桌面应用主进程里的登录会话」; SPEC.md
// 「登录会话」). It owns the login proof: the proof is a field of the signed-in and signing-out
// states only. It also gives the page's transport: page calls go out with the proof while signed
// in, operations that carry a credential are never forwarded, and a `denied` answer to a call that
// carried the login starts one probe of `query-current-tenant`.
import type { LoginState, LoginStateSource } from '@omne-harness/client-assembly/cordis'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { ProtocolContract } from '@omne-harness/public-contract'
import {
  ClientRequestError,
  createClient,
  type CallReport,
  type Credentials,
  type ObserveEnd,
  type ProtocolKey,
  type Transport,
} from '@omne-harness/sdk/core'
import type { LoginCredentials, LoginResult, LogoutResult } from '../shared/host-bridge.ts'
import type { CredentialStore, StoredLogin } from './credential-store.ts'

type SessionState =
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'signing-in' }
  | { readonly kind: 'signed-in'; readonly login: StoredLogin }
  | { readonly kind: 'signing-out'; readonly login: StoredLogin }

/** A transport to the server entry that puts these credentials on every request. */
export type ServerConnector = (credentials: Credentials) => Transport

export type LoginSessionOptions = {
  readonly connect: ServerConnector
  readonly store: CredentialStore
  /** The contracts whose `carriesCredential` operations the page may not call. */
  readonly contracts: readonly ProtocolContract[]
}

export interface LoginSession extends LoginStateSource {
  /** The page's transport. */
  readonly transport: Transport
  login(credentials: LoginCredentials): Promise<LoginResult>
  logout(): Promise<LogoutResult>
}

const NOT_SENT: CallReport = Object.freeze({ kind: 'not-sent' })

type Identity = ProtocolContract['operations'][string]['identity']
/** What the contract says one operation or observation needs; a credential-carrying one is the page's to never call. */
type Demand = Identity | 'carries-credential'

const targetOf = (key: ProtocolKey, name: string): string => `${key.name}/v${key.major} ${name}`

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

/**
 * Only what the identity requirement asks for: the proof for `login`, the proof and the acting
 * tenant for `acting-tenant`. A target outside the known contracts gets both, so it still works.
 */
function credentialsFor(login: StoredLogin | undefined, identity: Identity): Credentials {
  if (login === undefined || identity === 'none') return {}
  return identity === 'login' ? { proof: login.proof } : { proof: login.proof, tenant: login.tenant }
}

function endedDenied(end: ObserveEnd): boolean {
  return (
    (end.kind === 'refused' && end.outcome === 'denied') ||
    (end.kind === 'ended' && end.reason === 'denied')
  )
}

/** Opens the login session: reads the saved login (the event「应用启动」). */
export async function openLoginSession(options: LoginSessionOptions): Promise<LoginSession> {
  const { connect, store } = options
  const demands = demandsOf(options.contracts)
  // The session's own identity calls: `issue-login` needs none, `query-current-tenant` and
  // `revoke-login` need the login only.
  const identityFor = (login: StoredLogin | undefined) =>
    createClient(identityProtocol, connect(credentialsFor(login, 'login')))

  const saved = await store.read()
  let state: SessionState =
    saved === undefined ? { kind: 'signed-out' } : { kind: 'signed-in', login: saved }
  const listeners = new Set<(state: LoginState) => void>()
  let probing = false

  function enter(next: SessionState): void {
    state = next
    for (const listener of Array.from(listeners)) listener(next.kind)
  }

  /** The login currently held, if the state holds one. */
  const held = (): StoredLogin | undefined =>
    state.kind === 'signed-in' || state.kind === 'signing-out' ? state.login : undefined

  /** 「身份协议明确答复登录已失效」: acts only while the session still holds this login. */
  async function invalidated(login: StoredLogin): Promise<void> {
    if (held() !== login) return
    enter({ kind: 'signed-out' })
    await store.erase()
  }

  /** At most one probe in flight; its result is not kept. */
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

  /**
   * How a page request to `target` goes out: refused while signing out and for a
   * credential-carrying operation; otherwise with the credentials it needs, and the login it
   * carried (the one a `denied` answer is about).
   */
  function route(
    target: string,
  ): { readonly credentials: Credentials; readonly carried: StoredLogin | undefined } | 'refuse' {
    const demand = demands.get(target) ?? 'acting-tenant'
    if (state.kind === 'signing-out' || demand === 'carries-credential') return 'refuse'
    const login = state.kind === 'signed-in' && demand !== 'none' ? state.login : undefined
    return { credentials: credentialsFor(login, demand), carried: login }
  }

  const transport: Transport = {
    async call(request) {
      const sending = route(targetOf(request.protocol, request.operation))
      if (sending === 'refuse') return NOT_SENT
      const report = await connect(sending.credentials).call(request)
      if (sending.carried !== undefined && report.kind === 'answered' && report.outcome === 'denied')
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
    let answer: Awaited<ReturnType<ReturnType<typeof identityFor>['issue-login']>>
    try {
      answer = await identityFor(undefined)['issue-login']({
        loginIdentifier: credentials.loginIdentifier,
        credential: credentials.credential,
      })
    } catch (error) {
      // A body the contract cannot write was never sent. The error names no credential.
      if (!(error instanceof ClientRequestError)) throw error
      enter({ kind: 'signed-out' })
      return 'unavailable'
    }
    if (answer.outcome === 'succeeded') {
      const tenant = tenantCodec.encode(answer.body.tenantId)
      if (tenant.ok) {
        const held: StoredLogin = {
          proof: answer.body.loginProof,
          tenant: tenant.value,
          loginId: answer.body.loginId,
        }
        await store.write(held)
        enter({ kind: 'signed-in', login: held })
        return 'signed-in'
      }
    }
    enter({ kind: 'signed-out' })
    if (answer.outcome === 'uniform-auth-failure') return 'auth-failed'
    if (answer.outcome === 'unknown' || answer.outcome === 'uncertain') return 'unknown'
    // A success whose tenant cannot be written back is not a usable login.
    return answer.outcome === 'succeeded' ? 'unknown' : 'unavailable'
  }

  async function logout(): Promise<LogoutResult> {
    if (state.kind === 'signed-out') return 'signed-out'
    if (state.kind !== 'signed-in') return 'unknown'
    const login = state.login
    enter({ kind: 'signing-out', login })
    const answer = await identityFor(login)
      ['revoke-login']({ targetLoginId: login.loginId })
      .catch(() => ({ outcome: 'uncertain' as const }))
    const revoked = answer.outcome === 'succeeded' || answer.outcome === 'no-change'
    if (held() === login) {
      enter({ kind: 'signed-out' })
      await store.erase()
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
