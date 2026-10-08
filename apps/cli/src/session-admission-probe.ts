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

/** Trusted host adapter. The borrowed client owns the actual governance transport. */
export function createSessionAdmissionProbe(
  client: GovernanceClientOperations,
  source: AdmissionSource,
  tenant: TenantId,
): AdmissionProbe {
  const fixedSource = parseRunLoginBinding(source),
    fixedTenant = parseTenantId(tenant)
  if (!fixedSource || !isOk(fixedTenant) || fixedTenant.ok.account !== fixedSource.accountId)
    throw new TypeError('Invalid governance admission construction')
  const expected = Object.freeze(fixedSource),
    ownedTenant = fixedTenant.ok
  return Object.freeze<AdmissionProbe>({
    verify: async (candidate, requested) => {
      if (!matchesSource(expected, candidate) || !tenantIdEquals(ownedTenant, requested.tenant))
        return unavailable
      if (!['createSession', 'startRun'].includes(requested.purpose)) return unavailable
      const opened = await client.openUse()
      if (opened.kind !== 'use') return unavailable
      return usingGovernanceUse(opened.use, async use => {
        if (!matchesSource(expected, opened.origin)) return unavailable
        if (requested.purpose === 'startRun') {
          const result = await readNewRunLogin(use, expected)
          return result.kind === 'observed' ? { kind: 'valid' } : rejection(result)
        }
        const result = await readNewSessionIdentity(use)
        return sessionDecision(result, expected, requested)
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
