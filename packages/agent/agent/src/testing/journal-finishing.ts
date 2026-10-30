// The finishing records of the memory Journal (SPEC "条件终结", "取消判断与路线", "终结责任清单" and
// "commitSettlement 的变体"): the candidate, route, migration, judgment and custody records of one
// execution, the FinishIntent and settlement projections `load` derives from them, and the
// obligations the Journal issues from its own records. Pure over the execution record; the writes
// that change it live in journal.ts.
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
import { obligationCategoryOf } from '@omne-harness/agent-contract/testing'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import type { MemoryExecution } from './journal.ts'
import { journalEvidence, JOURNAL_OWNER, revisionOf } from './journal-values.ts'
import { canonical } from '../canonical.ts'

/** The finishing records of one execution. Every record is immutable once pushed, except the proof of an author route. */
export type FinishingRecords = {
  candidates: FinishCandidate[]
  routes: FinishRoute[]
  /** The current candidate, or null before the first F1 or establish. */
  current: AgentOperationId | null
  /** The record text of the current route. */
  currentRoute: string | null
  supersessions: CandidateSupersession[]
  migrations: MigrationRecord[]
  judgments: CancellationJudgmentRecord[]
  currentJudgment: AgentOperationId | null
  cardReconciliations: CardReconciliationRecord[]
  legacyReturns: LegacyInvocationReturn[]
  toolAssociations: ToolAssociationRecord[]
  /** Every issued list by the record text of its evidence. */
  issued: Map<string, FinishObligations>
  /** The record text of the list issued for the current candidate, or null. */
  obligations: string | null
  /** The operation that established each effect intent, by action. */
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

/** The content of a candidate with its checkpoint: what "the same business content" compares (SPEC "条件终结"). */
export type CandidateContent = FinishCandidateContent & Readonly<{ checkpoint: AgentCheckpoint }>

/** Whether two candidate contents are the same business content; the checkpoint is part of it. */
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

/**
 * The proof of the before-terminal judgment of the current route (SPEC "条件终结"): the F2 commit on
 * an author route, the current judgment record on a cancellation route, null before either.
 */
export function beforeTerminalOf(records: FinishingRecords): DurableEvidence | null {
  const route = currentRoute(records)
  if (route === undefined) return null
  if (route.kind === 'author') return route.beforeTerminal
  return currentJudgment(records)?.evidence ?? null
}

/** The FinishIntent projection of the current candidate; `undefined` when there is none. */
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

/** Whether the checkpoint still has a before-terminal passage that is not applied. */
export function beforeTerminalPending(checkpoint: AgentCheckpoint): boolean {
  return checkpoint.passages.some(
    passage => passage.position === 'before_terminal' && passage.progress.kind !== 'applied',
  )
}

// ------------------------------------------------------------------------------------------
// The obligations (SPEC "终结责任清单")

/** The part of the execution record that the obligations are built from. */
export type ObligationSource = Pick<
  MemoryExecution,
  | 'id'
  | 'tenant'
  | 'revision'
  | 'checkpoint'
  | 'inputs'
  | 'batches'
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

/** The schema under which this double keeps the record a continuation refers to. */
const RECORD_SCHEMA: Adoption = Object.freeze({
  owner: JOURNAL_OWNER,
  name: 'journal-record',
  revision: '1',
  digest: 'memory:journal-record',
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

/** A record this double must hold is missing: a defect of the double, never another identity. */
function defect(what: string): never {
  throw new Error(`memory Journal defect: ${what}`)
}

function batchOf(source: ObligationSource, index: number): InputBatchId | null {
  for (const [id, range] of source.batches) {
    if (index >= range.from && index < range.to) return id
  }
  return null
}

/** The resolution of each pending write of the execution that the builder is told about. */
export type PendingOperation = Readonly<{ operation: AgentOperationId; method: string }>

/**
 * Builds the obligations of `candidate` from the Journal's own records at the current revision.
 * `pendingOperations` are the writes of the execution still undecided, except the issuing one.
 * prepareFinish issues the result; tryFinish rebuilds it with the same function to compare the
 * projection and to read the dispositions (SPEC "终结责任清单").
 */
export function buildObligations(
  source: ObligationSource,
  candidate: FinishCandidate,
  pendingOperations: readonly PendingOperation[],
): Readonly<{ items: readonly FinishObligation[]; coverage: ResponsibilityCoverage }> {
  const cancelled = candidate.conclusion.kind === 'cancelled'
  const complete = candidate.conclusion.kind === 'complete'
  // The fixed evidence of one fact of the closure names the fact, not the revision it was read at:
  // the same fact reads the same at every revision, so a judgment that read it still applies
  // (SPEC "取消路线上的 tryFinish": the criteria compare keys, versions and dispositions).
  const fixed = (what: string): DurableEvidence =>
    journalEvidence(`${source.id}/obligation/${what}`, 0)
  const items: FinishObligation[] = []
  // inputs: an ordinary candidate does not pass an input no batch took; a cancelled candidate keeps
  // every accepted input under its original owner (SPEC "条件终结" table, inputs).
  source.inputs.forEach((input: AcceptedInput, index) => {
    const taken = batchOf(source, index)
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
          : cancelled
            ? held(sourceEvidence, read)
            : pending('input-disposition', read),
      input: input.id,
      value: input,
      acceptance: accepted.entry,
      origin: input.source ?? accepted.record,
      taken,
    })
  })
  // controls: the cancel and the revocation that apply must hold; the three late stages may be
  // carried by a lawful successor (SPEC "六个阶段").
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
  // operations: a write still undecided may change the candidate; it is unknown, not pending
  // (SPEC "条件终结" table, operations; tryFinish answers unavailable).
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
  // handoffs: a prepared H that no Ja published is a pending history of a complete candidate; only
  // a failed or cancelled candidate may retain it at the end (SPEC "终结责任清单").
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
  // calls: a call with a result is settled and the custody is the result item's; a final failure
  // of the producer settles it on that basis; an association keeps it held (accepted) or unknown
  // (commit-unknown); a call with none of these is unknown (SPEC "终结责任清单" call row).
  for (const effect of source.effects) {
    const key = effect.action
    const sourceEvidence = effect.pending.fixed
    const association = source.finishing.toolAssociations.find(
      item => item.intent.action === effect.action,
    )
    const result = source.results.find(item => item.consumption === effect.pending.consumption)
    const received = source.entries.find(
      entry => entry.kind === 'received' && entry.consumption === effect.pending.consumption,
    )
    const failure = candidate.failure
    const finalFailure =
      failure?.kind === 'no-reply' && effect.pending.kind === 'model'
        ? callOfModel(effect.pending.reference, source) === failure.call
          ? failure.source
          : null
        : null
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
  // passages and card rounds: an ordinary candidate needs its before-terminal passages applied; a
  // cancelled candidate keeps the undetermined ones complete (SPEC "条件终结" table, passages).
  for (const passage of source.checkpoint.passages) {
    const key = passage.id
    const applied = passage.progress.kind === 'applied'
    const superseded = cancelled && passage.position === 'before_terminal'
    const route = routeOfPassage(source.finishing, candidate, superseded)
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
      candidate: superseded
        ? (supersededCandidate(source.finishing, candidate) ?? candidate.candidate)
        : candidate.candidate,
      route: route?.record ?? defect(`the passage ${key} belongs to no route`),
      implementation: passage.implementation,
      superseded,
    })
    if (passage.progress.kind !== 'asked') continue
    for (const round of passage.progress.rounds) {
      const reconciled = source.finishing.cardReconciliations.find(
        item => item.passage === passage.id && item.round === round.round,
      )
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
  // results: each received result has completion, custody or neither (SPEC "条件终结" table, custody).
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
  // output: the emitted events the Journal retains until they are acknowledged.
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
  // terminal observations: the fixed plan of the after-terminal passages, carried by the Journal.
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

/** The disposition a saved association gives the call: held for an accepted return, unknown for commit-unknown. */
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

/** The call id of a model invocation reference in the tenant of the execution, or null when it does not resolve. */
function callOfModel(reference: unknown, source: ObligationSource): string | null {
  const parts = resolveModelInvocationRef(reference, source.tenant)
  return 'ok' in parts ? parts.ok.call : null
}

/** The interrupt and background controls that name the call of `effect`. */
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

/** The evidence of the first presented card of a round, or null while nothing was presented. */
function presentOf(round: CardRound): DurableEvidence | null {
  const progress = round.progress
  if (progress.kind === 'requested' || progress.kind === 'present-failed') return null
  return progress.cards[0]?.card ?? null
}

/**
 * The acceptance of an input: the entry operation that accepted it and the record of its
 * admission, from the handoff record of its external H. Every accepted input of this double has
 * one (open and a new-input submit write it), so a missing one is a defect, never another identity.
 */
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

/** The candidate a cancelled candidate superseded, when one exists. */
function supersededCandidate(
  records: FinishingRecords,
  candidate: FinishCandidate,
): AgentOperationId | undefined {
  return records.supersessions.find(link => link.to === candidate.candidate)?.from
}

/** The route a passage belongs to: the superseded author route of a cancelled candidate, else the current one. */
function routeOfPassage(
  records: FinishingRecords,
  candidate: FinishCandidate,
  superseded: boolean,
): FinishRoute | undefined {
  if (superseded) {
    const link = records.supersessions.find(item => item.to === candidate.candidate)
    if (link !== undefined) return link.route
  }
  return currentRoute(records)
}

/** The category of an obligation, from its kind (SPEC "终结责任清单" table). */
export function categoryOf(item: FinishObligation): ObligationCategory {
  return obligationCategoryOf(item.kind)
}

/**
 * The responsibility projection of a list: the identity, kind and target of each item, without
 * the dispositions (SPEC "终结责任清单"). Two lists with the same projection are interchangeable.
 */
export function projectionOf(items: readonly FinishObligation[]): string {
  return canonical(
    items
      .map(item => [item.kind, item.key, targetOf(item)])
      .sort((left, right) => (canonical(left) < canonical(right) ? -1 : 1)),
  )
}

/**
 * The criteria a judgment read (SPEC "取消路线上的 tryFinish"): the kind, key, target, source
 * record and disposition of each item, and the owner and condition of each participant. The
 * evidences compare by record only: the revision an evidence was read at is not a criterion, so
 * the same fact reads the same at every revision. A judgment whose criteria differ from the
 * current closure no longer applies.
 */
export function criteriaOf(
  items: readonly FinishObligation[],
  participants: CancellationJudgmentInput['participants'],
): string {
  return canonical(
    withoutRevisions({
      items: items
        .map(item => [item.kind, item.key, targetOf(item), item.source.record, item.disposition])
        .sort((left, right) => (canonical(left) < canonical(right) ? -1 : 1)),
      participants:
        participants.kind === 'coordinated'
          ? participants.participants.map(fact => [fact.owner, fact.condition])
          : [],
    }),
  )
}

/**
 * `value` with every durable evidence reduced to its owner and record, so that the revision and
 * digest of a read do not compare.
 */
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

/** The first pending obligation in the fixed category order, or `undefined`. */
export function firstPending(items: readonly FinishObligation[]): FinishObligation | undefined {
  const pendingItems = items.filter(item => item.disposition.kind === 'pending')
  pendingItems.sort(
    (left, right) =>
      CATEGORY_ORDER.indexOf(categoryOf(left)) - CATEGORY_ORDER.indexOf(categoryOf(right)),
  )
  return pendingItems[0]
}

/** The first unknown obligation, or `undefined`. */
export function firstUnknown(items: readonly FinishObligation[]): FinishObligation | undefined {
  return items.find(item => item.disposition.kind === 'unknown')
}
