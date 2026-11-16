import type { AccessContribution, AnswerOf, BodyOf } from '@omne-harness/access-cordis-contract'
import type {
  CommandResult,
  GetCard,
  GetOperation,
  HitlConflict,
  HitlReadFailure,
  ListPool,
  OperationInspection,
  PoolItem,
  SubmitReply,
} from '@omne-harness/human-intervention'
import type {
  HumanInterventionCardItem,
  HumanInterventionProtocol,
} from '@omne-harness/human-intervention-protocol'
import { standingPrincipalRef, type ActingForTenantPrincipal } from '@omne-harness/identity'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { hitlReplyIdentity, tenantTextOf } from './derivation.ts'
import { createCardObservation, loginAdmission } from './observe-cards.ts'
import type {
  CardChanges,
  HitlAccessSettings,
  HitlEntryPrincipals,
  HitlFaces,
  LoginTenants,
} from './ports.ts'

export type HitlContributionInput = Readonly<{
  faces: () => HitlFaces | undefined
  entryPrincipals: HitlEntryPrincipals
  logins: LoginTenants
  changes: () => CardChanges | undefined
  settings: HitlAccessSettings
}>

type Operations = HumanInterventionProtocol['operations']
type Name = keyof Operations & string
type Answer<K extends Name> = AnswerOf<Operations[K]>
type Body<K extends Name> = BodyOf<Operations[K]>
type Submission = Body<'submit-reply'>

const PROTOCOL = 'hitl/1'
const ENTRY_COMPONENT = 'server-entry'
const ENTRY_WORK = Object.freeze({ owner: 'harness.hitl', work: 'cards' })
const ORIGIN_REFS = ['sessionRef', 'runRef', 'toolCallRef'] as const

const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const DENIED = Object.freeze({ outcome: 'denied' as const })
const INVALID = Object.freeze({ outcome: 'invalid' as const, body: {} })
const CONFLICT = Object.freeze({ outcome: 'conflict' as const, body: {} })
const UNKNOWN = Object.freeze({ outcome: 'unknown' as const })

type Admitted = Readonly<{
  principal: ActingForTenantPrincipal
  tenantText: string
  faces: HitlFaces
}>
type SubmitResult = Exclude<CommandResult<'submitReply'>, { kind: 'unknown' }>

function isEntryPrincipal(principal: ActingForTenantPrincipal, tenant: TenantId): boolean {
  return (
    principal.kind === 'acting-for-tenant' &&
    principal.actor.kind === 'system' &&
    principal.actor.component === ENTRY_COMPONENT &&
    principal.work.owner === ENTRY_WORK.owner &&
    principal.work.work === ENTRY_WORK.work &&
    tenantEquals(principal.tenant, tenant)
  )
}

function readFailure(failure: HitlReadFailure) {
  switch (failure.kind) {
    case 'denied':
      return DENIED
    case 'invalid-input':
      return INVALID
    case 'limited':
      return {
        outcome: 'limited',
        body: { resource: failure.resource, limit: failure.limit },
      } as const
    case 'unavailable':
      return UNAVAILABLE
  }
}

function failure(refused: HitlReadFailure | HitlConflict) {
  return refused.kind === 'conflict' ? CONFLICT : readFailure(refused)
}

function viewOf(item: PoolItem): HumanInterventionCardItem {
  const origin: { -readonly [K in keyof HumanInterventionCardItem['origin']]: string } = {
    kind: item.origin.kind,
  }
  const source: Readonly<{ [K in (typeof ORIGIN_REFS)[number]]?: string | undefined }> = item.origin
  for (const key of ORIGIN_REFS) {
    const value = source[key]
    if (value !== undefined) origin[key] = value
  }
  return {
    card: item.card as unknown as HumanInterventionCardItem['card'],
    origin: origin as HumanInterventionCardItem['origin'],
    displayContext: item.displayContext,
  }
}

function replyAnswer(result: SubmitResult): Answer<'submit-reply'> {
  switch (result.kind) {
    case 'decided':
      return {
        outcome: 'succeeded',
        body: {
          kind: 'decided',
          decisionRef: result.decisionRef,
          revision: result.revision,
          delivery: result.delivery,
        },
      } as Answer<'submit-reply'>
    case 'already-decided':
      return {
        outcome: 'succeeded',
        body: { kind: 'already-decided', decision: result.decision },
      } as Answer<'submit-reply'>
    case 'invalidated':
      return { outcome: 'succeeded', body: { kind: 'invalidated', reason: result.reason } }
    default:
      return failure(result)
  }
}

