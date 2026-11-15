import type {
  AcceptedInput,
  Adoption,
  AgentCheckpoint,
  AgentOperationId,
  CancellationJudgmentInput,
  CancellationJudgmentRecord,
  CancellationUnknown,
  CandidateSupersession,
  ContinuationRequest,
  CardReconciliationRecord,
  CardRound,
  ConsumerRef,
  ControlRecord,
  CoverageFacet,
  DurableEvidence,
  EffectIntent,
  ExecutionSettlement,
  FinishCandidate,
  FinishCandidateContent,
  FinishIntent,
  FinishObligation,
  FinishObligations,
  FinishRoute,
  InputBatchId,
  LegacyInvocationReturn,
  MigrationRecord,
  ObligationCategory,
  ObligationDisposition,
  PendingReason,
  RecoveryContinuation,
  ResponsibilityCoverage,
  ToolAssociationRecord,
} from '@omne-harness/agent-contract'
import { obligationCategoryOf } from '@omne-harness/agent-contract'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import type { MemoryExecution } from './journal.ts'
import { journalEvidence, JOURNAL_OWNER, revisionOf } from './journal-values.ts'
import { canonical } from '../canonical.ts'

export type FinishingRecords = {
  candidates: FinishCandidate[]
  routes: FinishRoute[]
  current: AgentOperationId | null
  currentRoute: string | null
  supersessions: CandidateSupersession[]
  migrations: MigrationRecord[]
  judgments: CancellationJudgmentRecord[]
  currentJudgment: AgentOperationId | null
  cardReconciliations: CardReconciliationRecord[]
  legacyReturns: LegacyInvocationReturn[]
  toolAssociations: ToolAssociationRecord[]
  issued: Map<string, FinishObligations>
  obligations: string | null
  effectOperations: Map<string, AgentOperationId>
}

export function emptyFinishing(): FinishingRecords {
  return {
    candidates: [],
    routes: [],
    current: null,
    currentRoute: null,
    supersessions: [],
    migrations: [],
    judgments: [],
    currentJudgment: null,
    cardReconciliations: [],
    legacyReturns: [],
    toolAssociations: [],
    issued: new Map(),
    obligations: null,
    effectOperations: new Map(),
  }
}

export const CATEGORY_ORDER: readonly ObligationCategory[] = [
  'inputs',
  'controls',
  'operations',
  'passages',
  'custody',
]

export function currentCandidate(records: FinishingRecords): FinishCandidate | undefined {
  return records.candidates.find(candidate => candidate.candidate === records.current)
}

export function currentRoute(records: FinishingRecords): FinishRoute | undefined {
  return records.routes.find(route => route.record.record === records.currentRoute)
}

export function routeByRecord(
  records: FinishingRecords,
  record: DurableEvidence,
): FinishRoute | undefined {
  return records.routes.find(route => route.record.record === record.record)
}

export function currentObligations(records: FinishingRecords): FinishObligations | undefined {
  return records.obligations === null ? undefined : records.issued.get(records.obligations)
}

export function currentJudgment(records: FinishingRecords): CancellationJudgmentRecord | undefined {
  return records.judgments.find(judgment => judgment.operation === records.currentJudgment)
}

export type CandidateContent = FinishCandidateContent & Readonly<{ checkpoint: AgentCheckpoint }>

export function sameContent(left: CandidateContent, right: CandidateContent): boolean {
  const content = (value: CandidateContent) =>
    canonical({
      origin: value.origin,
      conclusion: value.conclusion,
      failure: value.failure,
      inputWatermark: value.inputWatermark,
      conditions: value.conditions,
      checkpoint: value.checkpoint,
    })
  return content(left) === content(right)
}

export function beforeTerminalOf(records: FinishingRecords): DurableEvidence | null {
  const route = currentRoute(records)
  if (route === undefined) return null
  if (route.kind === 'author') return route.beforeTerminal
  return currentJudgment(records)?.evidence ?? null
}

