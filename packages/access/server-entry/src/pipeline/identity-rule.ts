// Step 8, the identity rule (#1233 spec 已定 7). Whatever keeps the caller from being established
// answers `denied`, so the answer does not tell why. The login proof and the tenant text go to the
// identity port as given; the pipeline never reads a login or a principal and caches nothing.
import type { IncomingMessage } from 'node:http'
import type { AccessIdentity, LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { OperationContract } from '@omne-harness/public-contract'
import { countHeader } from './headers.ts'
import type { CallWatch, Interruption } from './watch.ts'

export type Established =
  | Readonly<{
      kind: 'caller'
      principal: LoginIdentity | Principal | undefined
      /** The login to report a business access for; absent when the operation needs no login. */
      login?: LoginIdentity
    }>
  | Readonly<{ kind: 'refused'; outcome: 'denied' }>
  | Readonly<{ kind: 'unavailable'; thrown: boolean }>
  | Readonly<{ kind: 'interrupted'; by: Interruption }>

const BEARER = /^bearer (\S+)$/i

/** The proof of exactly one `Authorization: Bearer <proof>`, or `undefined`. */
function proofOf(req: IncomingMessage): string | undefined {
  if (countHeader(req, 'authorization') !== 1) return undefined
  return BEARER.exec(req.headers.authorization ?? '')?.[1]
}

/** The text of exactly one non-empty `Omne-Acting-Tenant`, or `undefined`. */
function tenantOf(req: IncomingMessage): string | undefined {
  if (countHeader(req, 'omne-acting-tenant') !== 1) return undefined
  const value = req.headers['omne-acting-tenant']
  return typeof value === 'string' && value !== '' ? value : undefined
}

export async function establish(
  identity: OperationContract['identity'],
  req: IncomingMessage,
  port: AccessIdentity,
  watch: CallWatch,
): Promise<Established> {
  if (identity === 'none') return { kind: 'caller', principal: undefined }
  const proof = proofOf(req)
  if (proof === undefined) return { kind: 'refused', outcome: 'denied' }
  const recognised = await watch.attend(() => port.identifyLogin(proof))
  if (recognised.kind === 'interrupted') return recognised
  if (recognised.kind === 'threw') return { kind: 'unavailable', thrown: true }
  const result = recognised.value
  if (result.outcome === 'denied') return { kind: 'refused', outcome: 'denied' }
  if (result.outcome !== 'identified') return { kind: 'unavailable', thrown: false }
  const { login } = result
  if (identity === 'login') return { kind: 'caller', principal: login, login }
  const tenant = tenantOf(req)
  if (tenant === undefined) return { kind: 'refused', outcome: 'denied' }
  const issued = await watch.attend(() => port.actFor(login, tenant))
  if (issued.kind === 'interrupted') return issued
  if (issued.kind === 'threw') return { kind: 'unavailable', thrown: true }
  if (issued.value.outcome === 'denied') return { kind: 'refused', outcome: 'denied' }
  if (issued.value.outcome !== 'issued') return { kind: 'unavailable', thrown: false }
  return { kind: 'caller', principal: issued.value.principal, login }
}
