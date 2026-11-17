import type {
  AcceptedInput,
  Adoption,
  AgentCheckpoint,
  AgentExecutionId,
  AgentJournalEntry,
  AgentOperationId,
  CancellationJudgmentRecord,
  CandidateSupersession,
  CardReconciliationRecord,
  CardRound,
  ConsumerRef,
  ContinuationRequest,
  ControlRecord,
  CoverageFacet,
  DurableEvidence,
  EffectIntent,
  ExecutionSettlement,
  FailureCandidate,
  FinishCandidate,
  FinishCandidateContent,
  FinishIntent,
  FinishObligation,
  FinishObligations,
  FinishResult,
  FinishRoute,
  InputBatchId,
  LegacyInvocationReturn,
  MigrationRecord,
  ObligationCategory,
  ObligationDisposition,
  RecoveryContinuation,
  ResponsibilityCoverage,
  ResultResponsibility,
  TerminalParticipantFacts,
  ToolAssociationRecord,
  CancellationJudgmentInput,
  CommandReceipt,
  InputBatch,
  VoidedIntent,
  JournalCommitState,
  SettlementResult,
} from '@omne-harness/agent-contract'
import { obligationCategoryOf } from '@omne-harness/agent-contract'
import { canonical } from './canonical.ts'
import { JOURNAL_OWNER, journalEvidence, revisionOf } from './journal-values.ts'
import {
  blobOf,
  blobsOf,
  checkpointOf,
  cursorOf,
  type Blob,
  type BlobStore,
} from '../journal/decide.ts'
import type { CursorMembers, FactBody, FactOf, Ref } from '../journal/facts.ts'
import type { CandidateView, ExecutionView, ObligationListView, Stamp } from '../journal/view.ts'

