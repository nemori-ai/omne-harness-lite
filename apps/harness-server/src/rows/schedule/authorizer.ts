import { canonicalDigest } from '@omne-harness/tool'
import type {
  ManagementAccess,
  ManagementAuthorizer,
  ManagementRequest,
  ReadAccess,
  ReadResult,
  ScheduleReadAuthorizer,
  ScheduleRecord,
} from '@omne-harness/schedule'
import {
  ScheduleFingerprintSchema,
  type ScheduleCallContext,
  type ScheduleDomainError,
  type ScheduleInstant,
} from '@omne-harness/schedule-contract'
import {
  decideScheduleConsent,
  type ConsentActor,
  type ConsentCommand,
  type ConsentConfirmation,
  type ConsentMode,
  type ConsentSubject,
} from './consent.ts'

const OWNER = 'harness-server.schedule'
/** The standing consent the owner gives by leaving the setting at automatic. */
export const BLANKET_GRANT = `${OWNER}/agent-schedule-consent`

export type ConsentAnswer = Readonly<{
  /** The answer came from the tenant's own entry, not from the session that raised the card. */
  fromOwner: boolean
  approved: boolean
  digest: string
}>
export type ConsentPorts = Readonly<{
  /** The owner's setting, read at the moment of the decision: auto with its value revision, or draft. */
  mode(tenantRef: string): Promise<ConsentMode>
  /** The answer a decision reference of the call names; undefined when it cannot be read now. */
  answer(
    tenantRef: string,
    decision: string,
    call: string,
  ): Promise<ConsentAnswer | null | undefined>
  now(): ScheduleInstant
}>

const digestOf = (value: unknown) => canonicalDigest(value).slice('sha256:'.length)

export function actorOf(context: ScheduleCallContext): ConsentActor {
  const { actor, owner, originatingSessionRef } = context
  if (owner.kind !== 'tenant') return 'other'
  if (actor.kind === 'human' && actor.actorRef === owner.ownerId) return 'owner'
  return actor.kind === 'agent' && originatingSessionRef !== null ? 'agent' : 'other'
}

export function subjectOf(
  context: ScheduleCallContext,
  current: ScheduleRecord | null,
): ConsentSubject {
  if (current === null) return 'new'
  const { author } = current.view
  return author.kind === 'agent' &&
    author.actorRef === context.actor.actorRef &&
    author.originatingSessionRef === context.originatingSessionRef
    ? 'agentOwn'
    : 'others'
}

/** Changes that bring a schedule into effect or change one in effect need consent; draft edits do not. */
export function commandOf(
  request: ManagementRequest,
  current: ScheduleRecord | null,
): ConsentCommand {
  if (request.kind === 'create')
    return request.input.initial.kind === 'active' ? 'consent' : 'draftLocal'
  switch (request.input.action) {
    case 'reviseDraft':
    case 'discard':
      return 'draftLocal'
    case 'update':
      return current?.view.control === 'draft' ? 'draftLocal' : 'consent'
    default:
      return 'consent'
  }
}

/** The content the owner confirms: the request without its operation key and the consent it names. */
export function consentDigest(request: ManagementRequest): string {
  const { meta: _meta, ...content } = request.input
  return digestOf({ kind: request.kind, content })
}

const failure = (
  context: ScheduleCallContext,
  code: ScheduleDomainError['code'],
  details: ScheduleDomainError['details'] = {},
): ReadResult<never> => ({
  kind: 'unavailable',
  error: {
    code,
    message: `schedule consent: ${code}`,
    retryable: code === 'authority_unavailable',
    requestId: context.requestId,
    details,
  },
})

function recovery(context: ScheduleCallContext) {
  return {
    owner: context.owner,
    principalRef: context.principalRef,
    actor: context.actor,
    originatingSessionRef: context.originatingSessionRef,
  }
}

function authorOf(context: ScheduleCallContext): ManagementAccess['authority']['authorOnCreate'] {
  return context.actor.kind === 'agent'
    ? {
        kind: 'agent',
        actorRef: context.actor.actorRef,
        originatingSessionRef: context.originatingSessionRef ?? context.actor.actorRef,
      }
    : { kind: 'human', actorRef: context.actor.actorRef }
}

