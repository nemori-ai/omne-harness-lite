import { canonicalDigest } from '@omne-harness/tool'
import type {
  ManagementAuthorizer,
  ReadAccess,
  ReadResult,
  ScheduleReadAuthorizer,
  ScheduleRecord,
} from '@omne-harness/schedule'
import {
  ScheduleFingerprintSchema,
  type ScheduleAuthor,
  type ScheduleCallContext,
  type ScheduleDomainError,
  type ScheduleInstant,
} from '@omne-harness/schedule-contract'
import type { CallOrigin } from '../tool-bindings/live-calls.ts'

const OWNER = 'harness-server.schedule'

export type AuthorPorts = Readonly<{
  /** Where the live call of an agent's context runs, read at the moment of the decision. */
  origin(tenantRef: string, call: string): CallOrigin | undefined
  now(): ScheduleInstant
}>

/** Who acts: the tenant's person, an agent in one of its sessions, or neither. */
export type ScheduleActor = 'owner' | 'agent' | 'other'

const digestOf = (value: unknown) => canonicalDigest(value).slice('sha256:'.length)

export function actorOf(context: ScheduleCallContext): ScheduleActor {
  const { actor, owner, originatingSessionRef } = context
  if (owner.kind !== 'tenant') return 'other'
  if (actor.kind === 'human' && actor.actorRef === owner.ownerId) return 'owner'
  return actor.kind === 'agent' && originatingSessionRef !== null ? 'agent' : 'other'
}

/** An agent manages only the schedules it created in its session. */
export function ownedByAgent(
  context: ScheduleCallContext,
  current: ScheduleRecord | null,
): boolean {
  if (current === null) return true
  const { author } = current.view
  return (
    author.kind === 'agent' &&
    author.actorRef === context.actor.actorRef &&
    author.originatingSessionRef === context.originatingSessionRef
  )
}

const failure = (
  context: ScheduleCallContext,
  code: ScheduleDomainError['code'],
  details: ScheduleDomainError['details'] = {},
): ReadResult<never> => ({
  kind: 'unavailable',
  error: {
    code,
    message: `schedule authority: ${code}`,
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

/** An agent's author is the session and the call its live call runs in; none when it is not live. */
function agentAuthor(
  context: ScheduleCallContext,
  origin: CallOrigin | undefined,
): ScheduleAuthor | undefined {
  return origin === undefined
    ? undefined
    : {
        kind: 'agent',
        actorRef: context.actor.actorRef,
        originatingSessionRef: origin.session,
        originatingCallRef: origin.call,
      }
}

export function createScheduleAuthorizers(ports: AuthorPorts): Readonly<{
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
    async authorize({ context, current }) {
      const actor = actorOf(context)
      const { owner } = context
      if (actor === 'other' || owner.kind !== 'tenant') return failure(context, 'forbidden')
      if (actor === 'agent' && !ownedByAgent(context, current)) return failure(context, 'forbidden')
      const author: ScheduleAuthor | undefined =
        actor === 'owner'
          ? { kind: 'human', actorRef: context.actor.actorRef }
          : agentAuthor(context, ports.origin(owner.tenantId, context.requestId))
      if (author === undefined) return failure(context, 'authority_unavailable')
      const now = ports.now()
      return {
        kind: 'ok',
        value: {
          authority: {
            scope: recovery(context),
            authorOnCreate: author,
            role: actor === 'owner' ? 'owner' : 'author',
            authorityVersion: `${OWNER}/1`,
            guardRef: `${OWNER}/authority`,
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
