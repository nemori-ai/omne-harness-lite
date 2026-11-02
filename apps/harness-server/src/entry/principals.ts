// 进程内主体权威（DP1-C17、identity SPEC ID-16）。本模块是整个应用里唯一创建并持有签发者的地方：
// 经 `env.once` 取得一次运行内的一份权威，按 DP-1 表 3-3 签发入口自己的系统主体，安装核验器视图
// `principalVerifier`、Session 内部主体 `sessionPrincipals`，并在签发作用域安装给 `server-entry` 的
// `principalIssuer`。别的入口模块只拿 `verifierOf(env)` 的核验器视图，或 `sessionWorkIssuerOf(env)` 这个
// 只能签会话工作主体的窄视图；两者都铸不出组件名（DP5-C1 的前提）。签发者不出现在任何记录与输出里。
import type { Context } from '@deepseek-ai/cordis'
import {
  inProcessPrincipalAuthority,
  type ActingForTenantPrincipal,
  type IssueFailure,
  type Principal,
  type PrincipalIssuer,
  type PrincipalVerifier,
  type SystemPrincipal,
} from '@omne-harness/identity'
import {
  PrincipalIssuerService,
  PrincipalVerifierService,
  principalIssuerKey,
  principalVerifierKey,
} from '@omne-harness/identity/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import {
  SessionInternalPrincipalsService,
  sessionPrincipalsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import type { EntryEnv, EntryObjectModule } from '../types.ts'

/** 入口自己签发的组件名（DP-1 表 3-3，取名规则 DP5-C5：服务键.字段名，或服务键本身）。 */
export const ENTRY_COMPONENTS = Object.freeze({
  sessionCoordinator: 'sessionPrincipals.coordinator',
  sessionMaintainer: 'sessionPrincipals.maintainer',
  sessionWork: 'sessionWorkPrincipals',
})

/** 会话工作主体的原工作：工作拥有者是 Session，工作文本是会话 id（AA 运行时对象表「会话工作主体」）。 */
const SESSION_WORK_OWNER = 'session'

type EntryPrincipals = Readonly<{
  issuer: PrincipalIssuer
  verifier: PrincipalVerifier
  coordinator: SystemPrincipal
  maintainer: SystemPrincipal
  /** 会话工作主体的 `actor`：一个系统主体，组件名 `sessionWorkPrincipals`。 */
  sessionWorkActor: SystemPrincipal
}>

function issueSystem(issuer: PrincipalIssuer, component: string): SystemPrincipal {
  const issued = issuer.issueSystem({ component })
  if ('failure' in issued)
    throw new Error(
      `principals: the authority refused the entry component "${component}" (${issued.failure.field}: ${issued.failure.reason})`,
    )
  return issued.ok
}

/** 一次运行的权威与入口自己的系统主体，全部在这里一次签好。 */
function createEntryPrincipals(): EntryPrincipals {
  const { issuer, verifier } = inProcessPrincipalAuthority()
  return Object.freeze({
    issuer,
    verifier,
    coordinator: issueSystem(issuer, ENTRY_COMPONENTS.sessionCoordinator),
    maintainer: issueSystem(issuer, ENTRY_COMPONENTS.sessionMaintainer),
    sessionWorkActor: issueSystem(issuer, ENTRY_COMPONENTS.sessionWork),
  })
}

// 符号与工厂都不导出：`once` 以同一个 `createEntryPrincipals` 引用取回同一份权威（DP1-C17）。
const PRINCIPALS = Symbol('harness-server/entry-principals')

function principalsOf(env: EntryEnv): EntryPrincipals {
  return env.once(PRINCIPALS, createEntryPrincipals)
}

/** 核验器视图：别的入口模块取核验器的唯一入口，拿不到签发者。 */
export function verifierOf(env: EntryEnv): PrincipalVerifier {
  return principalsOf(env).verifier
}

/** 只签会话工作主体的窄视图：`actor` 与 `work.owner` 固定，调用方只给租户与会话文本。 */
export type SessionWorkIssue = (
  input: Readonly<{ tenant: TenantId; session: string }>,
) => Outcome<ActingForTenantPrincipal, IssueFailure>

export function sessionWorkIssuerOf(env: EntryEnv): SessionWorkIssue {
  const { issuer, sessionWorkActor } = principalsOf(env)
  return ({ tenant, session }) =>
    issuer.issueActingForTenant({
      actor: sessionWorkActor,
      tenant,
      work: { owner: SESSION_WORK_OWNER, work: session },
    })
}

// 三个服务都只持有闭包，不把权威或签发者放在实例属性上。类里不用 `#` 私有字段（经调用方代理时 `this` 不是实例本身）。

class EntryPrincipalVerifier extends PrincipalVerifierService {
  readonly verify: PrincipalVerifier['verify']
  constructor(ctx: Context, verifier: PrincipalVerifier) {
    super(ctx)
    this.verify = value => verifier.verify(value)
  }
}

class EntryPrincipalIssuer extends PrincipalIssuerService {
  readonly issueSystem: PrincipalIssuer['issueSystem']
  readonly issueActingForTenant: PrincipalIssuer['issueActingForTenant']
  constructor(ctx: Context, issuer: PrincipalIssuer) {
    super(ctx)
    this.issueSystem = input => issuer.issueSystem(input)
    this.issueActingForTenant = input => issuer.issueActingForTenant(input)
  }
}

class EntrySessionPrincipals extends SessionInternalPrincipalsService<Principal> {
  readonly coordinator: Principal
  readonly maintainer: Principal
  constructor(ctx: Context, principals: Pick<EntryPrincipals, 'coordinator' | 'maintainer'>) {
    super(ctx)
    this.coordinator = principals.coordinator
    this.maintainer = principals.maintainer
  }
}

/** 核验器：根上的入口对象，`authorization`、`session-ad09`、`server-entry` 按名取。只证明来源。 */
export const principalVerifier: EntryObjectModule = {
  name: principalVerifierKey,
  implementation: 'real',
  install(scope, env) {
    new EntryPrincipalVerifier(scope, verifierOf(env))
  },
}

/** 签发者：受信名，受信表只让 `server-entry` 行看见（ID-16 的受信具名持有者）。 */
export const principalIssuer: EntryObjectModule = {
  name: principalIssuerKey,
  implementation: 'real',
  install(scope, env) {
    new EntryPrincipalIssuer(scope, principalsOf(env).issuer)
  },
}

/** Session 协调器与维护者的系统主体，给 `session-provider` 的 `sessionPrincipals`。 */
export const sessionPrincipals: EntryObjectModule = {
  name: sessionPrincipalsKey,
  implementation: 'real',
  install(scope, env) {
    new EntrySessionPrincipals(scope, principalsOf(env))
  },
}
