import { Temporal } from '@js-temporal/polyfill'
import type {
  ScheduleControl,
  ScheduleDomainError,
  ScheduleStanding,
  ScheduleView,
} from '@omne-harness/schedule-contract'
import type {
  ManagementDecisionInput,
  ManagementDecision,
  ScheduleRecord,
  QuotaEffect,
} from './types.ts'
import { managementError } from './errors.ts'
import { decisionIdentityMatches } from './identity.ts'
import { createScheduleDefinitionRef, managementValueEqual } from './references.ts'
import {
  patchScheduleDefinition,
  requestedDefinition,
  timeIntent,
  validPatchedDefinition,
} from './definition.ts'
import { authorRef, createManagementRecord, savedDecision } from './records.ts'

function rejected(
  input: ManagementDecisionInput,
  code: ScheduleDomainError['code'],
  message: string,
): ManagementDecision {
  return { kind: 'rejected', error: managementError(input.requestId, code, message) }
}

function definitionFailure(
  input: ManagementDecisionInput,
  revision: number,
  future: boolean,
): ManagementDecision | null {
  const observation = input.definition
  if (observation.kind !== 'resolved')
    return rejected(input, 'dependency_blocked', 'Definition validation is required')
  if (
    !managementValueEqual(
      observation.definition,
      requestedDefinition(input.request, input.current),
    ) ||
    observation.basis.definitionRevision !== revision ||
    observation.complete !== true
  )
    return rejected(input, 'stale_basis', 'Definition observation does not match this revision')
  if (
    observation.next !== null &&
    (!managementValueEqual(observation.next.basis, observation.basis) ||
      Temporal.Instant.compare(observation.next.scheduledAt, observation.referenceExclusive) <= 0)
  )
    return rejected(input, 'stale_basis', 'Candidate does not match its observation')
  if (future && observation.next === null)
    return rejected(input, 'no_future_slot', 'No future occurrence exists')
  if (
    future &&
    observation.next !== null &&
    Temporal.Instant.compare(observation.next.scheduledAt, input.now) <= 0
  )
    return rejected(input, 'stale_basis', 'Candidate is no longer strictly in the future')
  return null
}

function newView(
  input: ManagementDecisionInput,
  control: 'draft' | 'active' | 'paused',
): ScheduleView | null {
  if (input.allocatedId === null || input.definition.kind !== 'resolved') return null
  const author = input.access.authority.authorOnCreate
  return {
    scheduleId: input.allocatedId,
    owner: input.operation.scope.owner,
    author,
    createdBy: authorRef(author),
    createdAt: input.now,
    definition: input.definition.definition,
    revision: 1,
    definitionRevision: 1,
    stateRevision: 1,
    timeRuleRevision: 1,
    control,
    standing: input.access.currentStanding,
    nextOccurrence: control === 'draft' ? null : input.definition.next,
    predecessorId: null,
    successorId: null,
    promotedBy: null,
    promotedAt: null,
    discardedBy: null,
    discardedAt: null,
    sourceScheduleKey: null,
    consentAdoption: input.access.consent.kind === 'adopt' ? input.access.consent.adoption : null,
    eligibleConsumed: 0,
    acceptedJobCount: 0,
    observedAt: input.now,
  }
}

function decideCreate(input: ManagementDecisionInput): ManagementDecision {
  if (input.request.kind !== 'create') return rejected(input, 'invalid_input', 'Expected create')
  if (input.current !== null) return rejected(input, 'revision_conflict', 'Schedule already exists')
  const failure = definitionFailure(input, 1, input.request.input.initial.kind === 'active')
  if (failure !== null) return failure
  if (input.access.currentStanding.kind === 'terminallyInvalidated')
    return rejected(input, 'invalid_transition', 'Authority is terminally invalidated')
  const view = newView(input, input.request.input.initial.kind)
  const quota = input.quotaObservation.resultingHolding
  if (view === null || quota?.kind !== 'held')
    return rejected(input, 'dependency_blocked', 'New identity and quota reservation are required')
  return savedDecision(
    input,
    { kind: 'insert', next: createManagementRecord(input, view, quota) },
    { kind: 'reserve', owner: view.owner, author: view.author, scheduleId: view.scheduleId },
  )
}

function permittedControl(action: string, control: ScheduleControl): boolean {
  switch (action) {
    case 'reviseDraft':
    case 'discard':
    case 'promote':
      return control === 'draft'
    case 'pause':
    case 'resume':
    case 'update':
    case 'replace':
      return control === 'active' || control === 'paused'
    case 'stop':
      return control === 'active' || control === 'paused' || control === 'stopped'
    case 'reconfirmConsent':
      return control === 'draft' || control === 'active' || control === 'paused'
    default:
      return false
  }
}