async function confirmationOf(
  ports: ConsentPorts,
  context: ScheduleCallContext,
  tenantRef: string,
  request: ManagementRequest,
): Promise<ConsentConfirmation> {
  const decision = request.input.meta.consentRef
  if (decision === null) return { kind: 'none' }
  let answer: ConsentAnswer | null | undefined
  try {
    answer = await ports.answer(tenantRef, decision, context.requestId)
  } catch {
    return { kind: 'unreadable' }
  }
  if (answer === undefined) return { kind: 'unreadable' }
  if (answer === null || !answer.fromOwner || !answer.approved) return { kind: 'foreign' }
  return answer.digest === consentDigest(request)
    ? { kind: 'valid', decision }
    : { kind: 'mismatch' }
}

export function createScheduleAuthorizers(ports: ConsentPorts): Readonly<{
  management: ManagementAuthorizer
  read: ScheduleReadAuthorizer
}> {
  async function readAccess(context: ScheduleCallContext): Promise<ReadResult<ReadAccess>> {
    if (actorOf(context) === 'other') return failure(context, 'forbidden')
    return {
      kind: 'ok',
      value: {
        owner: context.owner,
        principalRef: context.principalRef,
        visibility: { kind: 'ownerAll' },
        authorityRevision: `${OWNER}/1`,
        visibilityDigest: ScheduleFingerprintSchema.parse(
          digestOf({ owner: context.owner, all: true }),
        ),
      },
    }
  }
  const management: ManagementAuthorizer = {
    async authorize({ context, request, current }) {
      const actor = actorOf(context)
      if (actor === 'other' || context.owner.kind !== 'tenant') return failure(context, 'forbidden')
      const tenantRef = context.owner.tenantId
      const command = commandOf(request, current)
      const subject = subjectOf(context, current)
      const needsMode = actor === 'agent' && command === 'consent' && subject !== 'others'
      let mode: ConsentMode = { kind: 'draft' }
      if (needsMode)
        try {
          mode = await ports.mode(tenantRef)
        } catch {
          mode = { kind: 'unreadable' }
        }
      const confirmation =
        needsMode && mode.kind === 'draft'
          ? await confirmationOf(ports, context, tenantRef, request)
          : ({ kind: 'none' } as const)
      const decided = decideScheduleConsent({ actor, subject, command, mode, confirmation })
      if (decided.kind !== 'allow')
        return decided.kind === 'confirm'
          ? failure(context, 'consent_required', { consentDigest: consentDigest(request) })
          : failure(context, decided.kind === 'forbidden' ? 'forbidden' : 'authority_unavailable')
      const now = ports.now()
      const guardRef = `${OWNER}/consent`
      const { basis } = decided
      return {
        kind: 'ok',
        value: {
          authority: {
            scope: recovery(context),
            authorOnCreate: authorOf(context),
            role: actor === 'owner' ? 'owner' : 'author',
            authorityVersion: `${OWNER}/1`,
            guardRef: `${OWNER}/authority`,
          },
          consent:
            basis.kind === 'notRequired'
              ? { kind: 'notRequired', guardRef }
              : {
                  kind: 'adopt',
                  guardRef,
                  adoption:
                    basis.kind === 'blanket'
                      ? {
                          grantRef: BLANKET_GRANT,
                          generation: basis.generation,
                          adoptionKind: 'blanket',
                          scope: 'standing',
                          adoptedAt: now,
                        }
                      : {
                          grantRef: basis.decision,
                          generation: 0,
                          adoptionKind: 'granular',
                          scope: 'session',
                          adoptedAt: now,
                        },
                },
          currentStanding: {
            kind: 'ready',
            generation: 1,
            reasons: [],
            authorityEvidence: [],
            since: now,
            observedAt: now,
          },
        },
      }
    },
    async authorizeRecovery({ context }) {
      return actorOf(context) === 'other'
        ? failure(context, 'forbidden')
        : { kind: 'ok', value: recovery(context) }
    },
  }
  return {
    management,
    read: {
      observe: ({ context }) => readAccess(context),
      confirm: ({ context }) => readAccess(context),
    },
  }
}
