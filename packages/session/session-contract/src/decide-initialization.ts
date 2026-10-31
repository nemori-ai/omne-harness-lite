import type { SessionCommand, GuardCommand } from './ports.ts'
import type { Decision, DecideReads, EncodedEntry } from './judgments.ts'
import type { SessionFailure } from './faces.ts'
import type { WorkSnapshot, ContextScopeBinding } from './values.ts'
import type { SessionOperationId } from './identity.ts'
import { encodeEntry, decodeEntry, type SessionEntry } from './entries.ts'
import { scopeBinding } from './decide-management.ts'
import {
  entries,
  invalid,
  originOf,
  rejected,
  residentEntries,
  sourceOf,
} from './decision-support.ts'
import { InitializationInvalid } from './initialization-parse.ts'
import {
  initializationKey,
  sameInitializationValue as same,
  type InitializationPlanItem,
} from './initialization-plan.ts'
import { initializationGuard, validateAdoption } from './initialization-validation.ts'
import type {
  InitializationAdoption,
  InitializationGuardFacts,
  InitializationGuardResult,
  InitializationState,
} from './initialization-schema.ts'

class InitializationRefusal extends Error {
  readonly failure: SessionFailure

  constructor(failure: SessionFailure) {
    super(failure.kind)
    this.failure = failure
  }
}

function withInitialization(action: () => Decision): Decision {
  try {
    return action()
  } catch (error) {
    if (error instanceof InitializationRefusal) return rejected(error.failure)
    if (error instanceof InitializationInvalid || error instanceof TypeError)
      return invalid('initialization', error.message)
    throw error
  }
}

function adoptionEntries(
  snapshot: Pick<WorkSnapshot, 'residents'> | null,
  value: InitializationAdoption,
  createOperation: SessionOperationId,
  item: Readonly<{ owner: string; item: string }> | null,
): readonly EncodedEntry[] {
  const residents = residentEntries(
    snapshot,
    { residents: value.newResidents, keys: value.residentBindings },
    value.source,
  )
  if (residents.kind !== 'entries') {
    if (residents.kind === 'rejected') throw new InitializationRefusal(residents.failure)
    throw new InitializationInvalid('resident adoption cannot be recalled independently')
  }
  return [
    encodeEntry(
      {
        kind: 'session.adoption',
        adopted: value.adopted,
        residentKeys: value.residentBindings,
        initialization: { createOperation, item, adoption: value },
      },
      originOf(value.source),
    ),
    ...residents.entries,
  ]
}

function verifyRegistrationHistory(
  snapshot: WorkSnapshot | null,
  state: InitializationState,
  scope: string,
): void {
  const remaining = state.registrations.filter(item => item.decision.scope === scope)
  const records =
    snapshot?.contextRecords?.filter(
      item => item.scope === scope && item.declaration.kind === 'context-registration',
    ) ?? []
  for (const record of records) {
    const index = remaining.findIndex(item =>
      same(record.declaration, {
        kind: 'context-registration',
        registration: item.prepared,
        need: item.decision.need,
        binding: item.decision.binding,
        parameters: item.decision.parameters,
      }),
    )
    if (index === -1)
      throw new InitializationRefusal({
        kind: 'unavailable',
        owner: 'session-history',
        diagnostic: 'the original scope has a registration without a saved registration revision',
      })
    remaining.splice(index, 1)
  }
  if (remaining.length > 0)
    throw new InitializationRefusal({
      kind: 'unavailable',
      owner: 'session-history',
      diagnostic: 'the original scope registration history is incomplete',
    })
}

function successfulFacts(
  snapshot: WorkSnapshot | null,
  state: InitializationState,
  plan: InitializationPlanItem,
  outcome: InitializationGuardResult,
  batchEntries: EncodedEntry[],
  operation: SessionOperationId,
  scope: ContextScopeBinding | undefined,
): readonly EncodedEntry[] {
  const consequence = outcome.consequence
  if (
    consequence === null ||
    consequence.kind === 'identity' ||
    consequence.kind === 'workspace-load'
  )
    return []
  if (consequence.kind === 'execution-ready') {
    if (consequence.adoption === null) return []
    validateAdoption(consequence.adoption, state.initialAdoption)
    const prior = snapshot?.initialization?.initialAdoption ?? state.initialAdoption
    const residentView = snapshot?.residents ?? state.initialAdoption.newResidents
    const hasNewResident = consequence.adoption.newResidents.some(
      resident => !residentView.some(known => known.capability === resident.capability),
    )
    if (same(consequence.adoption.capabilities, prior.capabilities) && !hasNewResident)
      throw new InitializationInvalid(
        'execution readiness asserts an adoption without new capability facts',
      )
    return adoptionEntries(
      snapshot ?? { residents: state.initialAdoption.newResidents },
      consequence.adoption,
      state.createOperation,
      plan,
    )
  }
  const decision = consequence.decision
  if (scope === undefined || scope.ended !== null || scope.scope !== decision.scope)
    throw new InitializationInvalid(
      'registration does not belong to the live original creation scope',
    )
  verifyRegistrationHistory(snapshot, state, decision.scope)
  const prior = state.registrations.filter(item => item.decision.scope === decision.scope)
  const inBatch = batchEntries.flatMap(entry => {
    if (entry.kind !== 'session.context-registration-changed') return []
    const decoded = decodeRegistration(entry)
    return decoded === null ? [] : [decoded]
  })
  if ([...prior.map(item => item.decision), ...inBatch].some(item => item.key === decision.key))
    throw new InitializationInvalid('the same original registration identity appears twice')
  const expected = inBatch.at(-1)?.revision ?? prior.at(-1)?.decision.revision ?? 0
  if (decision.basedOn !== expected)
    throw new InitializationRefusal({
      kind: 'changed',
      revision: snapshot?.revision ?? ('0' as WorkSnapshot['revision']),
    })
  return [
    encodeEntry(
      {
        kind: 'session.context-registration-changed',
        scope: decision.scope,
        declaration: {
          kind: 'context-registration',
          need: decision.need,
          binding: decision.binding,
          parameters: decision.parameters,
          registration: consequence.prepared,
        },
        initialization: {
          createOperation: state.createOperation,
          plan,
          prepared: consequence.prepared,
          decision,
        },
      },
      originOf(sourceOf(operation, 'initialization-registration')),
    ),
  ]
}