function inspectionAnswer(found: OperationInspection): Answer<'query-submit-reply'> {
  switch (found.kind) {
    case 'committed':
      return found.method === 'submitReply' ? replyAnswer(found.result as SubmitResult) : CONFLICT
    case 'not-committed':
      return { outcome: 'not-committed', body: {} }
    case 'unknown':
      return UNKNOWN
    default:
      return failure(found)
  }
}

export function createHitlContribution(
  input: HitlContributionInput,
): Omit<AccessContribution<HumanInterventionProtocol>, 'protocol'> {
  const { entryPrincipals, logins, settings } = input

  async function admit(
    login: Parameters<LoginTenants['admits']>[0],
    tenant: TenantId,
  ): Promise<Admitted | typeof DENIED | typeof UNAVAILABLE> {
    const tenantText = tenantTextOf(tenant)
    const admitted = await loginAdmission(logins, login, tenantText)
    if (admitted === 'denied') return DENIED
    if (admitted !== 'admitted') return UNAVAILABLE
    try {
      const issued = await entryPrincipals.issue({ account: tenant.account, tenant })
      const faces = input.faces()
      if (issued.kind === 'issued' && isEntryPrincipal(issued.principal, tenant) && faces)
        return { principal: issued.principal, tenantText, faces }
    } catch {}
    return UNAVAILABLE
  }

  async function read<T>(call: () => Promise<T>): Promise<T | typeof UNAVAILABLE> {
    try {
      return await call()
    } catch {
      return UNAVAILABLE
    }
  }

  function commandOf(
    body: Submission,
    { principal, tenantText }: Pick<Admitted, 'principal' | 'tenantText'>,
  ): SubmitReply {
    return {
      protocol: PROTOCOL,
      operation: {
        tenantRef: tenantText,
        actorRef: standingPrincipalRef(principal),
        operationId: hitlReplyIdentity(tenantText, body.replyId),
      },
      cardRef: body.card,
      expectedRevision: body.expectedRevision,
      reply: body.reply,
    } as unknown as SubmitReply
  }

  return {
    operations: {
      async 'list-cards'(call, body) {
        const admitted = await admit(call.principal, body.tenant)
        if ('outcome' in admitted) return admitted
        const { principal, tenantText, faces } = admitted
        const query = {
          protocol: PROTOCOL,
          tenantRef: tenantText,
          locationRef: settings.locationRef,
          filter: body.filter,
          limit: body.limit,
          ...(body.cursor === null ? {} : { cursor: body.cursor }),
        } as unknown as ListPool
        const result = await read(() => faces.queries.listPool(principal, query))
        if ('outcome' in result) return result
        if (result.kind !== 'page') return failure(result)
        return {
          outcome: 'succeeded',
          body: {
            items: result.items.map(viewOf),
            next: result.next,
            snapshotRef: result.snapshotRef,
            completeness: result.completeness,
          },
        }
      },
      async 'read-card'(call, body) {
        const admitted = await admit(call.principal, body.tenant)
        if ('outcome' in admitted) return admitted
        const { principal, faces } = admitted
        const query = { protocol: PROTOCOL, cardRef: body.card } as unknown as GetCard
        const result = await read(() => faces.queries.getCard(principal, query))
        if ('outcome' in result) return result
        if (result.kind !== 'found') return readFailure(result)
        return { outcome: 'succeeded', body: { item: viewOf(result.item) } }
      },
      async 'submit-reply'(call, body) {
        const admitted = await admit(call.principal, body.tenant)
        if ('outcome' in admitted) return admitted
        const { principal, faces } = admitted
        let result
        try {
          result = await faces.commands.submitReply(principal, commandOf(body, admitted))
        } catch {
          return UNKNOWN
        }
        return result.kind === 'unknown' ? UNKNOWN : replyAnswer(result)
      },
      async 'query-submit-reply'(call, body) {
        const admitted = await admit(call.principal, body.tenant)
        if ('outcome' in admitted) return admitted
        const { principal, faces } = admitted
        const found = await read(() => {
          const binding = faces.bindSubmitReply(commandOf(body, admitted))
          return faces.queries.getOperation(principal, {
            protocol: PROTOCOL,
            operationRef: binding.operationRef,
            inputDigest: binding.inputDigest,
          } as unknown as GetOperation)
        })
        return 'outcome' in found ? found : inspectionAnswer(found)
      },
    },
    observations: {
      'observe-cards': createCardObservation({ logins, changes: input.changes }),
    },
  }
}