export function intentOf(records: FinishingRecords): FinishIntent | undefined {
  const candidate = currentCandidate(records)
  if (candidate === undefined) return undefined
  return {
    candidate: candidate.candidate,
    conclusion: candidate.conclusion,
    inputWatermark: candidate.inputWatermark,
    obligations: currentObligations(records)?.evidence ?? null,
    beforeTerminal: beforeTerminalOf(records),
    failure: candidate.failure,
  }
}

export function settlementOf(records: FinishingRecords): ExecutionSettlement {
  return {
    candidate: currentCandidate(records) ?? null,
    route: currentRoute(records) ?? null,
    currentJudgment: records.currentJudgment,
    candidates: records.candidates,
    routes: records.routes,
    supersessions: records.supersessions,
    migrations: records.migrations,
    judgments: records.judgments,
    cardReconciliations: records.cardReconciliations,
    legacyReturns: records.legacyReturns,
    toolAssociations: records.toolAssociations,
  }
}

export function beforeTerminalPending(checkpoint: AgentCheckpoint): boolean {
  return checkpoint.passages.some(
    passage => passage.position === 'before_terminal' && passage.progress.kind !== 'applied',
  )
}

export type ObligationSource = Pick<
  MemoryExecution,
  | 'id'
  | 'tenant'
  | 'revision'
  | 'checkpoint'
  | 'inputs'
  | 'controls'
  | 'results'
  | 'effects'
  | 'events'
  | 'entries'
  | 'acknowledged'
  | 'handoffs'
> &
  Readonly<{ finishing: FinishingRecords }>

const JOURNAL_CUSTODIAN: ConsumerRef = Object.freeze({
  owner: JOURNAL_OWNER,
  work: 'execution',
  position: 'journal',
  purpose: 'custody',
})

const RECORD_SCHEMA: Adoption = Object.freeze({
  owner: JOURNAL_OWNER,
  name: 'journal-record',
  revision: '1',
  digest: 'memory:journal-record',
})

function ofRecord(
  record: DurableEvidence,
): Extract<ContinuationRequest<never>, { kind: 'record' }> {
  return { kind: 'record', schema: RECORD_SCHEMA, record }
}

function ofParameters<T>(value: T): Extract<ContinuationRequest<T>, { kind: 'parameters' }> {
  return { kind: 'parameters', value }
}

const BY_JOURNAL = Object.freeze({ owner: JOURNAL_OWNER, custodian: null })

function settled(completion: DurableEvidence): ObligationDisposition {
  return { kind: 'settled', completion }
}

function held(
  retained: DurableEvidence,
  continuation: RecoveryContinuation,
  custodian: ConsumerRef = JOURNAL_CUSTODIAN,
): ObligationDisposition {
  return { kind: 'held', custodian, acceptance: retained, retained, continuation }
}

function pending(reason: PendingReason, required: RecoveryContinuation): ObligationDisposition {
  return { kind: 'pending', reason, required }
}

function unknown(
  key: string,
  position: DurableEvidence,
  reason: CancellationUnknown['reason'],
  required: RecoveryContinuation,
): ObligationDisposition {
  return {
    kind: 'unknown',
    question: { owner: JOURNAL_OWNER, key, position, reason },
    required,
  }
}

function defect(what: string): never {
  throw new Error(`memory Journal defect: ${what}`)
}

export type PendingOperation = Readonly<{ operation: AgentOperationId; method: string }>

