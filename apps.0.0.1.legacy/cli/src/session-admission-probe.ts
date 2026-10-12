import type {
  GovernanceClientOperations,
  Origin,
} from '@omne-harness-lite/governance-client-operations'
import {
  parseTenantId,
  tenantIdEquals,
  isOk,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import type {
  AdmissionProbe,
  AdmissionSource,
  AdmissionTarget,
  RuntimeOptions,
} from '@omne-harness-lite/session-runtime-local'
import {
  parseRunLoginBinding,
  readNewSessionIdentity,
  readNewRunLogin,
  type SessionPreparationOutcome,
} from './session-preparation.ts'
import { usingGovernanceUse } from './governance-use-work.ts'

const unavailable = Object.freeze({ kind: 'unavailable' } as const)
type Decision = Awaited<ReturnType<AdmissionProbe['verify']>>
type SourceReading = Awaited<ReturnType<NonNullable<RuntimeOptions['readAdmissionSource']>>>

/** Trusted host adapter. The borrowed client owns the actual governance transport. */
export function createSessionAdmissionProbe(
  client: GovernanceClientOperations,
  source: AdmissionSource,
  tenant: TenantId,
): AdmissionProbe & { readonly currentSource: NonNullable<RuntimeOptions['readAdmissionSource']> } {
  const fixedSource = parseRunLoginBinding(source),
    fixedTenant = parseTenantId(tenant)
  if (!fixedSource || !isOk(fixedTenant) || fixedTenant.ok.account !== fixedSource.accountId)
    throw new TypeError('Invalid governance admission construction')
  const expected = Object.freeze(fixedSource),
    ownedTenant = fixedTenant.ok
  return Object.freeze({
    currentSource: async (): Promise<SourceReading> => {
      const opened = await client.openUse()
      if (opened.kind !== 'use')
        return { failure: opened.reason === 'not-logged-in' ? 'loginRequired' : 'unavailable' }
      return usingGovernanceUse<SourceReading>(opened.use, async () => {
        const value = parseRunLoginBinding(opened.origin)
        return value &&
          value.centerId === expected.centerId &&
          value.accountId === expected.accountId
          ? { source: value }
          : { failure: 'loginRequired' }
      })
    },
    verify: async (candidate: AdmissionSource, requested: AdmissionTarget): Promise<Decision> => {
      if (
        expected.centerId !== candidate.centerId ||
        expected.accountId !== candidate.accountId ||
        !tenantIdEquals(ownedTenant, requested.tenant)
      )
        return unavailable
      if (!['createSession', 'startRun'].includes(requested.purpose)) return unavailable
      const opened = await client.openUse()
      if (opened.kind !== 'use') return unavailable
      return usingGovernanceUse(opened.use, async use => {
        if (!matchesSource(candidate, opened.origin)) return unavailable
        if (requested.purpose === 'startRun') {
          const result = await readNewRunLogin(use, candidate)
          return result.kind === 'observed' ? { kind: 'valid' } : rejection(result)
        }
        const result = await readNewSessionIdentity(use)
        return sessionDecision(result, candidate, requested)
      })
    },
  })
}
function rejection(result: Extract<SessionPreparationOutcome, { kind: 'blocked' }>): Decision {
  if (result.reason === 'login-rejected') return { kind: 'rejected' }
  if (result.reason === 'membership-ineffective') return { kind: 'memberRejected' }
  return unavailable
}
function sessionDecision(
  result: SessionPreparationOutcome,
  source: AdmissionSource,
  target: AdmissionTarget,
): Decision {
  if (result.kind === 'blocked') return rejection(result)
  if (
    !matchesSource(source, result.identity) ||
    !tenantIdEquals(target.tenant, result.identity.tenant)
  )
    return unavailable
  return { kind: 'memberValid', role: result.identity.role }
}
function matchesSource(expected: AdmissionSource, candidate: Origin): boolean {
  return (
    expected.centerId === candidate.centerId &&
    expected.accountId === candidate.accountId &&
    expected.loginStateHandle === candidate.loginStateHandle
  )
}
