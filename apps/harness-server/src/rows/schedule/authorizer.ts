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
import type { CallConsent } from '../tool-bindings/call-consent.ts'
import {
  decideScheduleConsent,
  needsConsent,
  type ConsentActor,
  type ConsentCommand,
  type ConsentSubject,
} from './consent.ts'

const OWNER = 'harness-server.schedule'

export type ConsentPorts = Readonly<{
  /** What the call that asks was released on, read at the moment of the decision. */
  consent(tenantRef: string, call: string): Promise<CallConsent>
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

const CODES = {
  refused: 'consent_required',
  forbidden: 'forbidden',
  unavailable: 'authority_unavailable',
} as const satisfies Record<string, ScheduleDomainError['code']>
const NOT_READ: CallConsent = { kind: 'none' }
const UNREADABLE: CallConsent = { kind: 'unavailable' }

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
      const asked = {
        actor,
        subject: subjectOf(context, current),
        command: commandOf(request, current),
      }
      const consent = needsConsent(asked)
        ? await ports.consent(context.owner.tenantId, context.requestId).catch(() => UNREADABLE)
        : NOT_READ
      const decided = decideScheduleConsent({ ...asked, consent })
      if (decided.kind !== 'allow') return failure(context, CODES[decided.kind])
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
            basis === null
              ? { kind: 'notRequired', guardRef }
              : {
                  kind: 'adopt',
                  guardRef,
                  adoption: {
                    grantRef: basis.grant,
                    adoptionKind: basis.kind,
                    scope: basis.scope,
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