export function buildObligations(
  source: ObligationSource,
  candidate: FinishCandidate,
  pendingOperations: readonly PendingOperation[],
): Readonly<{ items: readonly FinishObligation[]; coverage: ResponsibilityCoverage }> {
  const cancelled = candidate.conclusion.kind === 'cancelled'
  const nodeFailed =
    candidate.conclusion.kind === 'fail' && candidate.failure?.kind === 'node-failed'
  const complete = candidate.conclusion.kind === 'complete'
  const fixed = (what: string): DurableEvidence =>
    journalEvidence(`${source.id}/obligation/${what}`, 0)
  const items: FinishObligation[] = []
  const takenInputs = new Map<AcceptedInput['id'], InputBatchId>()
  for (const event of source.events)
    if (event.body.kind === 'input-taken')
      for (const input of event.body.batch.ordered) takenInputs.set(input, event.body.batch.id)
  source.inputs.forEach((input: AcceptedInput) => {
    const taken = takenInputs.get(input.id) ?? null
    const key = input.id
    const sourceEvidence = fixed(`input/${key}`)
    const accepted = acceptanceOf(source, input)
    const read: RecoveryContinuation = {
      kind: 'input-read',
      request: ofParameters({ input: input.id }),
      ...BY_JOURNAL,
      purpose: 'load',
    }
    items.push({
      kind: 'accepted-input',
      key,
      source: sourceEvidence,
      version: sourceEvidence,
      position: null,
      disposition:
        taken !== null
          ? settled(fixed(`input/${key}/taken/${taken}`))
          : cancelled || nodeFailed
            ? held(sourceEvidence, read)
            : pending('input-disposition', read),
      input: input.id,
      value: input,
      acceptance: accepted.entry,
      origin: input.source ?? accepted.record,
      taken,
    })
  })
  for (const control of source.controls) {
    const key = control.operation
    const sourceEvidence = control.stages.accepted.source
    const intent = control.stages['intent-established']
    const revoked = control.stages['qualification-revoked']
    const query: RecoveryContinuation = {
      kind: 'original-operation-query',
      request: ofParameters({ execution: source.id, operation: control.operation }),
      ...BY_JOURNAL,
      purpose: 'query',
    }
    items.push({
      kind: 'control',
      key,
      source: sourceEvidence,
      version: fixed(`control/${key}`),
      position: null,
      disposition:
        intent?.state === 'unresolved'
          ? pending('cancel-intent', query)
          : revoked?.state === 'unresolved'
            ? pending('qualification-revocation', query)
            : lateStageUnresolved(control)
              ? held(sourceEvidence, {
                  kind: 'restore-source',
                  request: ofRecord(sourceEvidence),
                  ...BY_JOURNAL,
                  purpose: 'query',
                })
              : settled(intent?.source ?? sourceEvidence),
      control: control.operation,
    })
  }
  for (const { operation, method } of pendingOperations) {
    const sourceEvidence = fixed(`operation/${operation}`)
    items.push({
      kind: 'operation',
      key: operation,
      source: sourceEvidence,
      version: sourceEvidence,
      position: null,
      disposition: unknown(operation, sourceEvidence, 'original-operation-unknown', {
        kind: 'original-operation-query',
        request: ofParameters({ execution: source.id, operation }),
        ...BY_JOURNAL,
        purpose: 'query',
      }),
      operation,
      method,
      request: sourceEvidence,
      resolution: 'unknown',
      result: null,
    })
  }
  for (const record of source.handoffs) {
    if (record.history.kind !== 'pending') continue
    const key = canonical(record.handoff)
    const sourceEvidence = record.prepared ?? fixed(`handoff/${key}`)
    const lookup: RecoveryContinuation = {
      kind: 'handoff-lookup',
      request: ofRecord(sourceEvidence),
      ...BY_JOURNAL,
      purpose: 'read-message-handoff',
    }
    items.push({
      kind: 'handoff',
      key,
      source: sourceEvidence,
      version: sourceEvidence,
      position: null,
      disposition: complete ? pending('handoff-history', lookup) : held(sourceEvidence, lookup),
      handoff: record.handoff,
      record: { ...record, custody: null },
    })
  }
  for (const effect of source.effects) {
    const key = effect.action
    const sourceEvidence = effect.pending.fixed
    const associations = source.finishing.toolAssociations.filter(
      item => item.intent.action === effect.action,
    )
    const association =
      associations.find(item => item.association.kind === 'accepted') ?? associations.at(-1)
    const result = source.results.find(item => item.consumption === effect.pending.consumption)
    const received = source.entries.find(
      entry => entry.kind === 'received' && entry.consumption === effect.pending.consumption,
    )
    const call =
      effect.pending.kind === 'model' ? callOfModel(effect.pending.reference, source) : null
    const finalFailure =
      call === null
        ? null
        : (source.finishing.candidates.find(
            item =>
              item.conclusion.kind === 'fail' &&
              (item.failure?.kind === 'no-reply' || item.failure?.kind === 'model-refused') &&
              item.failure.call === call,
          )?.failure?.source ?? null)
    const voided = source.checkpoint.voided.find(item => item.action === effect.action)
    const intent =
      source.finishing.effectOperations.get(effect.action) ??
      defect(`the effect ${effect.action} has no establishing operation`)
    items.push({
      kind: 'call',
      key,
      source: sourceEvidence,
      version: fixed(`call/${key}`),
      position: effect.pending.position,
      disposition:
        result !== undefined
          ? settled(result.result.source)
          : received?.kind === 'received'
            ? settled(received.material)
            : finalFailure !== null
              ? settled(finalFailure)
              : voided !== undefined
                ? settled(voided.basis)
                : association !== undefined
                  ? associationDisposition(association, effect)
                  : unknown(key, sourceEvidence, 'original-operation-unknown', {
                      kind: 'producer-query',
                      request: ofParameters({ pending: effect.pending }),
                      ...BY_JOURNAL,
                      purpose: 'query',
                    }),
      action: effect.action,
      intent,
      pending: effect.pending,
      started: association?.obligation.kind === 'call' ? association.obligation.started : null,
      outcome: result?.result.source ?? null,
      interruptions: interruptionsOf(effect, source),
      custodian: association?.obligation.kind === 'call' ? association.obligation.custodian : null,
    })
  }
  for (const passage of source.checkpoint.passages) {
    const key = passage.id
    const applied = passage.progress.kind === 'applied'
    const superseded = cancelled && passage.position === 'before_terminal'
    const route = routeOfPassage(source.finishing, candidate, superseded)
    const own = route?.kind === 'author' && route.candidate === candidate.candidate
    const lookup: RecoveryContinuation = {
      kind: 'card-lookup',
      request: ofRecord(passage.input),
      ...BY_JOURNAL,
      purpose: 'reconcile',
    }
    items.push({
      kind: 'passage',
      key,
      source: passage.effective,
      version: fixed(`passage/${key}`),
      position: null,
      disposition: applied
        ? settled(passage.effective)
        : cancelled || passage.position === 'after_terminal'
          ? held(passage.effective, lookup)
          : pending('passage-custody', lookup),
      passage,
      candidate:
        superseded && !own
          ? (supersededCandidate(source.finishing, candidate) ??
            defect(`the cancelled candidate ${candidate.candidate} superseded no candidate`))
          : candidate.candidate,
      route: route?.record ?? defect(`the passage ${key} belongs to no route`),
      implementation: passage.implementation,
      superseded,
    })
    if (passage.progress.kind !== 'asked') continue
    for (const round of passage.progress.rounds) {
      const reconciliations = source.finishing.cardReconciliations.filter(
        item => item.passage === passage.id && item.round === round.round,
      )
      const reconciled =
        reconciliations.find(item => item.obligation.disposition.kind !== 'unknown') ??
        reconciliations.at(-1)
      const roundKey = `${passage.id}/${round.round}`
      const roundEvidence = fixed(`card-round/${roundKey}`)
      const roundLookup: RecoveryContinuation = {
        kind: 'card-lookup',
        request: ofParameters({ passage: passage.id, round: round.round }),
        ...BY_JOURNAL,
        purpose: 'reconcile',
      }
      items.push(
        reconciled?.obligation ?? {
          kind: 'card-round',
          key: roundKey,
          source: roundEvidence,
          version: roundEvidence,
          position: null,
          disposition: cancelled
            ? held(roundEvidence, roundLookup)
            : pending('card-custody', roundLookup),
          passage: passage.id,
          round,
          present: presentOf(round),
          lookups: [],
          invalidate: null,
        },
      )
    }
  }
  for (const responsibility of source.results) {
    const key = `${responsibility.result.producer.kind}/${responsibility.result.producer.call}/${responsibility.result.version}/${responsibility.consumption}`
    const parameters = { result: responsibility.result, consumption: responsibility.consumption }
    items.push({
      kind: 'result',
      key,
      source: responsibility.result.source,
      version: fixed(`result/${key}`),
      position: null,
      disposition:
        responsibility.completion !== null
          ? settled(responsibility.completion)
          : responsibility.custody !== null
            ? held(responsibility.custody, {
                kind: 'producer-release',
                request: ofParameters(parameters),
                ...BY_JOURNAL,
                purpose: 'reconcile',
              })
            : pending('result-custody', {
                kind: 'producer-receive',
                request: ofParameters(parameters),
                ...BY_JOURNAL,
                purpose: 'reconcile',
              }),
      responsibility,
      material: null,
    })
  }
  if (source.events.length > 0) {
    const retention = fixed('output')
    const emittedThrough = String(source.events.length)
    items.push({
      kind: 'output',
      key: `output/1-${source.events.length}`,
      source: retention,
      version: retention,
      position: null,
      disposition: held(retention, {
        kind: 'output-read-ack',
        request: ofParameters({ after: null, through: emittedThrough }),
        ...BY_JOURNAL,
        purpose: 'acknowledge',
      }),
      emittedThrough,
      acknowledgedThrough: source.acknowledged === 0 ? null : String(source.acknowledged),
      retention,
    })
  }
  for (const passage of source.checkpoint.passages) {
    if (passage.position !== 'after_terminal') continue
    const key = passage.id
    const terminal = fixed('terminal')
    items.push({
      kind: 'terminal-observation',
      key,
      source: passage.effective,
      version: fixed(`observation/${key}`),
      position: null,
      disposition: held(passage.effective, {
        kind: 'terminal-observe',
        request: ofParameters({
          passage: passage.id,
          terminal,
          implementation: passage.implementation,
        }),
        ...BY_JOURNAL,
        purpose: 'record-terminal-observation',
      }),
      observation: {
        terminal,
        passage: passage.id,
        implementation: passage.implementation,
        observed: null,
      },
      terminal: null,
    })
  }
  const facet = (name: string): CoverageFacet => {
    const version = fixed(`coverage/${name}`)
    return { owner: JOURNAL_OWNER, version, read: version }
  }
  return {
    items,
    coverage: {
      readRevision: revisionOf(source.revision),
      inputWatermark: candidate.inputWatermark,
      operations: facet('operations'),
      candidates: facet('candidates'),
      passages: facet('passages'),
      results: facet('results'),
      materials: facet('materials'),
      output: facet('output'),
      controls: facet('controls'),
      observations: facet('observations'),
      handoffs: facet('handoffs'),
    },
  }
}