function standingMeaning(standing: ScheduleStanding) {
  return {
    kind: standing.kind,
    generation: standing.generation,
    reasons: standing.reasons,
    authorityEvidence: standing.authorityEvidence.map(
      ({ observedAt: _observedAt, ...evidence }) => evidence,
    ),
  }
}

function observedRecord(input: ManagementDecisionInput, current: ScheduleRecord): ScheduleRecord {
  const observed = input.access.currentStanding
  const standing =
    current.view.standing.kind === 'terminallyInvalidated'
      ? current.view.standing
      : observed.kind !== 'ready'
        ? observed
        : current.view.standing
  const consentLock =
    current.consentLock.kind === 'reconfirmationRequired'
      ? current.consentLock
      : input.access.consentLock
  return { ...current, consentLock, view: { ...current.view, standing } }
}

function finalizeUpdate(
  input: ManagementDecisionInput,
  current: ScheduleRecord,
  candidate: ScheduleRecord,
  quota: QuotaEffect = { kind: 'none' },
): ManagementDecision {
  const before = current.view
  const after = candidate.view
  const definitionChanged = !managementValueEqual(before.definition, after.definition)
  const stateChanged =
    before.control !== after.control ||
    !managementValueEqual(standingMeaning(before.standing), standingMeaning(after.standing)) ||
    !managementValueEqual(before.consentAdoption, after.consentAdoption) ||
    !managementValueEqual(current.consentLock, candidate.consentLock)
  if (!definitionChanged && !stateChanged)
    return savedDecision(
      input,
      { kind: 'noChange', expectedRevision: before.revision, current },
      { kind: 'none' },
    )
  const definitionRevision = before.definitionRevision + Number(definitionChanged)
  const view: ScheduleView = {
    ...after,
    revision: before.revision + 1,
    definitionRevision,
    timeRuleRevision:
      before.timeRuleRevision +
      Number(!managementValueEqual(timeIntent(before.definition), timeIntent(after.definition))),
    stateRevision: before.stateRevision + Number(stateChanged),
    observedAt: input.now,
  }
  const next: ScheduleRecord = {
    ...candidate,
    adoptedBasis:
      definitionChanged && candidate.adoptedBasis !== null
        ? { ...candidate.adoptedBasis, definitionRevision }
        : candidate.adoptedBasis,
    view: {
      ...view,
      nextOccurrence:
        definitionChanged && view.nextOccurrence !== null
          ? { ...view.nextOccurrence, basis: { ...view.nextOccurrence.basis, definitionRevision } }
          : view.nextOccurrence,
    },
    definitionRef: createScheduleDefinitionRef(view),
  }
  return savedDecision(input, { kind: 'update', expectedRevision: before.revision, next }, quota)
}

