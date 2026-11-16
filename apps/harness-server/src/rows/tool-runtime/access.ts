import { referenceAdmissionCheck } from '@omne-harness/authorization'
import type { PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { SessionId } from '@omne-harness/session-contract'
import { canonicalDigest, type AccessVerdict, type ToolInvokeAuthority } from '@omne-harness/tool'
import type {
  LocalToolControlSubject,
  PrincipalCodec,
  PrincipalJson,
  ToolHostAccess,
} from '@omne-harness/tool-host-local'
import type { LocalToolRuntimeInput } from '@omne-harness/tool-host-local/cordis'
import { SESSION_WORK_OWNER } from '../authorization/principals.ts'
import { createToolAccessGuard } from '../authorization/tool-access.ts'
import type { ToolRuntimeHolder } from './holder.ts'
import {
  SESSION_WORK_COMPONENT,
  sessionWorkOf,
  verifySessionWork,
  type VerifiedSessionWork,
} from './session-work.ts'

export const AGENT_CONSUMER_OWNER = '@omne-harness/agent'
export const AGENT_CONSUMER_PURPOSE = 'action'
const deniedSubject = () => fail({ kind: 'denied' as const, action: 'tool-subject' })
const unavailableSubject = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency: 'principalVerifier', diagnostic })

function identityPorts(holder: ToolRuntimeHolder) {
  const verifier: PrincipalVerifier = {
    verify: value => {
      const current = holder.verifier()
      return current === undefined
        ? Promise.resolve({ kind: 'unavailable' as const, diagnostic: 'principal verifier absent' })
        : current.verify(value)
    },
  }
  const standing: TenantStandingSource = {
    read: input => {
      const current = holder.standing()
      if (current === undefined) throw new Error('tenant standing is not installed')
      return current.read(input)
    },
  }
  return { verifier, standing }
}

async function projectWith(
  verifier: PrincipalVerifier,
  principal: unknown,
): ReturnType<LocalToolRuntimeInput['subjects']['project']> {
  const verdict = await verifySessionWork(verifier, principal)
  if (verdict.kind === 'unavailable') return unavailableSubject(verdict.diagnostic)
  if (verdict.kind === 'denied') return deniedSubject()
  const subject: LocalToolControlSubject = {
    tenant: verdict.principal.tenant,
    kind: 'acting-for-tenant',
    actor: { component: SESSION_WORK_COMPONENT },
    work: { owner: SESSION_WORK_OWNER, work: verdict.session },
  }
  return succeed(subject)
}

function encodePrincipal(principal: unknown): PrincipalJson {
  const work = sessionWorkOf(principal)
  if (work === undefined)
    throw new TypeError('Only a session work principal is kept in an invocation source')
  const tenant = work.principal.tenant
  return {
    kind: 'acting-for-tenant',
    actor: { kind: 'system', component: SESSION_WORK_COMPONENT },
    work: { owner: SESSION_WORK_OWNER, work: work.session },
    tenant: {
      name: 'TenantId',
      organization: { name: 'OrganizationId', text: tenant.organization.text },
      account: { name: 'AccountId', text: tenant.account.text },
    },
  }
}

export const releasePrincipalCodec: PrincipalCodec<unknown> = Object.freeze({
  encode: encodePrincipal,
  // The decoded value is data, never a live principal: `samePrincipal` compares encodings only.
  decode: (value: PrincipalJson) => succeed<unknown>(value),
})

export type ReleaseToolIdentity = Readonly<{
  access: ToolHostAccess<unknown>
  subjects: LocalToolRuntimeInput['subjects']
  sourceAuthority: ToolInvokeAuthority<unknown>
  sessionOf(principal: unknown, tenant: TenantId): Promise<string | undefined>
  sessionWork(principal: unknown, tenant: TenantId): Promise<VerifiedSessionWork>
}>

export function createReleaseToolIdentity(holder: ToolRuntimeHolder): ReleaseToolIdentity {
  const { verifier, standing } = identityPorts(holder)
  const admission = referenceAdmissionCheck({ verifier, standing, permits: null })
  const guard = createToolAccessGuard(() => admission)
  const project = (principal: unknown) => projectWith(verifier, principal)

  const sessionWork = (principal: unknown, tenant: TenantId) =>
    verifySessionWork(verifier, principal, tenant)
  const sessionOf = async (principal: unknown, tenant: TenantId) => {
    const verdict = await sessionWork(principal, tenant)
    return verdict.kind === 'session' ? verdict.session : undefined
  }

  const subjects: LocalToolRuntimeInput['subjects'] = {
    project,
    async resolveSessionWork(input) {
      const work = holder.workPrincipals()
      if (work === undefined)
        return fail({
          kind: 'unavailable',
          dependency: 'sessionWorkPrincipals',
          diagnostic: 'the session work principal source is not installed',
        })
      try {
        const session = input.session as SessionId
        const issued = await work.forSession({
          actor: 'coordinator',
          tenant: input.tenant,
          session,
        })
        if ('ok' in issued) return succeed<unknown>(issued.ok)
        return issued.failure.kind === 'denied'
          ? fail({ kind: 'denied', action: 'tool-session-work' })
          : fail({
              kind: 'unavailable',
              dependency: 'sessionWorkPrincipals',
              diagnostic: `the session work principal was not issued: ${issued.failure.kind}${issued.failure.kind === 'unavailable' ? ` (${issued.failure.owner}: ${issued.failure.diagnostic})` : ''}`,
            })
      } catch {
        return fail({
          kind: 'unavailable',
          dependency: 'sessionWorkPrincipals',
          diagnostic: 'the session work principal source threw',
        })
      }
    },
  }

  const sourceAuthority: ToolInvokeAuthority<unknown> = {
    async qualify(input): Promise<AccessVerdict> {
      const projected = await project(input.principal)
      if ('failure' in projected)
        return projected.failure.kind === 'denied'
          ? { kind: 'denied', reason: 'not-a-session-work-principal' }
          : { kind: 'unavailable', diagnostic: 'principal verifier unavailable' }
      if (!tenantEquals(projected.ok.tenant, input.tenant))
        return { kind: 'denied', reason: 'foreign-tenant' }
      return input.consumer.owner === AGENT_CONSUMER_OWNER &&
        input.consumer.purpose === AGENT_CONSUMER_PURPOSE
        ? { kind: 'allowed' }
        : { kind: 'denied', reason: 'not-an-agent-action-consumer' }
    },
    async samePrincipal({ current, original }): Promise<AccessVerdict> {
      const projected = await project(current)
      if ('failure' in projected)
        return projected.failure.kind === 'denied'
          ? { kind: 'denied', reason: 'not-a-session-work-principal' }
          : { kind: 'unavailable', diagnostic: 'principal verifier unavailable' }
      try {
        return canonicalDigest(encodePrincipal(current)) === canonicalDigest(original)
          ? { kind: 'allowed' }
          : { kind: 'denied', reason: 'different-original-subject' }
      } catch {
        return { kind: 'denied', reason: 'different-original-subject' }
      }
    },
  }

  return Object.freeze({
    access: { guard, start: guard },
    subjects,
    sourceAuthority,
    sessionOf,
    sessionWork,
  })
}