export type FinishingRecords = {
  candidates: FinishCandidate[]
  routes: FinishRoute[]
  current: AgentOperationId | null
  route: string | null
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
    route: null,
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

export function copyFinishing(value: FinishingRecords): FinishingRecords {
  return {
    ...value,
    candidates: [...value.candidates],
    routes: [...value.routes],
    supersessions: [...value.supersessions],
    migrations: [...value.migrations],
    judgments: [...value.judgments],
    cardReconciliations: [...value.cardReconciliations],
    legacyReturns: [...value.legacyReturns],
    toolAssociations: [...value.toolAssociations],
    issued: new Map(value.issued),
    effectOperations: new Map(value.effectOperations),
  }
}

export const CATEGORY_ORDER: readonly ObligationCategory[] = [
  'inputs',
  'controls',
  'operations',
  'passages',
  'custody',
]

export function candidateOf(
  records: FinishingRecords,
  candidate: AgentOperationId | null,
): FinishCandidate | undefined {
  return candidate === null
    ? undefined
    : records.candidates.find(item => item.candidate === candidate)
}

export function currentCandidate(records: FinishingRecords): FinishCandidate | undefined {
  return candidateOf(records, records.current)
}

export function routeOf(
  records: FinishingRecords,
  record: DurableEvidence | string | null,
): FinishRoute | undefined {
  if (record === null) return undefined
  const text = typeof record === 'string' ? record : record.record
  return records.routes.find(route => route.record.record === text)
}

export function currentRoute(records: FinishingRecords): FinishRoute | undefined {
  return routeOf(records, records.route)
}

export function currentJudgment(records: FinishingRecords): CancellationJudgmentRecord | undefined {
  return records.currentJudgment === null
    ? undefined
    : records.judgments.find(judgment => judgment.operation === records.currentJudgment)
}

export function currentObligations(records: FinishingRecords): FinishObligations | undefined {
  return records.obligations === null ? undefined : records.issued.get(records.obligations)
}

export function sameContent(
  left: FinishCandidateContent | FinishCandidate,
  right: FinishCandidateContent,
): boolean {
  const content = (value: FinishCandidateContent | FinishCandidate) =>
    canonical({
      origin: value.origin,
      conclusion: value.conclusion,
      failure: value.failure,
      inputWatermark: value.inputWatermark,
      conditions: value.conditions,
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
  const list = currentObligations(records)
  return {
    candidate: candidate.candidate,
    conclusion: candidate.conclusion,
    inputWatermark: candidate.inputWatermark,
    obligations:
      list !== undefined && list.candidate === candidate.candidate ? list.evidence : null,
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

export function beforeTerminalOpen(checkpoint: AgentCheckpoint): boolean {
  return checkpoint.passages.some(
    passage => passage.position === 'before_terminal' && passage.progress.kind !== 'applied',
  )
}

export type ObligationSource = Readonly<{
  id: AgentExecutionId
  execution: string
  revision: number
  checkpoint: AgentCheckpoint
  inputs: readonly AcceptedInput[]
  committedInputBatchOf: (input: AcceptedInput) => InputBatchId | null
  acceptanceOf: (input: AcceptedInput) => AgentOperationId | undefined
  controls: readonly ControlRecord[]
  results: readonly ResultResponsibility[]
  entries: readonly AgentJournalEntry[]
  effects: readonly EffectIntent[]
  interruptionsOf: (effect: EffectIntent) => readonly AgentOperationId[]
  modelCallOf: (effect: EffectIntent) => string | null
  emitted: number
  acknowledged: number
  unpublished: readonly Extract<FinishObligation, { kind: 'handoff' }>['record'][]
  pending: readonly Readonly<{ operation: AgentOperationId; method: string }>[]
  finishing: FinishingRecords
}>

const SESSION_CUSTODIAN: ConsumerRef = Object.freeze({
  owner: JOURNAL_OWNER,
  work: 'session-log',
  position: 'journal',
  purpose: 'custody',
})

const RECORD_SCHEMA: Adoption = Object.freeze({
  owner: JOURNAL_OWNER,
  name: 'session-log-record',
  revision: '1',
  digest: 'session-log:record',
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

const settled = (completion: DurableEvidence): ObligationDisposition => ({
  kind: 'settled',
  completion,
})

function held(
  retained: DurableEvidence,
  continuation: RecoveryContinuation,
  custodian: ConsumerRef = SESSION_CUSTODIAN,
): ObligationDisposition {
  return { kind: 'held', custodian, acceptance: retained, retained, continuation }
}

function pending(
  reason: Extract<ObligationDisposition, { kind: 'pending' }>['reason'],
  required: RecoveryContinuation,
): ObligationDisposition {
  return { kind: 'pending', reason, required }
}

function callUnknown(
  action: string,
  position: DurableEvidence,
  required: RecoveryContinuation,
): ObligationDisposition {
  return {
    kind: 'unknown',
    question: { owner: JOURNAL_OWNER, key: action, position, reason: 'original-operation-unknown' },
    required,
  }
}

const LATE_STAGES = ['producer-confirmed', 'physically-stopped', 'duty-released'] as const

function recorded<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined)
    throw new Error(`session Journal defect: ${what} is not on record`)
  return value
}

const settlesCall = (
  failure: FailureCandidate | null | undefined,
): failure is Extract<FailureCandidate, { kind: 'no-reply' | 'model-refused' }> =>
  failure?.kind === 'no-reply' || failure?.kind === 'model-refused'

export function buildObligations(
  source: ObligationSource,
  candidate: FinishCandidate,
): Readonly<{ items: readonly FinishObligation[]; coverage: ResponsibilityCoverage }> {
  const cancelled = candidate.conclusion.kind === 'cancelled'
  const nodeFailed =
    candidate.conclusion.kind === 'fail' && candidate.failure?.kind === 'node-failed'
  const fixed = (what: string): DurableEvidence =>
    journalEvidence(`${source.execution}/obligation/${what}`, source.revision)
  const items: FinishObligation[] = []
  source.inputs.forEach(input => {
    const taken = source.committedInputBatchOf(input)
    const origin = fixed(`input/${input.id}`)
    const read = (purpose: 'load' | 'submit'): RecoveryContinuation => ({
      kind: 'input-read',
      request: ofParameters({ input: input.id }),
      ...BY_JOURNAL,
      purpose,
    })
    items.push({
      kind: 'accepted-input',
      key: input.id,
      source: origin,
      version: origin,
      position: null,
      disposition:
        taken !== null
          ? settled(fixed(`input/${input.id}/taken/${taken}`))
          : cancelled || nodeFailed
            ? held(origin, read('load'))
            : pending('input-disposition', read('submit')),
      input: input.id,
      value: input,
      acceptance: recorded(source.acceptanceOf(input), `the acceptance of input ${input.id}`),
      origin: recorded(input.source, `the Session source of input ${input.id}`),
      taken,
    })
  })
  for (const control of source.controls) {
    const accepted = control.stages.accepted.source
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
      key: control.operation,
      source: accepted,
      version: fixed(`control/${control.operation}`),
      position: null,
      disposition:
        intent?.state === 'unresolved'
          ? pending('cancel-intent', query)
          : revoked?.state === 'unresolved'
            ? pending('qualification-revocation', query)
            : LATE_STAGES.some(stage => control.stages[stage]?.state === 'unresolved')
              ? held(accepted, {
                  kind: 'restore-source',
                  request: ofRecord(accepted),
                  ...BY_JOURNAL,
                  purpose: 'query',
                })
              : settled(intent?.source ?? accepted),
      control: control.operation,
    })
  }
  for (const { operation, method } of source.pending) {
    const at = fixed(`operation/${operation}`)
    items.push({
      kind: 'operation',
      key: operation,
      source: at,
      version: at,
      position: null,
      disposition: {
        kind: 'unknown',
        question: {
          owner: JOURNAL_OWNER,
          key: operation,
          position: at,
          reason: 'original-operation-unknown',
        },
        required: {
          kind: 'original-operation-query',
          request: ofParameters({ execution: source.id, operation }),
          ...BY_JOURNAL,
          purpose: 'query',
        },
      },
      operation,
      method,
      request: at,
      resolution: 'unknown',
      result: null,
    })
  }
  for (const record of source.unpublished) {
    const key = canonical(record.handoff)
    const prepared = record.prepared ?? fixed(`handoff/${key}`)
    const lookup: RecoveryContinuation = {
      kind: 'handoff-lookup',
      request: ofRecord(prepared),
      ...BY_JOURNAL,
      purpose: 'read-message-handoff',
    }
    items.push({
      kind: 'handoff',
      key,
      source: prepared,
      version: prepared,
      position: null,
      disposition:
        candidate.conclusion.kind === 'complete'
          ? pending('handoff-history', lookup)
          : held(prepared, lookup),
      handoff: record.handoff,
      record,
    })
  }
  items.push(...callObligations(source))
  const supersession = source.finishing.supersessions.find(link => link.to === candidate.candidate)
  const migration = source.finishing.migrations.find(item => item.candidate === candidate.candidate)
  for (const passage of source.checkpoint.passages) {
    const superseded = cancelled && passage.position === 'before_terminal'
    const route =
      migration !== undefined
        ? migration.from.route
        : superseded && supersession !== undefined
          ? supersession.route
          : currentRoute(source.finishing)
    const own = route?.kind === 'author' && route.candidate === candidate.candidate
    const lookup: RecoveryContinuation = {
      kind: 'card-lookup',
      request: ofRecord(passage.input),
      ...BY_JOURNAL,
      purpose: 'reconcile',
    }
    items.push({
      kind: 'passage',
      key: passage.id,
      source: passage.effective,
      version: fixed(`passage/${passage.id}`),
      position: null,
      disposition:
        passage.progress.kind === 'applied'
          ? settled(passage.effective)
          : cancelled || passage.position === 'after_terminal'
            ? held(passage.effective, lookup)
            : pending('passage-custody', lookup),
      passage,
      candidate:
        superseded && !own
          ? recorded(
              supersession,
              `the supersession of the cancelled candidate ${candidate.candidate}`,
            ).from
          : candidate.candidate,
      route: route?.record ?? fixed(`route/${passage.id}`),
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
      if (reconciled !== undefined) {
        items.push(reconciled.obligation)
        continue
      }
      const key = `${passage.id}/${round.round}`
      const at = fixed(`card-round/${key}`)
      const roundLookup: RecoveryContinuation = {
        kind: 'card-lookup',
        request: ofParameters({ passage: passage.id, round: round.round }),
        ...BY_JOURNAL,
        purpose: 'reconcile',
      }
      items.push({
        kind: 'card-round',
        key,
        source: at,
        version: at,
        position: null,
        disposition: cancelled ? held(at, roundLookup) : pending('card-custody', roundLookup),
        passage: passage.id,
        round,
        present: presentOf(round),
        lookups: [],
        invalidate: null,
      })
    }
  }
  items.push(...resultObligations(source))
  if (source.emitted > 0) {
    const retention = fixed('output')
    const emittedThrough = String(source.emitted)
    items.push({
      kind: 'output',
      key: `output/1-${source.emitted}`,
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
    const terminal = fixed('terminal')
    items.push({
      kind: 'terminal-observation',
      key: passage.id,
      source: passage.effective,
      version: fixed(`observation/${passage.id}`),
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

export type LedgerSource = Pick<
  ObligationSource,
  | 'id'
  | 'execution'
  | 'revision'
  | 'results'
  | 'entries'
  | 'effects'
  | 'interruptionsOf'
  | 'modelCallOf'
  | 'finishing'
  | 'checkpoint'
>

function firstBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T> {
  const out = new Map<K, T>()
  for (const item of items) if (!out.has(key(item))) out.set(key(item), item)
  return out
}

function fixedOf(source: Pick<ObligationSource, 'execution' | 'revision'>) {
  return (what: string): DurableEvidence =>
    journalEvidence(`${source.execution}/obligation/${what}`, source.revision)
}

export function callObligations(source: LedgerSource): FinishObligation[] {
  const fixed = fixedOf(source)
  const items: FinishObligation[] = []
  const results = firstBy(source.results, item => item.consumption)
  const entries = firstBy(
    source.entries.filter(entry => entry.kind === 'received'),
    entry => entry.consumption,
  )
  const associated = new Map<string, ToolAssociationRecord[]>()
  for (const item of source.finishing.toolAssociations)
    associated.set(item.intent.action, [...(associated.get(item.intent.action) ?? []), item])
  for (const effect of source.effects) {
    const result = results.get(effect.pending.consumption)
    const received = entries.get(effect.pending.consumption)
    const associations = associated.get(effect.action) ?? []
    const association =
      associations.find(item => item.association.kind === 'accepted') ?? associations.at(-1)
    const call = source.modelCallOf(effect)
    const finalFailure =
      call === null
        ? undefined
        : (source.finishing.candidates.find(
            item =>
              item.conclusion.kind === 'fail' &&
              settlesCall(item.failure) &&
              item.failure.call === call,
          )?.failure ?? undefined)
    const voided = source.checkpoint.voided.find(item => item.action === effect.action)
    const custodian =
      association?.obligation.kind === 'call' ? association.obligation.custodian : null
    const retain = (saved: ToolAssociationRecord): RecoveryContinuation => ({
      kind: 'tool-association-retain',
      request: ofParameters({
        intent: saved.intent,
        request: saved.request,
        source: saved.source,
        priorExcluded: saved.priorExcluded,
      }),
      ...BY_JOURNAL,
      purpose: 'reconcile',
    })
    items.push({
      kind: 'call',
      key: effect.action,
      source: effect.pending.fixed,
      version: fixed(`call/${effect.action}`),
      position: effect.pending.position,
      disposition:
        result !== undefined
          ? settled(result.result.source)
          : received?.kind === 'received'
            ? settled(received.material)
            : finalFailure !== undefined
              ? settled(finalFailure.source)
              : voided !== undefined
                ? settled(voided.basis)
                : association?.association.kind === 'accepted'
                  ? held(association.source, retain(association), custodian ?? SESSION_CUSTODIAN)
                  : association !== undefined
                    ? callUnknown(effect.action, association.source, retain(association))
                    : callUnknown(effect.action, effect.pending.fixed, {
                        kind: 'producer-query',
                        request: ofParameters({ pending: effect.pending }),
                        ...BY_JOURNAL,
                        purpose: 'query',
                      }),
      action: effect.action,
      intent: recorded(
        source.finishing.effectOperations.get(effect.action),
        `the operation that saved the intent ${effect.action}`,
      ),
      pending: effect.pending,
      started: null,
      outcome: result?.result.source ?? null,
      interruptions: source.interruptionsOf(effect),
      custodian,
    })
  }
  return items
}

export function resultObligations(source: LedgerSource): FinishObligation[] {
  const fixed = fixedOf(source)
  const items: FinishObligation[] = []
  for (const responsibility of source.results) {
    const key = canonical([
      responsibility.result.producer,
      responsibility.result.version,
      responsibility.consumption,
    ])
    const origin = responsibility.result.source
    const parameters = ofParameters({
      result: responsibility.result,
      consumption: responsibility.consumption,
    })
    items.push({
      kind: 'result',
      key,
      source: origin,
      version: fixed(`result/${responsibility.consumption}/${responsibility.result.version}`),
      position: null,
      disposition:
        responsibility.completion !== null
          ? settled(responsibility.completion)
          : responsibility.custody !== null
            ? held(responsibility.custody, {
                kind: 'producer-release',
                request: parameters,
                ...BY_JOURNAL,
                purpose: 'reconcile',
              })
            : pending('result-custody', {
                kind: 'producer-receive',
                request: parameters,
                ...BY_JOURNAL,
                purpose: 'reconcile',
              }),
      responsibility,
      material: null,
    })
  }
  return items
}

function presentOf(round: CardRound): DurableEvidence | null {
  const progress = round.progress
  if (progress.kind === 'requested' || progress.kind === 'present-failed') return null
  return progress.cards[0]?.card ?? null
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
    default: {
      const _exhaustive: never = item
      return _exhaustive
    }
  }
}

export function projectionOf(items: readonly FinishObligation[]): string {
  return canonical(items.map(item => canonical([item.kind, item.key, targetOf(item)])).sort())
}

export type FinishCheck =
  | Readonly<{ kind: 'clear' }>
  | Readonly<{ kind: 'changed' }>
  | Readonly<{ kind: 'blocked'; value: Extract<FinishResult, { kind: 'blocked' }> }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>

function recordsOnly(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(recordsOnly)
  if (value === null || typeof value !== 'object') return value
  const entries = Object.entries(value)
  const names = entries.map(([name]) => name).sort()
  if (canonical(names) === canonical(['digest', 'owner', 'record', 'revision']))
    return entries.find(([name]) => name === 'record')?.[1]
  return Object.fromEntries(entries.map(([name, item]) => [name, recordsOnly(item)]))
}

export function judgmentBasis(
  items: readonly FinishObligation[],
  participants: TerminalParticipantFacts,
): string {
  return canonical({
    items: items
      .map(item => canonical([item.kind, item.key, targetOf(item), recordsOnly(item.disposition)]))
      .sort(),
    participants:
      participants.kind === 'coordinated'
        ? participants.participants.map(fact => [fact.owner, recordsOnly(fact.condition)])
        : [],
  })
}

export type FinishCheckSource = Readonly<{
  items: readonly FinishObligation[]
  listed: readonly FinishObligation[]
  participants: TerminalParticipantFacts
  finishing: FinishingRecords
}>

export function finishCheck(source: FinishCheckSource, candidate: FinishCandidate): FinishCheck {
  const blocked = (
    reason: Extract<FinishResult, { kind: 'blocked' }>['reason'],
    evidence: DurableEvidence,
  ): FinishCheck => ({ kind: 'blocked', value: { kind: 'blocked', reason, source: evidence } })
  const route = currentRoute(source.finishing)
  if (route === undefined || route.candidate !== candidate.candidate)
    throw new Error('session Journal defect: the current candidate has no current route')
  if (route.kind === 'author') {
    if (candidate.conclusion.kind === 'cancelled') return blocked('passages', route.record)
    const open: { category: ObligationCategory; source: DurableEvidence }[] = source.items
      .filter(item => item.disposition.kind === 'pending')
      .map(item => ({
        category: obligationCategoryOf(item.kind),
        source:
          source.listed.find(listed => listed.kind === item.kind && listed.key === item.key)
            ?.source ?? item.source,
      }))
    if (route.beforeTerminal === null) open.push({ category: 'passages', source: route.record })
    const first = open
      .map((item, index) => ({ ...item, index }))
      .sort(
        (left, right) =>
          CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category) ||
          left.index - right.index,
      )[0]
    if (first !== undefined) return blocked(first.category, first.source)
    const unknown = source.items.find(item => item.disposition.kind === 'unknown')
    if (unknown !== undefined)
      return { kind: 'unknown', diagnostic: `the ${unknown.kind} ${unknown.key} is unknown` }
    return { kind: 'clear' }
  }
  const judgment = currentJudgment(source.finishing)
  if (judgment === undefined || judgment.candidate !== candidate.candidate)
    return blocked('passages', route.record)
  if (
    judgmentBasis(judgment.input.items, judgment.input.participants) !==
    judgmentBasis(source.items, source.participants)
  )
    return { kind: 'changed' }
  const decision = judgment.decision
  if (decision.kind === 'unknown')
    return { kind: 'unknown', diagnostic: `the judgment ${judgment.operation} is unknown` }
  if (decision.kind === 'blocked') {
    const first = [...decision.reasons].sort(
      (left, right) =>
        CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category),
    )[0]
    return blocked(first?.category ?? 'passages', judgment.evidence)
  }
  return { kind: 'clear' }
}

function block<T>(blobs: BlobStore, ref: Readonly<{ digest: string }>, what: string): T {
  if (!blobs.has(ref.digest))
    throw new TypeError(`the Journal holds no block for the ${what} a finishing fact refers to`)
  return structuredClone(blobs.get(ref.digest)) as T
}

function refOfBlob([digest, value]: Blob): Ref {
  return { digest, size: Buffer.byteLength(canonical(value), 'utf8') }
}

export type CandidateCursor = Readonly<{
  members: CursorMembers
  inputBatch: InputBatch | null
  voided: readonly VoidedIntent[]
}>

export function candidateFact(
  candidate: FinishCandidate,
  route: FinishRoute,
  supersedes: AgentOperationId | null,
  state: JournalCommitState,
): Readonly<{ fact: FactOf<'finish.candidate'>; blobs: readonly Blob[] }> {
  const held: CandidateCursor = {
    members: cursorOf(candidate.checkpoint, state),
    inputBatch: candidate.checkpoint.inputBatch,
    voided: candidate.checkpoint.voided,
  }
  const cursor = blobOf(held)
  const path = blobOf(route)
  const failure = candidate.failure === null ? null : blobOf(candidate.failure)
  return {
    fact: {
      kind: 'finish.candidate',
      candidate: candidate.candidate,
      claim: {
        origin: candidate.origin,
        conclusion: candidate.conclusion,
        failure:
          candidate.failure === null || failure === null
            ? null
            : { kind: candidate.failure.kind, detail: refOfBlob(failure) },
        inputWatermark: candidate.inputWatermark,
        conditions: candidate.conditions,
      },
      cursor: refOfBlob(cursor) as never,
      route: route.record,
      path: refOfBlob(path) as never,
      supersedes,
    },
    blobs: [cursor, ...blobsOf(candidate.checkpoint), path, ...(failure === null ? [] : [failure])],
  }
}

export function candidateOfView(view: CandidateView, blobs: BlobStore): FinishCandidate {
  const { failure, ...claim } = view.claim
  return {
    candidate: view.candidate,
    origin: claim.origin,
    conclusion: claim.conclusion,
    failure: failure === null ? null : block<FailureCandidate>(blobs, failure.detail, 'failure'),
    inputWatermark: claim.inputWatermark,
    checkpoint: checkpointOfCursor(block<CandidateCursor>(blobs, view.cursor, 'cursor'), blobs),
    conditions: claim.conditions,
  }
}

function checkpointOfCursor(held: CandidateCursor, blobs: BlobStore): AgentCheckpoint {
  const cursor = { ...held.members, inputBatch: null }
  const none = { steps: [], requests: [], voided: [], intents: new Map() }
  const base = checkpointOf({ cursor, ...none }, blobs)
  return { ...base, inputBatch: held.inputBatch, voided: held.voided }
}

export function routeOfView(view: CandidateView, blobs: BlobStore): FinishRoute {
  const route = block<FinishRoute>(blobs, view.path, 'route')
  return route.kind === 'author' && view.beforeTerminal !== null
    ? { ...route, beforeTerminal: view.beforeTerminal }
    : route
}

export function obligationId(item: FinishObligation): string {
  return canonical([item.kind, item.key])
}

const READ = '$read'

export function storedObligation(
  item: FinishObligation,
  execution: string,
  revision: number,
): FinishObligation {
  const prefix = `${execution}/obligation/`
  const fixed = String(revision)
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk)
    if (value === null || typeof value !== 'object') return value
    const record = value as Record<string, unknown>
    if (
      record['owner'] === JOURNAL_OWNER &&
      typeof record['record'] === 'string' &&
      record['record'].startsWith(prefix) &&
      record['revision'] === fixed &&
      record['digest'] === `memory:${record['record']}@${fixed}` &&
      Object.keys(record).length === 4
    )
      return { owner: JOURNAL_OWNER, record: record['record'], revision: READ, digest: READ }
    return Object.fromEntries(Object.entries(record).map(([key, member]) => [key, walk(member)]))
  }
  return walk(item) as FinishObligation
}

export function readObligation(stored: FinishObligation, revision: number): FinishObligation {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk)
    if (value === null || typeof value !== 'object') return value
    const record = value as Record<string, unknown>
    if (record['revision'] === READ && typeof record['record'] === 'string')
      return journalEvidence(record['record'], revision)
    return Object.fromEntries(Object.entries(record).map(([key, member]) => [key, walk(member)]))
  }
  return walk(stored) as FinishObligation
}

export type ObligationLedger = ReadonlyMap<string, Readonly<{ category: string; item: Ref | null }>>

export const LEDGER_KINDS: ReadonlySet<string> = new Set(['call', 'result'])

const BROAD: ReadonlySet<string> = new Set([
  'control.stage',
  'control.rejected',
  'finish.candidate',
  'intent.voided',
  'settlement.recorded',
  'exec.attached',
  'op.excluded',
])

export function touchedBy(facts: readonly FactBody[]): (item: FinishObligation) => boolean {
  if (facts.some(fact => BROAD.has(fact.kind))) return () => true
  const names = new Set<string>()
  for (const fact of facts) {
    if ('action' in fact && typeof fact.action === 'string') names.add(fact.action)
    if ('consumption' in fact && typeof fact.consumption === 'string') names.add(fact.consumption)
  }
  return item =>
    item.kind === 'call'
      ? names.has(item.action) || names.has(item.pending.consumption)
      : item.kind === 'result'
        ? names.has(item.responsibility.consumption)
        : true
}

export function obligationChanges(
  items: readonly FinishObligation[],
  ledger: ObligationLedger,
  execution: string,
  revision: number,
  complete: ReadonlySet<string> | null,
  room: number = Number.POSITIVE_INFINITY,
  consider: (item: FinishObligation) => boolean = () => true,
): Readonly<{
  facts: readonly FactOf<'finish.obligation'>[]
  blobs: readonly Blob[]
  listed: readonly (readonly [id: string, digest: string])[]
}> {
  const facts: FactOf<'finish.obligation'>[] = []
  const blobs: Blob[] = []
  const listed: (readonly [string, string])[] = []
  const present = new Set<string>()
  for (const item of items) {
    const id = obligationId(item)
    present.add(id)
    if (!consider(item) && ledger.get(id)?.item != null) continue
    const stored = blobOf(storedObligation(item, execution, revision))
    listed.push([id, stored[0]])
    if (ledger.get(id)?.item?.digest === stored[0] || facts.length >= room) continue
    facts.push({ kind: 'finish.obligation', id, category: item.kind, item: refOfBlob(stored) })
    blobs.push(stored)
  }
  if (complete !== null)
    for (const [id, known] of ledger)
      if (
        complete.has(known.category) &&
        known.item !== null &&
        !present.has(id) &&
        facts.length < room
      )
        facts.push({ kind: 'finish.obligation', id, category: known.category, item: null })
  return { facts, blobs, listed }
}

export function issueFacts(
  candidate: AgentOperationId,
  list: number,
  items: readonly FinishObligation[],
  coverage: ResponsibilityCoverage,
  evidence: DurableEvidence,
  ledger: ObligationLedger,
  execution: string,
  revision: number,
): Readonly<{
  facts: readonly (FactOf<'finish.obligation'> | FactOf<'finish.obligations'>)[]
  blobs: readonly Blob[]
}> {
  const changes = obligationChanges(items, ledger, execution, revision, null)
  const listed = blobOf(changes.listed)
  const covered = blobOf(coverage)
  return {
    facts: [
      ...changes.facts,
      {
        kind: 'finish.obligations',
        candidate,
        list,
        count: items.length,
        evidence,
        coverage: refOfBlob(covered),
        listed: refOfBlob(listed),
      },
    ],
    blobs: [...changes.blobs, listed, covered],
  }
}

export function listOfView(
  view: ObligationListView,
  candidate: FinishCandidate,
  checkpoint: DurableEvidence,
  blobs: BlobStore,
): FinishObligations {
  const issued = view.issued
  const listed = block<readonly (readonly [string, string])[]>(blobs, issued.listed, 'list')
  if (listed.length !== issued.count)
    throw new TypeError('the obligation list does not hold the items its close counts')
  const coverage = block<ResponsibilityCoverage>(blobs, issued.coverage, 'coverage')
  const read = Number(coverage.readRevision)
  return {
    operation: issued.op,
    revision: revisionOf(issued.revision),
    evidence: issued.evidence,
    candidate: candidate.candidate,
    conclusion: candidate.conclusion,
    failure: candidate.failure,
    inputWatermark: candidate.inputWatermark,
    checkpoint,
    conditions: candidate.conditions,
    items: listed.map(([, digest]) =>
      readObligation(block<FinishObligation>(blobs, { digest }, 'obligation'), read),
    ),
    coverage,
  }
}

export function listsIssued(records: FinishingRecords, candidate: AgentOperationId): number {
  return [...records.issued.values()].filter(list => list.candidate === candidate).length
}

export type SettlementBlock =
  | Readonly<{
      kind: 'migrate-cancellation'
      migration: Omit<MigrationRecord, 'receipt'>
      route: Extract<FinishRoute, { kind: 'cancellation' }>
    }>
  | Readonly<{
      kind: 'judge-cancellation'
      judgment: Omit<CancellationJudgmentRecord, 'receipt' | 'input'> &
        Readonly<{
          input: Omit<CancellationJudgmentInput, 'candidate'> &
            Readonly<{ candidate: AgentOperationId }>
        }>
    }>
  | Readonly<{
      kind: 'record-card-reconciliation'
      reconciliation: Omit<CardReconciliationRecord, 'receipt'>
    }>
  | Readonly<{
      kind: 'record-legacy-return'
      legacyReturn: Omit<LegacyInvocationReturn, 'receipt'>
    }>
  | Readonly<{
      kind: 'record-tool-association'
      association: Omit<ToolAssociationRecord, 'receipt'>
    }>

export type RecordedSettlement = Exclude<SettlementResult, { kind: 'establish-cancellation' }>

export function settlementBlock(result: RecordedSettlement): SettlementBlock {
  switch (result.kind) {
    case 'migrate-cancellation': {
      const { receipt: _receipt, ...migration } = result.migration
      return { kind: result.kind, migration, route: result.route }
    }
    case 'judge-cancellation': {
      const { receipt: _receipt, input, ...judgment } = result.judgment
      return {
        kind: result.kind,
        judgment: { ...judgment, input: { ...input, candidate: input.candidate.candidate } },
      }
    }
    case 'record-card-reconciliation': {
      const { receipt: _receipt, ...reconciliation } = result.reconciliation
      return { kind: result.kind, reconciliation }
    }
    case 'record-legacy-return': {
      const { receipt: _receipt, ...legacyReturn } = result.legacyReturn
      return { kind: result.kind, legacyReturn }
    }
    case 'record-tool-association': {
      const { receipt: _receipt, ...association } = result.association
      return { kind: result.kind, association }
    }
    default: {
      const _exhaustive: never = result
      return _exhaustive
    }
  }
}

export function settlementOfBlock(
  value: SettlementBlock,
  receipt: CommandReceipt,
  records: FinishingRecords,
): RecordedSettlement {
  switch (value.kind) {
    case 'migrate-cancellation':
      return {
        kind: value.kind,
        receipt,
        migration: { ...value.migration, receipt },
        route: value.route,
      }
    case 'judge-cancellation': {
      const candidate = recorded(
        candidateOf(records, value.judgment.input.candidate),
        `the candidate ${value.judgment.input.candidate} of a judgment`,
      )
      return {
        kind: value.kind,
        receipt,
        judgment: {
          ...value.judgment,
          receipt,
          input: { ...value.judgment.input, candidate: structuredClone(candidate) },
        },
      }
    }
    case 'record-card-reconciliation':
      return {
        kind: value.kind,
        receipt,
        reconciliation: { ...value.reconciliation, receipt },
      }
    case 'record-legacy-return':
      return { kind: value.kind, receipt, legacyReturn: { ...value.legacyReturn, receipt } }
    case 'record-tool-association':
      return { kind: value.kind, receipt, association: { ...value.association, receipt } }
    default: {
      const _exhaustive: never = value
      return _exhaustive
    }
  }
}

export function settlementOfFact(
  record: Ref,
  receipt: CommandReceipt,
  records: FinishingRecords,
  blobs: BlobStore,
): RecordedSettlement {
  return settlementOfBlock(block<SettlementBlock>(blobs, record, 'settlement'), receipt, records)
}

export function applySettlement(records: FinishingRecords, result: RecordedSettlement): void {
  switch (result.kind) {
    case 'migrate-cancellation':
      records.migrations.push(result.migration)
      records.routes.push(result.route)
      records.route = result.route.record.record
      records.currentJudgment = null
      return
    case 'judge-cancellation':
      records.judgments.push(result.judgment)
      records.currentJudgment = result.judgment.operation
      return
    case 'record-card-reconciliation':
      records.cardReconciliations.push(result.reconciliation)
      return
    case 'record-legacy-return':
      records.legacyReturns.push(result.legacyReturn)
      return
    case 'record-tool-association':
      records.toolAssociations.push(result.association)
      return
    default: {
      const _exhaustive: never = result
      return _exhaustive
    }
  }
}

export function applyCandidate(
  records: FinishingRecords,
  candidate: FinishCandidate,
  route: FinishRoute,
  supersession: CandidateSupersession | null,
): void {
  if (supersession !== null) records.supersessions.push(supersession)
  records.candidates.push(candidate)
  records.routes.push(route)
  records.current = candidate.candidate
  records.route = route.record.record
  records.currentJudgment = null
  records.obligations = null
}

export function supersessionOf(
  records: FinishingRecords,
  candidate: AgentOperationId,
  route: FinishRoute,
  revision: number,
): CandidateSupersession | null {
  const current = currentCandidate(records)
  const prior = currentRoute(records)
  if (current === undefined || prior === undefined) return null
  return {
    from: current.candidate,
    to: candidate,
    control: route.kind === 'cancellation' ? route.control : null,
    revision: revisionOf(revision),
    route: structuredClone(prior),
  }
}

export type FinishingMint = Readonly<{
  receipt: (stamp: Stamp) => CommandReceipt
  checkpoint: (candidate: AgentOperationId, revision: number) => DurableEvidence
}>

export function finishingOf(
  view: ExecutionView,
  blobs: BlobStore,
  mint: FinishingMint,
): FinishingRecords {
  const records = emptyFinishing()
  type Step =
    | Readonly<{ pub: number; kind: 'candidate'; view: CandidateView }>
    | Readonly<{ pub: number; kind: 'list'; view: ObligationListView }>
    | Readonly<{ pub: number; kind: 'settlement'; record: Ref; stamp: Stamp }>
  const steps: Step[] = [
    ...view.finish.candidates.map(item => ({
      pub: item.pub,
      kind: 'candidate' as const,
      view: item,
    })),
    ...[...view.finish.lists.values()].flatMap(item =>
      item.issued === null ? [] : [{ pub: item.issued.pub, kind: 'list' as const, view: item }],
    ),
    ...view.settlements.map(item => ({
      pub: item.pub,
      kind: 'settlement' as const,
      record: item.record,
      stamp: item,
    })),
  ].sort((left, right) => left.pub - right.pub)
  for (const step of steps) {
    switch (step.kind) {
      case 'candidate': {
        const candidate = candidateOfView(step.view, blobs)
        const route = routeOfView(step.view, blobs)
        const supersession =
          step.view.supersedes === null
            ? null
            : supersessionOf(records, candidate.candidate, route, step.view.revision)
        applyCandidate(records, candidate, route, supersession)
        break
      }
      case 'list': {
        const issued = step.view.issued!
        const candidate = recorded(
          candidateOf(records, step.view.candidate),
          `the candidate ${step.view.candidate} of a list`,
        )
        const list = listOfView(
          step.view,
          candidate,
          mint.checkpoint(candidate.candidate, issued.revision),
          blobs,
        )
        records.issued.set(list.evidence.record, list)
        records.obligations = list.evidence.record
        break
      }
      case 'settlement': {
        applySettlement(
          records,
          settlementOfFact(step.record, mint.receipt(step.stamp), records, blobs),
        )
        break
      }
      default: {
        const _exhaustive: never = step
        return _exhaustive
      }
    }
  }
  for (const intent of view.intents.values()) records.effectOperations.set(intent.action, intent.op)
  return records
}
