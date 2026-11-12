import {
  ScheduleCallContextSchema,
  ScheduleDefinitionSchema,
  ScheduleInstantSchema,
  ScheduleIdSchema,
  ScheduleCandidateSchema,
  ScheduleCommandSchema,
  ScheduleViewSchema,
  type ScheduleControl,
  type ScheduleCommand,
} from '@omne-harness/schedule-contract'
import {
  createScheduleManagementIdentity,
  createScheduleDefinitionRef,
  type ManagementDecisionInput,
  type ManagementRequest,
  type ScheduleRecord,
  type ManagementAccess,
  type DefinitionObservation,
} from '@omne-harness/schedule'

export const now = ScheduleInstantSchema.parse('2026-11-04T00:00:00.000Z')
export const context = ScheduleCallContextSchema.parse({
  principalRef: 'principal:alice',
  owner: { kind: 'tenant', tenantId: 't1', ownerId: 'alice' },
  actor: { kind: 'human', actorRef: 'alice' },
  authContextRef: 'auth:verified',
  requestId: 'request:test',
  originatingSessionRef: null,
})
export const scope = {
  owner: context.owner,
  principalRef: context.principalRef,
  actor: context.actor,
  originatingSessionRef: context.originatingSessionRef,
}
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
export const scheduleId = ScheduleIdSchema.parse('00000000-0000-4000-8000-000000000001')
export const successorId = ScheduleIdSchema.parse('00000000-0000-4000-8000-000000000002')
export function access(): ManagementAccess {
  return {
    authority: {
      scope,
      authorOnCreate: { kind: 'human', actorRef: 'alice' },
      role: 'owner',
      authorityVersion: 'auth-v1',
      guardRef: 'guard:authority',
    },
    consent: { kind: 'notRequired', guardRef: 'guard:consent' },
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
  value = definition,
  definitionRevision = 1,
): Exclude<DefinitionObservation, { kind: 'notNeeded' }> {
  const basis = {
    timezone: definition.binding.kind === 'explicit' ? definition.binding.timezone : 'UTC',
    tzdbVersion: 'test-tzdb',
    calendarId: null,
    calendarVersionId: null,
    publicationGeneration: null,
    environmentRevision: null,
    ruleEngineVersion: 'test',
    definitionRevision,
  }
  const next = ScheduleCandidateSchema.parse({
    sourceKeys: ['source:one'],
    originalLocals: ['2026-11-05T09:00:00'],
    adjustedLocal: '2026-11-05T09:00:00',
    scheduledAt: '2026-11-05T09:00:00.000Z',
    utcOffset: '+00:00',
    dstDisposition: 'unique',
    dateExplanation: [],
    basis,
    eligibleOrdinal: 1,
  })
  return {
    kind: 'resolved',
    definition: value,
    basis: next.basis,
    next,
    complete: true,
    referenceExclusive: now,
    basisGuardRef: 'guard:basis',
  }
}
export function record(control: ScheduleControl = 'active'): ScheduleRecord {
  const view = ScheduleViewSchema.parse({
    scheduleId,
    owner: context.owner,
    author: { kind: 'human', actorRef: 'alice' },
    createdBy: 'alice',
    createdAt: now,
    definition,
    revision: 4,
    definitionRevision: 2,
    stateRevision: 2,
    timeRuleRevision: 1,
    control,
    standing: access().currentStanding,
    nextOccurrence: control === 'draft' ? null : observation(definition, 2).next,
    predecessorId: null,
    successorId: null,
    promotedBy: null,
    promotedAt: null,
    discardedBy: null,
    discardedAt: null,
    sourceScheduleKey: null,
    consentAdoption: null,
    eligibleConsumed: 3,
    acceptedJobCount: 2,
    observedAt: now,
  })
  return {
    view,
    activationExclusive: control === 'draft' ? null : now,
    consentLock: { kind: 'clear' },
    quota: { kind: 'held', reservationRef: 'reservation:old' },
    adoptedBasis: observation(definition, 2).basis,
    definitionRef: createScheduleDefinitionRef(view),
  }
}
export function command(action: ScheduleCommand['action']): ScheduleCommand {
  const common = {
    action,
    scheduleId,
    meta: { operationKey: `operation:${action}`, expectedRevision: 4, consentRef: null },
  }
  switch (action) {
    case 'update':
      return ScheduleCommandSchema.parse({
        ...common,
        patch: { kind: 'label', label: 'New label' },
      })
    case 'reviseDraft':
      return ScheduleCommandSchema.parse({
        ...common,
        definition: { ...definition, label: 'New draft' },
        reason: 'Change draft',
      })
    case 'replace':
      return ScheduleCommandSchema.parse({ ...common, successor: definition, reason: 'New intent' })
    case 'reconfirmConsent':
      return ScheduleCommandSchema.parse({
        ...common,
        newConsentRef: 'grant:new',
        reason: 'Confirm',
      })
    default:
      return ScheduleCommandSchema.parse({ ...common, reason: null })
  }
}
export function decisionInput(
  action: ScheduleCommand['action'],
  control: ScheduleControl = 'active',
): ManagementDecisionInput {
  const input = command(action)
  const request: ManagementRequest = { kind: 'execute', input }
  let authorized = access()
  if (action === 'reconfirmConsent')
    authorized = {
      ...authorized,
      consent: {
        kind: 'adopt',
        guardRef: 'guard:consent',
        adoption: {
          grantRef: 'grant:new',
          generation: 2,
          adoptionKind: 'blanket',
          scope: 'standing',
          adoptedAt: now,
        },
      },
    }
  return {
    requestId: context.requestId,
    request,
    operation: createScheduleManagementIdentity(scope, request),
    current: record(control),
    access: authorized,
    definition:
      action === 'replace'
        ? observation()
        : action === 'reviseDraft' && input.action === 'reviseDraft'
          ? observation(input.definition, 3)
          : action === 'promote'
            ? observation(definition, 2)
            : { kind: 'notNeeded' },
    now,
    allocatedId: action === 'replace' ? successorId : null,
    quotaObservation: {
      guardRef: 'guard:quota',
      resultingHolding:
        action === 'stop' || action === 'discard'
          ? { kind: 'released', releaseRef: 'release:one' }
          : action === 'replace'
            ? { kind: 'held', reservationRef: 'reservation:new' }
            : null,
    },
  }
}
export function createInput(initial: 'active' | 'draft' = 'active'): ManagementDecisionInput {
  const request: ManagementRequest = {
    kind: 'create',
    input: {
      definition,
      initial: initial === 'active' ? { kind: 'active' } : { kind: 'draft', reason: 'Prepare' },
      meta: { operationKey: 'create:one', expectedRevision: null, consentRef: null },
    },
  }
  return {
    requestId: context.requestId,
    request,
    operation: createScheduleManagementIdentity(scope, request),
    current: null,
    access: access(),
    definition: observation(),
    now,
    allocatedId: scheduleId,
    quotaObservation: {
      guardRef: 'guard:quota',
      resultingHolding: { kind: 'held', reservationRef: 'reservation:one' },
    },
  }
}
