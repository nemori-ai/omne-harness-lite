import type { IncomingMessage } from 'node:http'
import type {
  AccessIdentity,
  ActForResult,
  IdentityFailure,
  LoginIdentity,
  LoginResult,
  Principal,
} from '@omne-harness/access-cordis-contract'
import type { ObservationContract } from '@omne-harness/public-contract'
import { countHeader } from './headers.ts'
import type { CallWatch, Interruption } from './watch.ts'

export type SignedIn = Readonly<{ identity: LoginIdentity; proof: string }>

export type Established =
  | Readonly<{
      kind: 'caller'
      principal: LoginIdentity | Principal | undefined
      login?: SignedIn
    }>
  | Readonly<{ kind: 'refused' }>
  | Readonly<{ kind: 'unavailable'; thrown: boolean }>
  | Readonly<{ kind: 'interrupted'; by: Interruption }>

const BEARER = /^bearer (\S+)$/i

function proofOf(req: IncomingMessage): string | undefined {
  if (countHeader(req, 'authorization') !== 1) return undefined
  return BEARER.exec(req.headers.authorization ?? '')?.[1]
}

function tenantOf(req: IncomingMessage): string | undefined {
  if (countHeader(req, 'omne-acting-tenant') !== 1) return undefined
  const value = req.headers['omne-acting-tenant']
  return typeof value === 'string' && value !== '' ? value : undefined
}

type Failure = Exclude<Established, { kind: 'caller' }>

async function ask<T>(
  watch: CallWatch,
  work: () => Promise<T | IdentityFailure>,
  given: (result: T | IdentityFailure) => result is T,
): Promise<Readonly<{ kind: 'given'; value: T }> | Failure> {
  const attended = await watch.attend(work)
  if (attended.kind === 'interrupted') return attended
  if (attended.kind === 'threw') return { kind: 'unavailable', thrown: true }
  const result = attended.value
  if (given(result)) return { kind: 'given', value: result }
  return result.outcome === 'denied' ? { kind: 'refused' } : { kind: 'unavailable', thrown: false }
}

const identified = (
  result: LoginResult,
): result is Extract<LoginResult, { outcome: 'identified' }> => result.outcome === 'identified'
const issued = (result: ActForResult): result is Extract<ActForResult, { outcome: 'issued' }> =>
  result.outcome === 'issued'

export async function establish(
  identity: ObservationContract['identity'],
  req: IncomingMessage,
  port: AccessIdentity,
  watch: CallWatch,
): Promise<Established> {
  if (identity === 'none') return { kind: 'caller', principal: undefined }
  const proof = proofOf(req)
  if (proof === undefined) return { kind: 'refused' }
  const recognised = await ask(watch, () => port.identifyLogin(proof), identified)
  if (recognised.kind !== 'given') return recognised
  const { login } = recognised.value
  if (identity === 'login')
    return { kind: 'caller', principal: login, login: { identity: login, proof } }
  const tenant = tenantOf(req)
  if (tenant === undefined) return { kind: 'refused' }
  const acting = await ask(watch, () => port.actFor(login, tenant), issued)
  if (acting.kind !== 'given') return acting
  return { kind: 'caller', principal: acting.value.principal, login: { identity: login, proof } }
}
