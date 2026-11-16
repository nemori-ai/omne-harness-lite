import type { PrincipalVerification, PrincipalVerifier } from '@omne-harness/identity'
import { tenantEquals } from '@omne-harness/legal-identity'
import type {
  AccountingOptions,
  AccountingSourceAuthority,
  Adoption,
  AdoptedRead,
  AdoptedRequestFact,
  AdoptedRequestSource,
  ContextReadEligibility,
  GroupToken,
  RecoveryAuthority,
  SourceDecision,
  SourceRead,
} from '@omne-harness/request-context-contract'
import type {
  ContextHolderParts,
  ContextHolderSources,
} from '@omne-harness/request-context-cordis-contract'

export const ACCOUNTING_GAPS = Object.freeze({
  recoveryAuthority:
    'B1-GAP-ACCOUNTING-RECOVERY-AUTHORITY: the release has no authority for rebuilding accounts',
})

export const ACCOUNT_OUTLET_SENDER: Adoption = Object.freeze({
  owner: '@omne-harness/agent-context',
  name: 'account-outlet',
  revision: '1',
  digest: 'agent-context:account-outlet/1',
})

export const ACCOUNTING_DENIALS = Object.freeze({
  principal: 'accounting source: the principal of the access is not verified',
  system:
    'accounting source: the principal is not an acting-for-tenant principal of the access tenant',
  tenant: 'accounting source: the tenants of the access, the target and the call differ',
  sender: 'accounting source: the sender is not the configured agent-account-outlet adoption',
  operation: 'accounting read eligibility: only the accounts operation is admitted',
  eligibility: 'accounting read eligibility: the holder eligibility denied the access',
})

export type AccountingDiagnose = (diagnostic: string) => void

export type AccountingTrace = (diagnostic: string) => void

const DENIED = Object.freeze({ kind: 'denied' as const })
const ALLOWED: SourceDecision = Object.freeze({ kind: 'allowed' })
const unavailable = (diagnostic: string) => ({ kind: 'unavailable' as const, diagnostic })

function sameAdoption(left: Adoption, right: Adoption): boolean {
  return (
    left.owner === right.owner &&
    left.name === right.name &&
    left.revision === right.revision &&
    left.digest === right.digest
  )
}

export type OutletSourceAuthorityOptions = Readonly<{
  readVerifier: () => PrincipalVerifier | undefined
  sender: Adoption
  diagnose: AccountingDiagnose
  trace: AccountingTrace
}>

export function createOutletSourceAuthority(
  options: OutletSourceAuthorityOptions,
): AccountingSourceAuthority<unknown> {
  const deny = (diagnostic: string) => {
    options.diagnose(diagnostic)
    return DENIED
  }
  const check: AccountingSourceAuthority<unknown>['check'] = async ({ access, input }) => {
    let verification: PrincipalVerification
    try {
      const verifier = options.readVerifier()
      if (verifier === undefined)
        return unavailable('accounting source: no principalVerifier is running')
      verification = await verifier.verify(access.principal)
    } catch {
      options.trace('accounting source: the principal verifier threw')
      return unavailable(
        'accounting source: the principal verifier threw; its message is not reported',
      )
    }
    if (verification.kind === 'unavailable')
      return unavailable(`accounting source: principal verifier: ${verification.diagnostic}`)
    if (verification.kind !== 'verified') return deny(ACCOUNTING_DENIALS.principal)
    const principal = verification.principal
    if (principal.kind !== 'acting-for-tenant' || !tenantEquals(principal.tenant, access.tenant))
      return deny(ACCOUNTING_DENIALS.system)
    if (
      !tenantEquals(access.tenant, input.target.tenant) ||
      !tenantEquals(access.tenant, input.call.tenant)
    )
      return deny(ACCOUNTING_DENIALS.tenant)
    if (input.origin.producer !== 'model' || !sameAdoption(input.origin.sender, options.sender))
      return deny(ACCOUNTING_DENIALS.sender)
    return ALLOWED
  }
  return Object.freeze({ check })
}

export type HolderReadEligibilityOptions = Readonly<{
  readHolder: () => ContextHolderSources<unknown> | undefined
  diagnose: AccountingDiagnose
  trace: AccountingTrace
}>

const SETTLED = Object.freeze({ kind: 'settled' as const })

