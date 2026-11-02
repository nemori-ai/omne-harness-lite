// `requestContextTrust`（AA 运行时对象表「请求上下文信任」、DP5-C2、DP5-C3）：受信名，只有 `request-context` 行看得见。
// 内容是两个适配：来源登记授权 `registrationAuthority` 按 DP5-C2 的次序作答，先核验主体，再比三个租户，
// 再按组件名查放行名单；波 1 名单为空，所以任何输入都不 `allowed`。主体绑定 `principalBinding` 给经核验主体的
// 稳定键（request-context-contract SPEC「独立路径」）。组件名文本自己不是凭据（DP5-C1）。
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Principal, PrincipalVerification, PrincipalVerifier } from '@omne-harness/identity'
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import {
  decodePrincipalKey,
  type PrincipalBinding,
  type SourceDecision,
  type SourceRegistrationAuthority,
} from '@omne-harness/request-context-contract'
import type { RequestContextTrust } from '@omne-harness/request-context-cordis-contract'
import {
  RequestContextTrustService,
  requestContextTrustKey,
} from '@omne-harness/request-context-cordis-contract/cordis'
import type { EntryObjectModule } from '../types.ts'
import { verifierOf } from './principals.ts'

export type RegistrationAction = 'register' | 'replace'

/** 一个放行格（DP5-C4）：持有者的组件名，它可以替哪些 `owner.owner` 做哪些动作。 */
export type RegistrationGrant = Readonly<{
  component: string
  owners: readonly string[]
  actions: readonly RegistrationAction[]
}>

/** 波 1 的放行名单为空（DP5-C3、表 3-5）。加行要同时满足 DP5-C4 的三项，只写在发行代码里。 */
export const REGISTRATION_ALLOW_LIST: readonly RegistrationGrant[] = Object.freeze([])

const DENIED: SourceDecision = Object.freeze({ kind: 'denied' })
const ALLOWED: SourceDecision = Object.freeze({ kind: 'allowed' })

async function verify(verifier: PrincipalVerifier, value: unknown): Promise<PrincipalVerification> {
  try {
    return await verifier.verify(value)
  } catch {
    return {
      kind: 'unavailable',
      diagnostic: 'the principal verifier threw an exception; its message is not reported',
    }
  }
}

export type RegistrationAuthorityOptions = Readonly<{
  verifier: PrincipalVerifier
  grants: readonly RegistrationGrant[]
}>

export function createRegistrationAuthority(
  options: RegistrationAuthorityOptions,
): SourceRegistrationAuthority<Principal> {
  const check: SourceRegistrationAuthority<Principal>['check'] = async ({
    access,
    target,
    owner,
    action,
  }) => {
    // 1. 核验器先答。不可用或抛出时答 unavailable，不改写成 denied。
    const verification = await verify(options.verifier, access.principal)
    if (verification.kind === 'unavailable')
      return { kind: 'unavailable', diagnostic: verification.diagnostic }
    if (verification.kind === 'rejected') return DENIED
    const principal = verification.principal
    // 2. 波 1 前提：代租户行事主体，三个租户相等。
    if (principal.kind !== 'acting-for-tenant') return DENIED
    if (
      !tenantEquals(principal.tenant, access.tenant) ||
      !tenantEquals(principal.tenant, target.tenant)
    )
      return DENIED
    // 3. 组件名在放行名单里。4. 动作与 owner 在该持有者的放行格内。
    const grant = options.grants.find(entry => entry.component === principal.actor.component)
    if (grant === undefined) return DENIED
    if (!grant.owners.includes(owner.owner) || !grant.actions.includes(action)) return DENIED
    return ALLOWED
  }
  return Object.freeze({ check })
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

/** 经核验主体的身份字段，顺序固定；JSON 编码使字段之间没有分隔符歧义。 */
function identityFieldsOf(principal: Principal, tenantText: string): readonly string[] {
  return principal.kind === 'system'
    ? ['system', principal.component, tenantText]
    : [
        'acting-for-tenant',
        principal.actor.component,
        tenantText,
        principal.work.owner,
        principal.work.work,
      ]
}

/**
 * 稳定主体键：同一键只指同一个经核验的主体与同一个行事租户。键是身份字段的摘要，不是对任意值的 JSON 散列：
 * 没有核验通过的值不出键。代租户行事主体的租户必须等于 `access.tenant`。
 */
export function createPrincipalBinding(
  options: Readonly<{ verifier: PrincipalVerifier }>,
): PrincipalBinding<Principal> {
  const key: PrincipalBinding<Principal>['key'] = async access => {
    const verification = await verify(options.verifier, access.principal)
    if (verification.kind === 'unavailable')
      return { kind: 'unavailable', diagnostic: verification.diagnostic }
    if (verification.kind === 'rejected') return { kind: 'denied' }
    const principal = verification.principal
    if (principal.kind === 'acting-for-tenant' && !tenantEquals(principal.tenant, access.tenant))
      return { kind: 'denied' }
    const tenant = tenantCodec.encode(access.tenant)
    if (!tenant.ok) return { kind: 'invalid', field: 'tenant', reason: 'unsupported-format' }
    const decoded = decodePrincipalKey(
      `principal_${sha256(JSON.stringify(identityFieldsOf(principal, tenant.value)))}`,
    )
    return 'failure' in decoded
      ? { kind: 'unavailable', diagnostic: 'the principal key text was refused by its codec' }
      : { kind: 'value', value: decoded.ok }
  }
  return Object.freeze({ key })
}

class EntryRequestContextTrust extends RequestContextTrustService<Principal> {
  readonly principalBinding: RequestContextTrust<Principal>['principalBinding']
  readonly registrationAuthority: RequestContextTrust<Principal>['registrationAuthority']
  constructor(ctx: Context, trust: RequestContextTrust<Principal>) {
    super(ctx)
    this.principalBinding = trust.principalBinding
    this.registrationAuthority = trust.registrationAuthority
  }
}

export const requestContextTrust: EntryObjectModule = {
  name: requestContextTrustKey,
  implementation: 'real',
  install(scope, env) {
    const verifier = verifierOf(env)
    new EntryRequestContextTrust(scope, {
      principalBinding: createPrincipalBinding({ verifier }),
      registrationAuthority: createRegistrationAuthority({
        verifier,
        grants: REGISTRATION_ALLOW_LIST,
      }),
    })
  },
}
