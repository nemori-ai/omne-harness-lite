// HITL 的单机宿主：每个租户事务域一个 HITL 应用，与会话组合同一个事务域与组合（HITL 的参加者与
// `session.run-live` 守卫都在会话组合里，见 `rows/session-storage/composite.ts`）。宿主还提供 Identity 的封口目的端
// 与受信的等待准备（准备由原工作拥有者直接提交，HITL 的身份门控路径不受理它）。
import { randomBytes } from 'node:crypto'
import type { CardRef, Origin } from '@omne-harness/human-intervention'
import {
  createHitlStandingDestination,
  createIndependentHitlApplication,
  independentControlCommands,
  type IndependentCommand,
} from '@omne-harness/human-intervention-local'
import type {
  ActingForTenantPrincipal,
  PrincipalVerifier,
  StandingDestinationResolver,
  StandingReservations,
  TenantStandingSource,
} from '@omne-harness/identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import { runLiveGuardFacts } from '@omne-harness/session-storage-sql/participants'
import type {
  CommitResultV2,
  DomainRef,
  FactCommandV2,
  SqlStorage,
  TenantDomainLookup,
} from '@omne-harness/sql-contract'
import { canonicalDigest } from '@omne-harness/tool'

/** 本发行 HITL 的固定目的端名与读位置。 */
export const HITL_DESTINATION = 'harness.hitl'
export const HITL_LOCATION = 'local'
/** Identity 保留绑定里 HITL 写的拥有者名（human-intervention-local `identity.ts`）。 */
const HITL_RESERVATION_OWNER = 'human-intervention'

export type HitlApplication = ReturnType<typeof createIndependentHitlApplication>

/**
 * 原工作的守卫：来源带会话与 Run 时，Session 的 `session.run-live` 在同一笔提交里核对会话未归档、该 Run 仍在进行。
 * 只有会话没有 Run 的来源得到空清单，HITL 据此答 `session-guard-missing`：本发行的 Tool 来源总带 Run。
 */
export function toolOriginGuards(tenant: string): (origin: Origin) => readonly FactCommandV2[] {
  return origin =>
    origin.sessionRef === undefined || origin.runRef === undefined
      ? []
      : [runLiveGuardFacts({ tenant, session: origin.sessionRef, run: origin.runRef })]
}

export type ToolHitlHostInput = Readonly<{
  storage: SqlStorage
  domains: TenantDomainLookup
  combination: Readonly<{ combinationVersion: string; manifestDigest: string }>
  verifier: () => PrincipalVerifier | undefined
  standing: () => TenantStandingSource | undefined
  reservations: () => StandingReservations | undefined
  /**
   * 一次答复成为卡片的有效决定之后调用（HITL 答 decided）。它只是唤醒提示：抛出与失败都不改变答复的结果，
   * 原工作的正确性不依赖它。
   */
  decided?: (
    input: Readonly<{
      application: HitlApplication
      access: ActingForTenantPrincipal
      card: CardRef
    }>,
  ) => void
}>

type Tenant = Readonly<{
  domain: DomainRef
  application: HitlApplication
  destination: StandingDestinationResolver
}>

