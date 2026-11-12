// HITL 入口面的替身与入口主体持有者的替身。替身按 HITL 协议「公开入口与受众」的规则判断读者：
// 主体的 `standingPrincipalRef` 在卡片的读者里才能读到这张卡，否则答 `denied`。它记录每次调用，
// 让用例核对接入交出的主体、位置引用与过滤条件。答复按一卡一决：同一操作身份同内容认回原结果，同身份不同内容
// 答 conflict，卡片已有决定时答 already-decided。输入摘要是替身自己的算法，接入只经 `bindSubmitReply` 取得它。
import { createHash } from 'node:crypto'
import {
  CardSchema,
  OriginSchema,
  type CommandResult,
  type Decision,
  type HitlConflict,
  type HitlReadFailure,
  type ListPool,
  type OperationInspection,
  type PoolItem,
  type SubmitReply,
} from '@omne-harness/human-intervention'
import {
  inProcessPrincipalAuthority,
  standingPrincipalRef,
  type ActingForTenantPrincipal,
} from '@omne-harness/identity'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { HitlEntryIssue, HitlEntryPrincipals, HitlIngressFaces } from '../../src/index.ts'

export const HITL_PATH = '/hitl-public/1'
export const HITL_LOCATION = 'hitl-location-1'

type Call = Readonly<{ method: string; principal: ActingForTenantPrincipal; input: unknown }>
type Failure = HitlReadFailure | HitlConflict
type Submitted = Readonly<{
  digest: string
  result: Exclude<CommandResult<'submitReply'>, { kind: 'unknown' }>
}>

/** 替身的输入摘要：答复命令除操作身份外的内容。 */
function digestOf(command: SubmitReply): string {
  const { cardRef, expectedRevision, reply } = command
  return createHash('sha256')
    .update(JSON.stringify({ cardRef, expectedRevision, reply }))
    .digest('hex')
}

export type HitlDouble = Readonly<{
  faces: HitlIngressFaces<ActingForTenantPrincipal>
  calls: Call[]
  /** 登记一张卡。读者是给出的主体引用。 */
  addCard(
    input: Readonly<{
      tenant: TenantId
      cardId: string
      sessionRef?: string
      readers: readonly string[]
    }>,
  ): PoolItem
  /** 下一次 `method` 调用抛出，或答给出的失败。 */
  failNext(
    method: 'listPool' | 'getCard' | 'submitReply' | 'getOperation' | 'bindSubmitReply',
    failure: Injected | 'throw',
  ): void
}>

/** 注入给下一次调用的答复：一种失败、结果未知，或提交身份被登记命令占着。 */
type Injected = Failure | Readonly<{ kind: 'unknown' }> | Readonly<{ kind: 'held-by-register' }>

function tenantText(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('fixture tenant did not encode')
  return encoded.value
}

