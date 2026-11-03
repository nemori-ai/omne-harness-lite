// Tool 运行时组的身份一侧（B 段）：当前资格、控制主体投影、Session 工作主体的重签、来源资格与主体编码。
// 全部逐次读当前提供者，缺席或抛出答 `unavailable`，不默认放行：
// - 资格：`authorization` 行已有的 `createToolAccessGuard`，底下是 identity 的参考准入核验（核验主体与租户存续）。
// - 控制主体投影 `project`：主体经 `principalVerifier` 核验，是会话工作主体才投影；其余答 denied。判定只有
//   `session-work.ts` 一份，与 Tool 请求供给者同口径。
// - 重签 `resolveSessionWork`：经入口的会话工作主体（`sessionWorkPrincipals.forSession`）签发，`tool-records` 行
//   在受信上下文里交来读口；缺席答 unavailable。
// - 来源资格 `qualify`：调用方是本租户的会话工作主体，consumer 是 Agent 的动作消费位置（Agent `toolConsumer`）。
//   consumer 指名的执行是否属于该会话本波不核对（具名缺件 TOOL-B-GAP-CONSUMER-SESSION），跨租户仍被拒。
import type { Context } from '@deepseek-ai/cordis'
import { referenceAdmissionCheck } from '@omne-harness/authorization'
import type { PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import { principalVerifierKey, tenantStandingKey } from '@omne-harness/identity/cordis'
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
import { SESSION_WORK_COMPONENT, sessionWorkOf, verifySessionWork } from './session-work.ts'

/** Agent 的 Tool 动作 consumer（`@omne-harness/agent` 的 `toolConsumer`）。 */
export const AGENT_CONSUMER_OWNER = '@omne-harness/agent'
export const AGENT_CONSUMER_PURPOSE = 'action'
const deniedSubject = () => fail({ kind: 'denied' as const, action: 'tool-subject' })
const unavailableSubject = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency: 'principalVerifier', diagnostic })

/** 每次调用现取的核验器与租户存续读口。 */
function identityPorts(ctx: Context) {
  const verifier: PrincipalVerifier = {
    verify: value => {
      const current = ctx.get(principalVerifierKey)
      return current === undefined
        ? Promise.resolve({ kind: 'unavailable' as const, diagnostic: 'principal verifier absent' })
        : current.verify(value)
    },
  }
  const standing: TenantStandingSource = {
    read: input => {
      const current = ctx.get(tenantStandingKey)
      if (current === undefined) throw new Error('tenant standing is not installed')
      return current.read(input)
    },
  }
  return { verifier, standing }
}

/** 经核验的会话工作主体投影成控制主体（判定在 `session-work.ts`，与 Tool 请求供给者同一份）。 */
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

/** 主体的 JSON 形式：会话工作主体的结构字段，租户按 TenantId 的结构写出。 */
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
  /** 主体经核验是这个租户的会话工作主体时给出会话 id。 */
  sessionOf(principal: unknown, tenant: TenantId): Promise<string | undefined>
}>

/** `ctx` 是读根上公开服务的任一行上下文；会话工作主体读口来自 `holder`（`tool-records` 交来）。 */
export function createReleaseToolIdentity(
  ctx: Context,
  holder: ToolRuntimeHolder,
): ReleaseToolIdentity {
  const { verifier, standing } = identityPorts(ctx)
  const admission = referenceAdmissionCheck({ verifier, standing, permits: null })
  const guard = createToolAccessGuard(() => admission)
  const project = (principal: unknown) => projectWith(verifier, principal)

  const sessionOf = async (principal: unknown, tenant: TenantId) => {
    const verdict = await verifySessionWork(verifier, principal, tenant)
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
        // The session text comes from the original invocation source, which Session's own principal named.
        const session = input.session as SessionId
        // The Tool runtime continues the original call for the coordinator that started it.
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

  return Object.freeze({ access: { guard, start: guard }, subjects, sourceAuthority, sessionOf })
}