export type TenantHitl =
  | Readonly<{ kind: 'ready'; tenant: Tenant }>
  /** 目录的已发布快照里没有这个租户：它还没有事务域，所以也没有任何卡片。 */
  | Readonly<{ kind: 'unregistered' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type ToolHitlHost = Readonly<{
  /** 租户的 HITL 应用与它的事务域。目录不含该租户或 Identity 的读口缺席时答 unavailable。 */
  tenant(tenant: string): Promise<TenantHitl>
  /** 受信准备一个等待：一笔 SQL 提交，同一操作键与输入认回原回执。 */
  prepare(
    tenant: Tenant,
    command: Extract<IndependentCommand, { kind: 'prepare' }>,
  ): Promise<CommitResultV2>
  /** Identity 的封口目的端里属于 HITL 的那一份。 */
  destination: StandingDestinationResolver
  /**
   * 还没有事务域的租户的读者资格：与 HITL local 的身份资格判断同一条规则（Identity 核验主体、主体的租户是这个租户、
   * 租户的当前成员资格）。有事务域的租户由它的 HITL 应用自己判断。
   */
  qualify(tenant: string, principal: ActingForTenantPrincipal): Promise<Qualification>
  close(): Promise<void>
}>

export type Qualification =
  | Readonly<{ kind: 'qualified' }>
  | Readonly<{ kind: 'denied'; reason: string }>
  | Readonly<{ kind: 'unavailable'; reason: string }>

/** 一笔准备的 SQL 操作键：由原操作身份决定，同一准备重送时认回原回执。 */
function prepareKey(command: Extract<IndependentCommand, { kind: 'prepare' }>): string {
  return canonicalDigest(['tool-hitl/prepare', command.operation]).replace(/^sha256:/, '')
}

/**
 * 应用的答复在成为有效决定之后交给 `decided`。只有 decided 是这次答复成立；已决定、已失效与失败都不是。`decided` 抛出
 * 时答复的结果不变。
 */
export function withDecided(
  application: HitlApplication,
  decided: ToolHitlHostInput['decided'],
): HitlApplication {
  if (decided === undefined) return application
  return {
    ...application,
    async submitReply(access, command) {
      const result = await application.submitReply(access, command)
      if (result.kind === 'decided')
        try {
          decided({ application, access, card: command.cardRef })
        } catch {
          // 唤醒提示抛出不改变决定。
        }
      return result
    },
  }
}

export function createToolHitlHost(input: ToolHitlHostInput): ToolHitlHost {
  // 游标签名密钥只在本进程内有效：换进程后旧游标答 invalid-input（HITL 的游标规则）。
  const cursorKey = randomBytes(32)
  const tenants = new Map<string, Tenant>()
  let closed = false

  const tenant = async (text: string): Promise<TenantHitl> => {
    if (closed) return { kind: 'unavailable', diagnostic: 'the HITL host is closed' }
    const known = tenants.get(text)
    if (known !== undefined) return { kind: 'ready', tenant: known }
    const verifier = input.verifier()
    const standing = input.standing()
    const reservations = input.reservations()
    if (verifier === undefined || standing === undefined || reservations === undefined)
      return { kind: 'unavailable', diagnostic: 'identity reads are absent' }
    const found = await input.domains.lookup({ tenant: text })
    if (found.kind === 'unregistered') return found
    if (found.kind !== 'ready')
      return { kind: 'unavailable', diagnostic: `tenant domain lookup answered ${found.kind}` }
    if (found.domain.scope.kind !== 'tenant' || found.domain.scope.tenant !== text)
      return {
        kind: 'unavailable',
        diagnostic: 'the tenant domain directory answered another scope',
      }
    const raced = tenants.get(text)
    if (raced !== undefined) return { kind: 'ready', tenant: raced }
    const terminal = {
      storage: input.storage,
      domain: found.domain,
      combinationVersion: input.combination.combinationVersion,
      manifestDigest: input.combination.manifestDigest,
    }
    const application = createIndependentHitlApplication({
      ...terminal,
      destination: HITL_DESTINATION,
      required: [],
      identity: { verifier, standing, reservations },
      locationRef: HITL_LOCATION,
      cursorKey,
      guards: toolOriginGuards(text),
    })
    const made: Tenant = {
      domain: found.domain,
      application: withDecided(application, input.decided),
      destination: createHitlStandingDestination({ ...terminal, destination: HITL_DESTINATION }),
    }
    tenants.set(text, made)
    return { kind: 'ready', tenant: made }
  }

  return Object.freeze({
    tenant,
    prepare: (at, command) =>
      input.storage.commit({
        identity: {
          scope: at.domain.scope,
          transactionDomain: at.domain.transactionDomain,
          operation: 'hitl.command',
          protocolVersion: '2',
          operationKey: prepareKey(command),
        },
        combinationVersion: input.combination.combinationVersion,
        manifestDigest: input.combination.manifestDigest,
        commands: independentControlCommands(command),
      }),
    async qualify(text, principal) {
      const verifier = input.verifier()
      const standing = input.standing()
      if (verifier === undefined || standing === undefined)
        return { kind: 'unavailable', reason: 'identity reads are absent' }
      try {
        const verified = await verifier.verify(principal)
        if (verified.kind === 'unavailable')
          return { kind: 'unavailable', reason: 'identity-verifier' }
        if (verified.kind !== 'verified' || verified.principal.kind !== 'acting-for-tenant')
          return { kind: 'denied', reason: 'principal' }
        const own = tenantCodec.encode(verified.principal.tenant)
        if (!own.ok || own.value !== text) return { kind: 'denied', reason: 'tenant' }
        const read = await standing.read({ tenant: verified.principal.tenant })
        if (read.kind === 'unavailable') return { kind: 'unavailable', reason: 'identity-standing' }
        return read.kind === 'member'
          ? { kind: 'qualified' }
          : { kind: 'denied', reason: 'qualification' }
      } catch {
        return { kind: 'unavailable', reason: 'identity-read' }
      }
    },
    destination: {
      async seal(reservation) {
        const scope = reservation.binding.scopeRef
        const at = await tenant(scope)
        if (at.kind === 'ready') return at.tenant.destination.seal(reservation)
        return {
          kind: 'unavailable',
          diagnostic: at.kind === 'unregistered' ? 'the tenant has no domain' : at.diagnostic,
        }
      },
    },
    async close() {
      closed = true
      const open = [...tenants.values()]
      tenants.clear()
      await Promise.allSettled(open.map(entry => entry.application.close()))
    },
  })
}

/** 这份保留是否属于 HITL 的目的端：governance 行的封口目的端据此分路。 */
export function isHitlReservation(
  reservation: Parameters<StandingDestinationResolver['seal']>[0],
): boolean {
  return (
    reservation.binding.owner === HITL_RESERVATION_OWNER &&
    reservation.binding.destination === HITL_DESTINATION
  )
}