function associationDisposition(
  association: ToolAssociationRecord,
  effect: EffectIntent,
): ObligationDisposition {
  const custodian = association.obligation.kind === 'call' ? association.obligation.custodian : null
  const retain: RecoveryContinuation = {
    kind: 'tool-association-retain',
    request: ofParameters({
      intent: association.intent,
      request: association.request,
      source: association.source,
      priorExcluded: association.priorExcluded,
    }),
    owner: JOURNAL_OWNER,
    custodian,
    purpose: 'reconcile',
  }
  if (association.association.kind !== 'accepted') {
    return unknown(effect.action, association.source, 'original-operation-unknown', retain)
  }
  return held(
    association.source,
    retain,
    association.obligation.kind === 'call' && association.obligation.custodian !== null
      ? association.obligation.custodian
      : JOURNAL_CUSTODIAN,
  )
}

function callOfModel(reference: unknown, source: ObligationSource): string | null {
  const parts = resolveModelInvocationRef(reference, source.tenant)
  return 'ok' in parts ? parts.ok.call : null
}

function interruptionsOf(effect: EffectIntent, source: ObligationSource): AgentOperationId[] {
  const pending = effect.pending
  return source.controls
    .filter(control => {
      const command = control.command
      if (command.kind === 'interrupt-model')
        return pending.kind === 'model' && callOfModel(pending.reference, source) === command.call
      if (command.kind === 'interrupt-tool' || command.kind === 'background-tool')
        return (
          pending.kind === 'tool' &&
          pending.association === 'associated' &&
          control.toolInvocation === pending.reference
        )
      return false
    })
    .map(control => control.operation)
}

