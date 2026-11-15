import { randomUUID } from 'node:crypto'
import {
  ScheduleCallContextSchema,
  ScheduleDefinitionSchema,
  ScheduleIdSchema,
  ScheduleInstantSchema,
  ScheduleCandidateSchema,
  ScheduleFingerprintSchema,
  type ScheduleCallContext,
  type ScheduleDefinition,
  type ScheduleListRequest,
} from '@omne-harness/schedule-contract'
import {
  createScheduleManagementIdentity,
  type ManagementAccess,
  type ManagementCommit,
  type DefinitionObservation,
  type ReadAccess,
} from '@omne-harness/schedule'
export const now = ScheduleInstantSchema.parse('2026-11-04T00:00:00.000Z')
export const context = ScheduleCallContextSchema.parse({
  principalRef: 'principal:alice',
  owner: { kind: 'tenant', tenantId: 't1', ownerId: 'alice' },
  actor: { kind: 'human', actorRef: 'alice' },
  authContextRef: 'trusted:alice',
  requestId: 'request:one',
  originatingSessionRef: null,
})
export const definition = ScheduleDefinitionSchema.parse({
  label: 'Tea',
  recurrence: { kind: 'once', localAt: '2026-11-05T09:00:00' },
  limits: { eligibleLimit: null, jobLimit: null, excludeDates: [] },
  binding: { kind: 'explicit', timezone: 'UTC', calendar: null },
  calendarOverlay: null,
  purpose: {
    kind: 'reminder',
    content: { title: null, body: 'Make tea' },
    admissionPolicy: 'reminder-window-v1',
    overlap: 'parallel',
  },
})
export function recovery(ctx = context) {
  return {
    owner: ctx.owner,
    principalRef: ctx.principalRef,
    actor: ctx.actor,
    originatingSessionRef: ctx.originatingSessionRef,
  }
}
export function access(ctx = context): ManagementAccess {
  return {
    authority: {
      scope: recovery(ctx),
      authorOnCreate:
        ctx.actor.kind === 'system'
          ? { kind: 'system', principalRef: ctx.principalRef }
          : ctx.actor.kind === 'human'
            ? { kind: 'human', actorRef: ctx.actor.actorRef }
            : {
                kind: 'agent',
                actorRef: ctx.actor.actorRef,
                originatingSessionRef: ctx.originatingSessionRef ?? 'invalid',
              },
      role: ctx.actor.kind === 'system' ? 'system' : 'owner',
      authorityVersion: 'authority:1',
      guardRef: 'authority:guard',
    },
    consent: { kind: 'notRequired', guardRef: 'consent:guard' },
    currentStanding: {
      kind: 'ready',
      generation: 1,
      reasons: [],
      authorityEvidence: [],
      since: now,
      observedAt: now,
    },
    consentLock: { kind: 'clear' },
  }
}
export function observation(
  value: ScheduleDefinition = definition,
  revision = 1,
): Exclude<DefinitionObservation, { kind: 'notNeeded' }> {
  const calendarId =
    value.binding.kind === 'explicit'
      ? (value.binding.calendar?.calendarId ?? null)
      : 'follow-calendar'
  const basis = {
    timezone: 'UTC',
    tzdbVersion: 'fixture-tzdb',
    calendarId,
    calendarVersionId: calendarId === null ? null : 'v1',
    publicationGeneration: calendarId === null ? null : 1,
    environmentRevision: value.binding.kind === 'followUserEnvironment' ? 'environment:1' : null,
    ruleEngineVersion: 'fixture',
    definitionRevision: revision,
  }
  return {
    kind: 'resolved',
    definition: value,
    basis: ScheduleCandidateSchema.parse({
      sourceKeys: ['fixture:source'],
      originalLocals: ['2026-11-05T09:00:00'],
      adjustedLocal: '2026-11-05T09:00:00',
      scheduledAt: '2026-11-05T09:00:00.000Z',
      utcOffset: '+00:00',
      dstDisposition: 'unique',
      dateExplanation: [],
      basis,
      eligibleOrdinal: 1,
    }).basis,
    next: ScheduleCandidateSchema.parse({
      sourceKeys: ['fixture:source'],
      originalLocals: ['2026-11-05T09:00:00'],
      adjustedLocal: '2026-11-05T09:00:00',
      scheduledAt: '2026-11-05T09:00:00.000Z',
      utcOffset: '+00:00',
      dstDisposition: 'unique',
      dateExplanation: [],
      basis,
      eligibleOrdinal: 1,
    }),
    complete: true,
    referenceExclusive: now,
    basisGuardRef: 'basis:guard',
  }
}
export function createCommand(key: string = randomUUID(), ctx = context) {
  const request = {
    kind: 'create',
    input: {
      definition,
      initial: { kind: 'active' },
      meta: { operationKey: key, expectedRevision: null, consentRef: null },
    },
  } as const
  const id = ScheduleIdSchema.parse(randomUUID())
  return {
    kind: 'saveDefinition',
    input: {
      requestId: ctx.requestId,
      operation: createScheduleManagementIdentity(recovery(ctx), request),
      request,
      current: null,
      access: access(ctx),
      definition: observation(),
      now,
      allocatedId: id,
      quotaObservation: {
        guardRef: 'quota:guard',
        resultingHolding: { kind: 'held', reservationRef: `reservation:${id}` },
      },
    },
  } satisfies ManagementCommit
}
export function readAccess(ctx: ScheduleCallContext = context): ReadAccess {
  return {
    owner: ctx.owner,
    principalRef: ctx.principalRef,
    visibility: { kind: 'ownerAll' },
    authorityRevision: 'authority:1',
    visibilityDigest: ScheduleFingerprintSchema.parse('a'.repeat(64)),
  }
}
export function listRequest(): ScheduleListRequest {
  return {
    agentRef: null,
    control: null,
    standing: null,
    createdBy: null,
    targetDeviceRef: null,
    calendarId: null,
    purpose: null,
    cursor: null,
    limit: 50,
  }
}
