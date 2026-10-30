// The finishing records of the session-log Journal (Agent SPEC "条件终结", "取消判断与路线",
// "终结责任清单" and "commitSettlement 的变体"): the candidate, route, obligation, judgment and custody
// records of one execution, the FinishIntent and settlement projections `load` derives from them,
// the obligations the Journal builds from its own records, and the five blocked categories in
// their fixed order. Pure over the records it is given; the writes that change them live in
// journal.ts. The Agent memory Journal keeps its own records; the two are held to the same
// conformance suite, not to shared code.
import type {
  AcceptedInput,
  Adoption,
  AgentCheckpoint,
  AgentExecutionId,
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
} from '@omne-harness/agent-contract'
import { obligationCategoryOf } from '@omne-harness/agent-contract'
import { canonical } from './canonical.ts'
import { JOURNAL_OWNER, journalEvidence, revisionOf } from './journal-values.ts'

/**
 * The finishing records of one execution. Every record is immutable once appended; the one
 * exception is the proof of an author route, which F2 sets by replacing the route at its index.
 */
export type FinishingRecords = {
  candidates: FinishCandidate[]
  routes: FinishRoute[]
  /** The current candidate, or null before the first F1 or establish. */
  current: AgentOperationId | null
  /** The record text of the current route. */
  route: string | null
  supersessions: CandidateSupersession[]
  migrations: MigrationRecord[]
  judgments: CancellationJudgmentRecord[]
  currentJudgment: AgentOperationId | null
  cardReconciliations: CardReconciliationRecord[]
  legacyReturns: LegacyInvocationReturn[]
  toolAssociations: ToolAssociationRecord[]
  /** Every list this Journal issued, by the record text of its evidence. */
  issued: Map<string, FinishObligations>
  /** The record text of the list issued for the current candidate, or null. */
  obligations: string | null
  /** The commit operation that saved each effect intent, by action (the intent of a Tool key). */
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

/** The draft copy of a common-root transaction: lists and maps copied, the records shared. */
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

/** The fixed order of the five categories (Agent SPEC "条件终结"). */
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

/** Whether two candidate contents are the same business content (Agent SPEC "条件终结" 2). */
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

/**
 * The proof of the before-terminal judgment of the current route: the F2 commit of an author
 * route, the current judgment record of a cancellation route, null before either.
 */
export function beforeTerminalOf(records: FinishingRecords): DurableEvidence | null {
  const route = currentRoute(records)
  if (route === undefined) return null
  if (route.kind === 'author') return route.beforeTerminal
  return currentJudgment(records)?.evidence ?? null
}

/** The FinishIntent projection of the current candidate; `undefined` without one. */
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

/** Whether the checkpoint still has a before-terminal passage that is not applied. */
export function beforeTerminalOpen(checkpoint: AgentCheckpoint): boolean {
  return checkpoint.passages.some(
    passage => passage.position === 'before_terminal' && passage.progress.kind !== 'applied',
  )
}

// ------------------------------------------------------------------------------------------
// The obligations (Agent SPEC "终结责任清单")

/** What the builder reads of one execution: its own records, never another owner's. */
export type ObligationSource = Readonly<{
  /** The execution the obligations belong to. */
  id: AgentExecutionId
  /** The namespaced text the fixed evidence of the obligations is named under. */
  execution: string
  revision: number
  checkpoint: AgentCheckpoint
  inputs: readonly AcceptedInput[]
  /** The taken batch of the input at `index`, or null when no batch took it. */
  batchOf: (index: number) => InputBatchId | null
  /** The entry operation that accepted an input, from its external handoff. */
  acceptanceOf: (input: AcceptedInput) => AgentOperationId | undefined
  controls: readonly ControlRecord[]
  results: readonly ResultResponsibility[]
  effects: readonly EffectIntent[]
  /** The interrupt and background controls that name the call of an effect. */
  interruptionsOf: (effect: EffectIntent) => readonly AgentOperationId[]
  /** The Model call id the reference of a Model effect resolves to, null for any other effect. */
  modelCallOf: (effect: EffectIntent) => string | null
  emitted: number
  acknowledged: number
  /** The handoffs whose prepared message no Ja published yet. */
  unpublished: readonly Extract<FinishObligation, { kind: 'handoff' }>['record'][]
  /** The writes of the execution still undecided, except the issuing one. */
  pending: readonly Readonly<{ operation: AgentOperationId; method: string }>[]
  finishing: FinishingRecords
}>

const SESSION_CUSTODIAN: ConsumerRef = Object.freeze({
  owner: JOURNAL_OWNER,
  work: 'session-log',
  position: 'journal',
  purpose: 'custody',
})

/** The schema under which the session log keeps the record a continuation refers to. */
const RECORD_SCHEMA: Adoption = Object.freeze({
  owner: JOURNAL_OWNER,
  name: 'session-log-record',
  revision: '1',
  digest: 'session-log:record',
})

/** The request of a continuation that refers to a record of this Journal under its schema. */
function ofRecord(
  record: DurableEvidence,
): Extract<ContinuationRequest<never>, { kind: 'record' }> {
  return { kind: 'record', schema: RECORD_SCHEMA, record }
}

/** The request of a continuation that carries the complete parameters of the original operation. */
function ofParameters<T>(value: T): Extract<ContinuationRequest<T>, { kind: 'parameters' }> {
  return { kind: 'parameters', value }
}

/** The continuation is the Journal's own and no custodian accepted it yet. */
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

/**
 * A call whose acceptance is not known (Agent SPEC "Tool 调用关联与控制引用"): no result and no
 * accepted association, so the original request may still be in flight.
 */
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

/**
 * The original record an obligation names. The Journal keeps every one of them, so a missing one
 * is a defect of this double; it never takes another identity in its place.
 */
function recorded<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined)
    throw new Error(`session Journal defect: ${what} is not on record`)
  return value
}