function lateStageUnresolved(control: ControlRecord): boolean {
  return (['producer-confirmed', 'physically-stopped', 'duty-released'] as const).some(
    stage => control.stages[stage]?.state === 'unresolved',
  )
}

function presentOf(round: CardRound): DurableEvidence | null {
  const progress = round.progress
  if (progress.kind === 'requested' || progress.kind === 'present-failed') return null
  return progress.cards[0]?.card ?? null
}

function acceptanceOf(
  source: ObligationSource,
  input: AcceptedInput,
): Readonly<{ entry: AgentOperationId; record: DurableEvidence }> {
  for (const record of source.handoffs) {
    if (record.handoff.kind !== 'input' || record.handoff.input !== input.id) continue
    if (record.resolution?.kind !== 'recorded')
      return defect(`the acceptance of the input ${input.id} has no recorded outcome`)
    return { entry: record.handoff.entry, record: record.resolution.outcome.record }
  }
  return defect(`the input ${input.id} has no acceptance record`)
}

function supersededCandidate(
  records: FinishingRecords,
  candidate: FinishCandidate,
): AgentOperationId | undefined {
  return records.supersessions.find(link => link.to === candidate.candidate)?.from
}

function routeOfPassage(
  records: FinishingRecords,
  candidate: FinishCandidate,
  superseded: boolean,
): FinishRoute | undefined {
  const migration = records.migrations.find(item => item.candidate === candidate.candidate)
  if (migration !== undefined) return migration.from.route
  if (superseded) {
    const link = records.supersessions.find(item => item.to === candidate.candidate)
    if (link !== undefined) return link.route
  }
  return currentRoute(records)
}