export function createHitlDouble(): HitlDouble {
  const calls: Call[] = []
  const cards: { item: PoolItem; readers: readonly string[] }[] = []
  const failures = new Map<string, Injected | 'throw'>()
  const submitted = new Map<string, Submitted>()
  const decisions = new Map<string, Decision>()
  const readable = (principal: ActingForTenantPrincipal, readers: readonly string[]) =>
    readers.includes(standingPrincipalRef(principal))
  const injected = (method: string): Injected | undefined => {
    const failure = failures.get(method)
    failures.delete(method)
    if (failure === 'throw') throw new Error(`${method} exploded`)
    return failure
  }
  const keyOf = (ref: SubmitReply['cardRef']) =>
    `${ref.request.tenantRef}/${ref.request.requestId}/${ref.cardId}`
  const faces: HitlIngressFaces<ActingForTenantPrincipal> = {
    queries: {
      async listPool(principal, query: ListPool) {
        calls.push({ method: 'listPool', principal, input: query })
        const failure = injected('listPool')
        if (failure !== undefined) return failure as Failure
        const items = cards
          .filter(
            card =>
              card.item.card.ref.request.tenantRef === query.tenantRef &&
              readable(principal, card.readers) &&
              (query.filter.sessionRef === undefined ||
                card.item.origin.sessionRef === query.filter.sessionRef),
          )
          .map(card => card.item)
        return {
          kind: 'page',
          items,
          next: null,
          snapshotRef: 'snapshot-1',
          completeness: 'complete',
        }
      },
      async getCard(principal, query) {
        calls.push({ method: 'getCard', principal, input: query })
        const failure = injected('getCard')
        if (failure !== undefined) return failure as HitlReadFailure
        const found = cards.find(
          card =>
            card.item.card.ref.request.tenantRef === query.cardRef.request.tenantRef &&
            card.item.card.ref.request.requestId === query.cardRef.request.requestId &&
            card.item.card.ref.cardId === query.cardRef.cardId,
        )
        return found !== undefined && readable(principal, found.readers)
          ? { kind: 'found', item: found.item }
          : { kind: 'denied', reason: 'request-access' }
      },
      async getOperation(principal, query): Promise<OperationInspection> {
        calls.push({ method: 'getOperation', principal, input: query })
        const failure = injected('getOperation')
        if (failure?.kind === 'held-by-register')
          // 同一提交身份被登记命令占着：不是答复命令的结果。
          return {
            kind: 'committed',
            operationRef: query.operationRef,
            method: 'registerRequest',
            inputDigest: query.inputDigest,
            commitReceipt: 'receipt-1',
          } as unknown as OperationInspection
        if (failure !== undefined)
          return failure.kind === 'unknown'
            ? { kind: 'unknown', operationRef: query.operationRef }
            : (failure as HitlReadFailure)
        const found = submitted.get(query.operationRef.operationId)
        if (found === undefined)
          return { kind: 'not-committed', operationRef: query.operationRef, sealReceipt: 'seal-1' }
        if (found.digest !== query.inputDigest)
          return { kind: 'conflict', operationRef: query.operationRef, reason: 'input-digest' }
        return {
          kind: 'committed',
          operationRef: query.operationRef,
          method: 'submitReply',
          inputDigest: found.digest,
          result: found.result,
          commitReceipt: 'receipt-1',
        }
      },
    },
    commands: {
      async submitReply(principal, command) {
        calls.push({ method: 'submitReply', principal, input: command })
        const operationRef = command.operation
        const failure = injected('submitReply')
        if (failure !== undefined)
          return { ...failure, operationRef } as CommandResult<'submitReply'>
        const digest = digestOf(command)
        const earlier = submitted.get(operationRef.operationId)
        if (earlier !== undefined)
          return earlier.digest === digest
            ? earlier.result
            : { kind: 'conflict', reason: 'input-digest', operationRef }
        const card = cards.find(entry => keyOf(entry.item.card.ref) === keyOf(command.cardRef))
        if (card === undefined || !readable(principal, card.readers))
          return { kind: 'denied', reason: 'request-access', operationRef }
        const key = keyOf(command.cardRef)
        const before = decisions.get(key)
        let result: Submitted['result']
        if (before !== undefined)
          result = { kind: 'already-decided', decision: before, operationRef }
        else {
          const decision = {
            ref: { card: command.cardRef, decisionId: `decision-${key}`, submission: operationRef },
            reply: command.reply,
            basisRef: 'basis-1',
            commitReceipt: 'commit-1',
          } as Decision
          decisions.set(key, decision)
          result = {
            kind: 'decided',
            decisionRef: decision.ref,
            revision: '1',
            delivery: 'pending',
            operationRef,
          } as Submitted['result']
        }
        submitted.set(operationRef.operationId, { digest, result })
        return result
      },
    },
    bindSubmitReply(command) {
      calls.push({ method: 'bindSubmitReply', principal: undefined as never, input: command })
      injected('bindSubmitReply')
      return { operationRef: command.operation, inputDigest: digestOf(command) }
    },
  }
  return {
    faces,
    calls,
    addCard({ tenant, cardId, sessionRef, readers }) {
      const tenantRef = tenantText(tenant)
      const item: PoolItem = {
        card: CardSchema.parse({
          ref: { request: { tenantRef, requestId: `request-${cardId}` }, cardId },
          revision: '0',
          question: {
            cardId,
            title: '要删除这些文件吗',
            description: '工具要删除 3 个文件',
            declineConsequence: '跳过时工具不执行',
            kind: 'approval',
            options: [{ id: 'yes', label: '同意', description: '删除', effectRef: 'effect-1' }],
          },
          kind: 'pending',
        }),
        origin: OriginSchema.parse({
          kind: 'tool',
          originRef: 'origin-secret',
          wait: { owner: 'tool', waitId: 'wait-1', incarnation: '1', destination: 'dest-secret' },
          positionRef: 'position-secret',
          adoptionRef: 'adoption-secret',
          toolCallRef: 'call-1',
          ...(sessionRef === undefined ? {} : { sessionRef, runRef: 'run-1' }),
        }),
        displayContext: '会话里的一次工具调用',
      }
      cards.push({ item, readers })
      return item
    },
    failNext(method, failure) {
      failures.set(method, failure)
    },
  }
}

