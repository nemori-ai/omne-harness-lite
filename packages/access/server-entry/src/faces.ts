// The ports this member needs from its neighbours, declared in this member's own words. The real
// Session service satisfies `SessionIngressFaces` structurally; the definition mapping is a
// function the assembly injects (the `definition-mappings` member owns the mapping data).
import type {
  HumanInterventionCommands,
  HumanInterventionQueries,
  OperationRef,
  SubmitReply,
} from '@omne-harness/human-intervention'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type { AccountId, TenantId } from '@omne-harness/legal-identity'
import type {
  Adoption,
  SavedModelSelection,
  SessionHistory,
  SessionManagement,
  SessionWork,
} from '@omne-harness/session-contract'

/** The subset of the Session faces that the public session operations reach. */
export type SessionIngressFaces<P> = Readonly<{
  management: Pick<SessionManagement<P>, 'create'>
  work: Pick<SessionWork<P>, 'accept' | 'queryOperation' | 'cancelRun' | 'stopCall'>
  history: Pick<SessionHistory<P>, 'begin' | 'next'>
}>

/**
 * What the deployment mapping resolves a public definition name into: the parts of a
 * `SessionCreation` that the public message does not carry. `modes` take the tenant default whose
 * source is `tenantDefaults`.
 */
export type ResolvedDefinition = Readonly<{
  candidate: Adoption
  execution: Adoption
  entryContract: Adoption
  requiredIdentities: readonly Readonly<{ capability: string; name: string }>[]
  tenantDefaults: Adoption
  initialModelSelection?: SavedModelSelection
}>

/** Resolves a definition name. `undefined` means the name is outside the deployment set. */
export type DefinitionResolver = (definition: string) => ResolvedDefinition | undefined

/**
 * HITL 位置经过的窄入口面（SPEC「HITL 位置」）。真实的 HITL 应用在结构上满足它。
 * `bindSubmitReply` 是 HITL 提供者对一条 `submitReply` 命令的绑定：原操作身份与输入摘要。
 */
export type HitlIngressFaces<P> = Readonly<{
  queries: Pick<HumanInterventionQueries<P>, 'listPool' | 'getCard' | 'getOperation'>
  commands: Pick<HumanInterventionCommands<P>, 'submitReply'>
  bindSubmitReply(
    command: SubmitReply,
  ): Readonly<{ operationRef: OperationRef; inputDigest: string }>
}>

/** 入口主体持有者的一次签发结果。`refused` 表示持有者不签发，接入不追问原因。 */
export type HitlEntryIssue =
  | Readonly<{ kind: 'issued'; principal: ActingForTenantPrincipal }>
  | Readonly<{ kind: 'refused' }>

/**
 * 装配给的入口主体持有者 `hitlEntryPrincipals`（identity「持有者与关系核对位置」）。接入只在同一次
 * 请求的登录识别成功、且目标租户的账号等于识别出的账号之后调用它，并只交出这两项，不交出登录。
 * 签发的主体是 `{ actor: server-entry, tenant, work: { owner: 'harness.hitl', work: 'cards' } }`。
 */
export type HitlEntryPrincipals = Readonly<{
  issue(input: Readonly<{ account: AccountId; tenant: TenantId }>): Promise<HitlEntryIssue>
}>