export function categoryOf(item: FinishObligation): ObligationCategory {
  return obligationCategoryOf(item.kind)
}

export function projectionOf(items: readonly FinishObligation[]): string {
  return canonical(
    items
      .map(item => [item.kind, item.key, targetOf(item)])
      .sort((left, right) => (canonical(left) < canonical(right) ? -1 : 1)),
  )
}

export function criteriaOf(
  items: readonly FinishObligation[],
  participants: CancellationJudgmentInput['participants'],
): string {
  return canonical(
    withoutRevisions({
      items: items
        .map(item => [item.kind, item.key, targetOf(item), item.disposition])
        .sort((left, right) => (canonical(left) < canonical(right) ? -1 : 1)),
      participants:
        participants.kind === 'coordinated'
          ? participants.participants.map(fact => [fact.owner, fact.condition])
          : [],
    }),
  )
}

function withoutRevisions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutRevisions)
  if (value === null || typeof value !== 'object') return value
  const entries = Object.entries(value)
  const keys = entries.map(([key]) => key).sort()
  if (
    keys.join(',') === 'digest,owner,record,revision' &&
    entries.every(([, inner]) => typeof inner === 'string')
  )
    return Object.fromEntries(entries.filter(([key]) => key === 'owner' || key === 'record'))
  return Object.fromEntries(entries.map(([key, inner]) => [key, withoutRevisions(inner)]))
}

function targetOf(item: FinishObligation): unknown {
  switch (item.kind) {
    case 'accepted-input':
      return item.input
    case 'control':
      return item.control
    case 'operation':
      return item.operation
    case 'handoff':
      return item.handoff
    case 'call':
      return item.action
    case 'passage':
      return [item.passage.id, item.candidate]
    case 'card-round':
      return [item.passage, item.round.round]
    case 'result':
      return item.responsibility.consumption
    case 'material':
      return item.identity
    case 'output':
      return item.emittedThrough
    case 'terminal-observation':
      return item.observation.passage
  }
}

export function firstPending(items: readonly FinishObligation[]): FinishObligation | undefined {
  const pendingItems = items.filter(item => item.disposition.kind === 'pending')
  pendingItems.sort(
    (left, right) =>
      CATEGORY_ORDER.indexOf(categoryOf(left)) - CATEGORY_ORDER.indexOf(categoryOf(right)),
  )
  return pendingItems[0]
}

export function firstUnknown(items: readonly FinishObligation[]): FinishObligation | undefined {
  return items.find(item => item.disposition.kind === 'unknown')
}