export type EntryPrincipalsDouble = Readonly<{
  holder: HitlEntryPrincipals
  /** 每次签发的输入的键。 */
  inputs: string[][]
  /** 给出租户的入口主体引用，与持有者签发的同一。 */
  refOf(tenant: TenantId): string
  /** 下一次签发的行为。 */
  next(behaviour: HolderBehaviour, other?: TenantId): void
}>

/** 持有者下一次签发时的偏离：拒绝、抛出，或给出一个不是这个租户入口主体的主体。 */
export type HolderBehaviour =
  | 'refuse'
  | 'throw'
  | 'other-tenant'
  | 'other-component'
  | 'other-work-owner'
  | 'other-work'
  | 'not-acting'
  | 'actor-not-system'
  | 'no-principal'

/** 按 identity「持有者与关系核对位置」签发 `{ actor: server-entry, tenant, work: harness.hitl/cards }`。 */
export function createEntryPrincipalsDouble(): EntryPrincipalsDouble {
  const { issuer } = inProcessPrincipalAuthority()
  const system = issuer.issueSystem({ component: 'server-entry' })
  if ('failure' in system) throw new Error('fixture system principal was not issued')
  const elsewhere = issuer.issueSystem({ component: 'another-entry' })
  if ('failure' in elsewhere) throw new Error('fixture system principal was not issued')
  const issue = (
    tenant: TenantId,
    actor = system.ok,
    work = { owner: 'harness.hitl', work: 'cards' },
  ): ActingForTenantPrincipal => {
    const issued = issuer.issueActingForTenant({ actor, tenant, work })
    if ('failure' in issued) throw new Error('fixture entry principal was not issued')
    return issued.ok
  }
  /** 一个偏离的主体。后两种不是签发者给出的值，只有形状。 */
  const deviant = (kind: HolderBehaviour, tenant: TenantId): unknown => {
    if (kind === 'other-component') return issue(tenant, elsewhere.ok)
    if (kind === 'other-work-owner')
      return issue(tenant, system.ok, { owner: 'harness.other', work: 'cards' })
    if (kind === 'other-work')
      return issue(tenant, system.ok, { owner: 'harness.hitl', work: 'drafts' })
    if (kind === 'not-acting') return { ...issue(tenant), kind: 'system' }
    if (kind === 'actor-not-system')
      return { ...issue(tenant), actor: { ...system.ok, kind: 'acting-for-tenant' } }
    return undefined
  }
  const inputs: string[][] = []
  let behaviour: Readonly<{ kind: HolderBehaviour; other?: TenantId }> | undefined
  return {
    inputs,
    holder: {
      async issue(input): Promise<HitlEntryIssue> {
        inputs.push(Object.keys(input).sort())
        const current = behaviour
        behaviour = undefined
        if (current?.kind === 'throw') throw new Error('holder exploded')
        if (current?.kind === 'refuse') return { kind: 'refused' }
        if (current?.kind === 'other-tenant' && current.other !== undefined)
          return { kind: 'issued', principal: issue(current.other) }
        if (current !== undefined)
          return {
            kind: 'issued',
            principal: deviant(current.kind, input.tenant),
          } as HitlEntryIssue
        return { kind: 'issued', principal: issue(input.tenant) }
      },
    },
    refOf: tenant => standingPrincipalRef(issue(tenant)),
    next(kind, other) {
      behaviour = { kind, ...(other === undefined ? {} : { other }) }
    },
  }
}