/**
 * The obligations of `candidate` from the Journal's own records at the current revision. An
 * ordinary candidate leaves an input no batch took, an unapplied before-terminal passage and a
 * result without custody pending; a cancelled candidate keeps the inputs and the undetermined
 * passages held by the Journal. A control is pending while its intent or revocation is
 * unresolved; the three late stages may be carried after the end and are held. A write still
 * undecided is unknown. A call whose result is recorded is settled: its custody is the result's.
 */
export function buildObligations(
  source: ObligationSource,
  candidate: FinishCandidate,
): Readonly<{ items: readonly FinishObligation[]; coverage: ResponsibilityCoverage }> {
  const cancelled = candidate.conclusion.kind === 'cancelled'
  const fixed = (what: string): DurableEvidence =>
    journalEvidence(`${source.execution}/obligation/${what}`, source.revision)
  const items: FinishObligation[] = []
  source.inputs.forEach((input, index) => {
    const taken = source.batchOf(index)
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
          : cancelled
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
      // A prepared message does not complete the pending history: a complete candidate does not
      // pass it as retained; a failed or cancelled one holds it (Agent SPEC "终结责任清单").
      disposition:
        candidate.conclusion.kind === 'complete'
          ? pending('handoff-history', lookup)
          : held(prepared, lookup),
      handoff: record.handoff,
      record,
    })
  }
  for (const effect of source.effects) {
    const result = source.results.find(item => item.consumption === effect.pending.consumption)
    // A later unknown return does not take an accepted association back to unknown; without an
    // accepted one the last record counts.
    const associations = source.finishing.toolAssociations.filter(
      item => item.intent.action === effect.action,
    )
    const association =
      associations.find(item => item.association.kind === 'accepted') ?? associations.at(-1)
    // A final failure of the producer settles the call; it is read from every candidate, so a
    // cancelled candidate that replaced the no-reply failure does not undo it.
    const call = source.modelCallOf(effect)
    const finalFailure =
      call === null
        ? undefined
        : (source.finishing.candidates.find(
            item =>
              item.conclusion.kind === 'fail' &&
              item.failure?.kind === 'no-reply' &&
              item.failure.call === call,
          )?.failure ?? undefined)
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
          : finalFailure !== undefined
            ? settled(finalFailure.source)
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
  const supersession = source.finishing.supersessions.find(link => link.to === candidate.candidate)
  // A migrated candidate's passages belong to the author route it left (Agent SPEC "终结责任清单").
  const migration = source.finishing.migrations.find(item => item.candidate === candidate.candidate)
  for (const passage of source.checkpoint.passages) {
    const superseded = cancelled && passage.position === 'before_terminal'
    const route =
      migration !== undefined
        ? migration.from.route
        : superseded && supersession !== undefined
          ? supersession.route
          : currentRoute(source.finishing)
    // On its own author route (before or after a migration) the passage is the candidate's own.
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
      // Of several reconciliations of one round the known result counts, else the last.
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

/** The evidence of the first presented card of a round, or null while nothing was presented. */
function presentOf(round: CardRound): DurableEvidence | null {
  const progress = round.progress
  if (progress.kind === 'requested' || progress.kind === 'present-failed') return null
  return progress.cards[0]?.card ?? null
}

/** The target an obligation is about, for the responsibility projection. */
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

/**
 * The responsibility projection of a list (Agent SPEC "终结责任清单"): the set of items with the
 * identity, kind and target of each, without the dispositions. A list stays usable while the
 * projection of the current closure equals the projection of the list.
 */
export function projectionOf(items: readonly FinishObligation[]): string {
  return canonical(items.map(item => canonical([item.kind, item.key, targetOf(item)])).sort())
}

// ------------------------------------------------------------------------------------------
// The five blocked categories (Agent SPEC "条件终结")

export type FinishCheck =
  | Readonly<{ kind: 'clear' }>
  | Readonly<{ kind: 'changed' }>
  | Readonly<{ kind: 'blocked'; value: Extract<FinishResult, { kind: 'blocked' }> }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>

/** The value with every evidence in it reduced to its record text, which no revision changes. */
function recordsOnly(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(recordsOnly)
  if (value === null || typeof value !== 'object') return value
  const entries = Object.entries(value)
  const names = entries.map(([name]) => name).sort()
  if (canonical(names) === canonical(['digest', 'owner', 'record', 'revision']))
    return entries.find(([name]) => name === 'record')?.[1]
  return Object.fromEntries(entries.map(([name, item]) => [name, recordsOnly(item)]))
}

/**
 * The judgment basis of a closure (Agent SPEC "取消路线上的 tryFinish"): each item by kind, key,
 * target and disposition, and the condition of each participant. Evidence is compared by its
 * record, because the evidence of the closure names the revision it was read at.
 */
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

/** What the check reads of one execution besides its finishing records. */
export type FinishCheckSource = Readonly<{
  /** The closure of the candidate rebuilt now, by the builder prepareFinish uses. */
  items: readonly FinishObligation[]
  /** The items of the issued list; a blocked answer names the source of the listed item. */
  listed: readonly FinishObligation[]
  /** The participant facts the closure is judged with now. */
  participants: TerminalParticipantFacts
  finishing: FinishingRecords
}>

/**
 * The finish check of `candidate` over the current closure. Author route: a cancelled candidate that
 * did not migrate is blocked on passages at the route record; otherwise the first pending item
 * in the fixed order inputs, controls, operations, passages, custody is blocked, with the source
 * of that item in the issued list; a route without its before-terminal proof counts as a pending passage; without a
 * pending item, an unknown one is `unknown`. Cancellation route: no current judgment of this
 * candidate is blocked on passages; a judgment whose basis is not the current closure is
 * `changed`; a blocked judgment answers its first reason's category and an unknown one is
 * `unknown`.
 */
export function finishCheck(source: FinishCheckSource, candidate: FinishCandidate): FinishCheck {
  const blocked = (
    reason: Extract<FinishResult, { kind: 'blocked' }>['reason'],
    evidence: DurableEvidence,
  ): FinishCheck => ({ kind: 'blocked', value: { kind: 'blocked', reason, source: evidence } })
  const route = currentRoute(source.finishing)
  if (route === undefined || route.candidate !== candidate.candidate)
    throw new Error('session Journal defect: the current candidate has no current route')
  if (route.kind === 'author') {
    // A cancelled candidate on an author route did not migrate: it does not end under the cancel
    // without the trusted judgment of a cancellation route.
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