function decodeRegistration(entry: EncodedEntry) {
  const decoded = decodeEntry(entry)
  return 'ok' in decoded && decoded.ok.kind === 'session.context-registration-changed'
    ? (decoded.ok.initialization?.decision ?? null)
    : null
}

function resultEntries(
  snapshot: WorkSnapshot | null,
  state: InitializationState,
  facts: InitializationGuardFacts,
  start: readonly EncodedEntry[],
  operation: SessionOperationId,
  scope: ContextScopeBinding | undefined,
): readonly EncodedEntry[] {
  const out = [...start]
  for (const plan of state.plan) {
    const outcome = facts.results.find(
      result => initializationKey(result) === initializationKey(plan),
    )
    if (outcome === undefined) continue
    const added = successfulFacts(snapshot, state, plan, outcome, out, operation, scope)
    const references = added.map((_, index) => ({
      kind: 'batch' as const,
      ordinal: out.length + index,
    }))
    out.push(...added)
    const proof =
      outcome.result.result.kind === 'ready'
        ? outcome.result.result.evidence
        : outcome.result.result.recovery
    out.push(
      encodeEntry(
        {
          kind: 'session.initialization-item',
          result: outcome.result,
          createOperation: state.createOperation,
          operation,
          plan,
          outcome,
          facts: references,
        },
        { owner: outcome.owner, via: 'intake', source: proof },
      ),
    )
  }
  return out
}

export function decideInitializationCreate(
  command: Extract<SessionCommand, { kind: 'create' }>,
  guards: readonly GuardCommand[],
): Decision {
  return withInitialization(() => {
    const facts = initializationGuard(null, command, guards)
    if (facts.initialAdoption === null || facts.requirements === null)
      throw new InitializationInvalid('missing initial adoption or requirements')
    const state: InitializationState = {
      protocol: 1,
      createOperation: command.input.operation,
      initialAdoption: facts.initialAdoption,
      requirements: facts.requirements,
      plan: facts.plan,
      results: [],
      registrations: [],
      input: facts.input,
    }
    const { candidate: _candidate, ...adoption } = facts.initialAdoption
    const created: Extract<SessionEntry, { kind: 'session.created' }> = {
      kind: 'session.created',
      ...command.input,
      initializationProtocol: 1,
      initialAdoption: facts.initialAdoption,
      requirements: facts.requirements,
      plan: facts.plan,
      input: facts.input,
      items: facts.plan.map(item => ({
        item: item.item,
        owner: item.owner,
        protocol: item.protocol,
        input: item.originalInput,
      })),
    }
    const initial = [
      encodeEntry(created, originOf(facts.initialAdoption.source)),
      ...adoptionEntries(null, adoption, command.input.operation, null),
    ]
    return entries(
      resultEntries(
        null,
        state,
        facts,
        initial,
        command.input.operation,
        scopeBinding(command.input, command.input.operation),
      ),
    )
  })
}

export function decideInitializationComplete(
  snapshot: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'completeInitialization' }>,
  guards: readonly GuardCommand[],
  reads: DecideReads,
): Decision {
  return withInitialization(() => {
    const state = snapshot.initialization
    if (state === undefined)
      return rejected({
        kind: 'unavailable',
        owner: 'session-log',
        diagnostic: 'original initialization protocol and plan are unavailable',
      })
    if (
      !state.plan.some(item => initializationKey(item) === initializationKey(command.input.result))
    )
      return invalid('result.item', 'not an original initialization item')
    const facts = initializationGuard(snapshot, command, guards)
    const incoming = facts.results[0]
    if (incoming === undefined) throw new InitializationInvalid('missing initialization result')
    const prior = state.results.filter(
      item => initializationKey(item.outcome) === initializationKey(incoming),
    )
    const ready = prior.find(item => item.outcome.result.result.kind === 'ready')
    const match = prior.find(item => same(item.outcome, incoming))
    if (ready !== undefined && !same(ready.outcome, incoming))
      return rejected({ kind: 'conflict', operation: ready.operation })
    if (match !== undefined) {
      const receipt = reads.initializationReceipts?.find(
        receipt =>
          receipt.operation === match.operation &&
          receipt.revision === match.revision &&
          receipt.first === match.range.first &&
          receipt.last === match.range.last,
      )
      if (receipt === undefined)
        return rejected({
          kind: 'unavailable',
          owner: 'session-history',
          diagnostic: 'the original initialization result receipt is unavailable',
        })
      return { kind: 'recovered', receipt }
    }
    return entries(
      resultEntries(
        snapshot,
        state,
        facts,
        [],
        command.input.operation,
        snapshot.contextScopes?.[0],
      ),
    )
  })
}

export function validateInitializationRecall(
  previous: WorkSnapshot | null,
  command: Extract<SessionCommand, { kind: 'create' | 'completeInitialization' }>,
  guards: readonly GuardCommand[],
): Decision | null {
  const checked = withInitialization(() => {
    initializationGuard(previous, command, guards)
    return entries([])
  })
  return checked.kind === 'rejected' ? checked : null
}