function decideExisting(
  input: ManagementDecisionInput,
  current: ScheduleRecord,
): ManagementDecision {
  if (input.request.kind !== 'execute') return rejected(input, 'invalid_input', 'Expected execute')
  const command = input.request.input
  if (command.meta.expectedRevision !== current.view.revision)
    return rejected(input, 'revision_conflict', 'Schedule revision changed')
  const terminalStanding =
    current.view.standing.kind === 'terminallyInvalidated' ||
    input.access.currentStanding.kind === 'terminallyInvalidated'
  if (
    !permittedControl(command.action, current.view.control) ||
    (terminalStanding && !(command.action === 'stop' && input.access.authority.role === 'owner'))
  )
    return rejected(input, 'invalid_transition', 'Action is not permitted in this state')
  const next = observedRecord(input, current)
  const view = next.view
  switch (command.action) {
    case 'update': {
      const definition = patchScheduleDefinition(view.definition, command.patch)
      if (definition === null || !validPatchedDefinition(definition).success)
        return rejected(input, 'invalid_input', 'Patch does not match the work kind')
      return finalizeUpdate(input, current, { ...next, view: { ...view, definition } })
    }
    case 'reviseDraft': {
      const revision =
        view.definitionRevision + Number(!managementValueEqual(view.definition, command.definition))
      const failure = definitionFailure(input, revision, false)
      if (failure !== null) return failure
      if (input.definition.kind !== 'resolved')
        return rejected(input, 'dependency_blocked', 'Definition is unavailable')
      return finalizeUpdate(input, current, {
        ...next,
        adoptedBasis: input.definition.basis,
        view: { ...view, definition: command.definition },
      })
    }
    case 'promote': {
      const failure = definitionFailure(input, view.definitionRevision, true)
      if (failure !== null) return failure
      if (input.definition.kind !== 'resolved')
        return rejected(input, 'dependency_blocked', 'Definition is unavailable')
      if (next.consentLock.kind !== 'clear')
        return rejected(input, 'consent_required', 'Explicit consent reconfirmation is required')
      return finalizeUpdate(input, current, {
        ...next,
        activationExclusive: input.now,
        adoptedBasis: input.definition.basis,
        view: {
          ...view,
          control: 'active',
          nextOccurrence: input.definition.next,
          promotedBy: input.operation.scope.actor.actorRef,
          promotedAt: input.now,
          consentAdoption:
            input.access.consent.kind === 'adopt'
              ? input.access.consent.adoption
              : view.consentAdoption,
        },
      })
    }
    case 'pause':
    case 'resume':
      return finalizeUpdate(input, current, {
        ...next,
        view: { ...view, control: command.action === 'pause' ? 'paused' : 'active' },
      })
    case 'discard':
    case 'stop': {
      let quota: QuotaEffect = { kind: 'none' }
      let holding = current.quota
      if (holding.kind === 'held') {
        if (input.quotaObservation.resultingHolding?.kind !== 'released')
          return rejected(input, 'dependency_blocked', 'Quota release evidence is required')
        quota = {
          kind: 'release',
          reservationRef: holding.reservationRef,
          scheduleId: view.scheduleId,
        }
        holding = input.quotaObservation.resultingHolding
      }
      return finalizeUpdate(
        input,
        current,
        {
          ...next,
          quota: holding,
          view: {
            ...view,
            control: command.action === 'discard' ? 'discarded' : 'stopped',
            nextOccurrence: null,
            discardedBy:
              command.action === 'discard'
                ? input.operation.scope.actor.actorRef
                : view.discardedBy,
            discardedAt: command.action === 'discard' ? input.now : view.discardedAt,
          },
        },
        quota,
      )
    }
    case 'reconfirmConsent': {
      if (input.access.authority.role !== 'owner')
        return rejected(input, 'forbidden', 'Only the owner can reconfirm consent')
      if (
        input.access.consent.kind !== 'adopt' ||
        input.access.consent.adoption.grantRef !== command.newConsentRef
      )
        return rejected(
          input,
          'consent_required',
          'Reconfirmation requires the named current grant',
        )
      return finalizeUpdate(input, current, {
        ...next,
        consentLock: { kind: 'clear' },
        view: {
          ...view,
          standing: input.access.currentStanding,
          consentAdoption: input.access.consent.adoption,
        },
      })
    }
    case 'replace':
      return decideReplace(input, current)
  }
}

export function decideScheduleManagement(input: ManagementDecisionInput): ManagementDecision {
  if (!decisionIdentityMatches(input))
    return rejected(
      input,
      'forbidden',
      'Management identity does not match its authority or record',
    )
  if (input.request.kind === 'create') return decideCreate(input)
  if (input.current === null) return rejected(input, 'not_found', 'Schedule was not found')
  return decideExisting(input, input.current)
}

function decideReplace(
  input: ManagementDecisionInput,
  current: ScheduleRecord,
): ManagementDecision {
  const failure = definitionFailure(input, 1, true)
  if (failure !== null) return failure
  if (current.view.control !== 'active' && current.view.control !== 'paused')
    return rejected(
      input,
      'invalid_transition',
      'Only an active or paused schedule can be replaced',
    )
  const view = newView(input, current.view.control)
  const holding = input.quotaObservation.resultingHolding
  if (
    view === null ||
    view.scheduleId === current.view.scheduleId ||
    holding?.kind !== 'held' ||
    current.quota.kind !== 'held'
  )
    return rejected(
      input,
      'dependency_blocked',
      'Replacement requires a new identity and a quota transfer',
    )
  if (current.consentLock.kind !== 'clear' || input.access.consentLock.kind !== 'clear')
    return rejected(input, 'consent_required', 'Replacement cannot bypass consent reconfirmation')
  const successor = createManagementRecord(
    input,
    { ...view, predecessorId: current.view.scheduleId },
    holding,
  )
  const predecessor: ScheduleRecord = {
    ...current,
    quota: {
      kind: 'transferred',
      reservationRef: current.quota.reservationRef,
      successorId: view.scheduleId,
    },
    view: {
      ...current.view,
      control: 'superseded',
      successorId: view.scheduleId,
      revision: current.view.revision + 1,
      stateRevision: current.view.stateRevision + 1,
      nextOccurrence: null,
      observedAt: input.now,
    },
  }
  return savedDecision(
    input,
    { kind: 'replace', expectedRevision: current.view.revision, predecessor, successor },
    {
      kind: 'transfer',
      reservationRef: current.quota.reservationRef,
      predecessorId: current.view.scheduleId,
      successorId: view.scheduleId,
      owner: view.owner,
      author: view.author,
    },
  )
}