export function createHolderReadEligibility(
  options: HolderReadEligibilityOptions,
): ContextReadEligibility<unknown> {
  const check: ContextReadEligibility<unknown>['check'] = async input => {
    if (input.operation !== 'accounts') {
      options.trace(ACCOUNTING_DENIALS.operation)
      return DENIED
    }
    let holder: ContextHolderSources<unknown> | undefined
    try {
      holder = options.readHolder()
    } catch {
      options.trace('accounting read eligibility: reading the holder threw')
      holder = undefined
    }
    if (holder === undefined)
      return unavailable('accounting read eligibility: no contextHolderSources holder is running')
    let leased: ReturnType<ContextHolderSources<unknown>['lease']>
    try {
      leased = holder.lease({ settle: () => Promise.resolve(SETTLED) })
    } catch {
      options.trace('accounting read eligibility: the holder lease threw')
      return unavailable('accounting read eligibility: the holder lease threw')
    }
    if (leased.kind !== 'leased')
      return unavailable(`accounting read eligibility: holder lease: ${leased.diagnostic}`)
    try {
      const answer = await leased.lease.parts.eligibility.check(input)
      if (answer.kind === 'denied') options.diagnose(ACCOUNTING_DENIALS.eligibility)
      return answer
    } catch {
      options.trace('accounting read eligibility: the holder eligibility threw')
      return unavailable('accounting read eligibility: the holder eligibility threw')
    } finally {
      leased.lease.release()
    }
  }
  return Object.freeze({ check })
}

export type HolderAdoptedSourceOptions = Readonly<{
  readHolder: () => ContextHolderSources<unknown> | undefined
  trace: AccountingTrace
}>

export const HOLDER_ADOPTED_AUTHORITY: Adoption = Object.freeze({
  owner: '@omne-harness/harness-server',
  name: 'request-context/holder-adopted',
  revision: '1',
  digest: 'harness-server:request-context/holder-adopted/1',
})

export function createHolderAdoptedSource(
  options: HolderAdoptedSourceOptions,
): AdoptedRequestSource<unknown> {
  const through = async <T>(
    what: string,
    read: (adopted: ContextHolderParts<unknown>['adopted']) => Promise<SourceRead<T>>,
  ): Promise<SourceRead<T>> => {
    let holder: ContextHolderSources<unknown> | undefined
    try {
      holder = options.readHolder()
    } catch {
      options.trace(`accounting adopted source: reading the holder threw (${what})`)
      holder = undefined
    }
    if (holder === undefined)
      return unavailable('accounting adopted source: no contextHolderSources holder is running')
    let leased: ReturnType<ContextHolderSources<unknown>['lease']>
    try {
      leased = holder.lease({ settle: () => Promise.resolve(SETTLED) })
    } catch {
      options.trace(`accounting adopted source: the holder lease threw (${what})`)
      return unavailable('accounting adopted source: the holder lease threw')
    }
    if (leased.kind !== 'leased')
      return unavailable(`accounting adopted source: holder lease: ${leased.diagnostic}`)
    try {
      return await read(leased.lease.parts.adopted)
    } catch {
      options.trace(`accounting adopted source: the holder adopted part threw (${what})`)
      return unavailable('accounting adopted source: the holder adopted part threw')
    } finally {
      leased.lease.release()
    }
  }
  return Object.freeze({
    authority: HOLDER_ADOPTED_AUTHORITY,
    readCount: (input: AdoptedRead<unknown>): Promise<SourceRead<GroupToken>> =>
      through('readCount', adopted => adopted.readCount(input)),
    readSource: (input: AdoptedRead<unknown>): Promise<SourceRead<AdoptedRequestFact | null>> =>
      through('readSource', adopted => adopted.readSource(input)),
  })
}

export const gapRecoveryAuthority: RecoveryAuthority<unknown> = Object.freeze({
  check: async () => unavailable(ACCOUNTING_GAPS.recoveryAuthority),
  checkFact: async () => unavailable(ACCOUNTING_GAPS.recoveryAuthority),
})

export type ReleaseAccountingPorts = Readonly<{
  readVerifier: OutletSourceAuthorityOptions['readVerifier']
  readHolder: HolderReadEligibilityOptions['readHolder']
  diagnose: AccountingDiagnose
  trace: AccountingTrace
}>

export function releaseAccounting(
  limits: AccountingOptions<unknown>['limits'],
  ports: ReleaseAccountingPorts,
): AccountingOptions<unknown> {
  return {
    sourceAuthority: createOutletSourceAuthority({
      readVerifier: ports.readVerifier,
      sender: ACCOUNT_OUTLET_SENDER,
      diagnose: ports.diagnose,
      trace: ports.trace,
    }),
    readEligibility: createHolderReadEligibility({
      readHolder: ports.readHolder,
      diagnose: ports.diagnose,
      trace: ports.trace,
    }),
    adoptedSource: createHolderAdoptedSource({
      readHolder: ports.readHolder,
      trace: ports.trace,
    }),
    recoveryAuthority: gapRecoveryAuthority,
    limits,
  }
}
