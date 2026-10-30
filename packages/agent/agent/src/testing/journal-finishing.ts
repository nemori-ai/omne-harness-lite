// The finishing records of the memory Journal (SPEC "条件终结", "取消判断与路线", "终结责任清单" and
// "commitSettlement 的变体"): the candidate, route, migration, judgment and custody records of one
// execution, the FinishIntent and settlement projections `load` derives from them, and the
// obligations the Journal issues from its own records. Pure over the execution record; the writes
// that change it live in journal.ts.
import type {
  AcceptedInput,
  AgentCheckpoint,
  AgentOperationId,
  CancellationJudgmentRecord,
  CandidateSupersession,
  CardReconciliationRecord,
  CardRound,
  ConsumerRef,
  ControlRecord,
  CoverageFacet,
  DurableEvidence,
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
  RecoveryContinuation,
  ResponsibilityCoverage,
  ToolAssociationRecord,
} from '@omne-harness/agent-contract'
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

/** Whether two candidate contents are the same business content (SPEC "条件终结"). */
export function sameContent(left: FinishCandidateContent, right: FinishCandidateContent): boolean {
  return (
    canonical({
      origin: left.origin,
      conclusion: left.conclusion,
      failure: left.failure,
      inputWatermark: left.inputWatermark,
      conditions: left.conditions,
    }) ===
    canonical({
      origin: right.origin,
      conclusion: right.conclusion,
      failure: right.failure,
      inputWatermark: right.inputWatermark,
      conditions: right.conditions,
    })
  )
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
  | 'revision'
  | 'checkpoint'
  | 'inputs'
  | 'batches'
  | 'controls'
  | 'results'
  | 'effects'
  | 'events'
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

function continuation(
  kind: RecoveryContinuation['kind'],
  request: DurableEvidence,
  purpose: RecoveryContinuation['purpose'],
  owner = JOURNAL_OWNER,
): RecoveryContinuation {
  return { kind, request, owner, custodian: null, purpose }
}

function settled(completion: DurableEvidence): ObligationDisposition {
  return { kind: 'settled', completion }
}

function held(
  retained: DurableEvidence,
  next: RecoveryContinuation,
  custodian = JOURNAL_CUSTODIAN,
): ObligationDisposition {
  return { kind: 'held', custodian, acceptance: retained, retained, continuation: next }
}

function pending(
  reason: Extract<ObligationDisposition, { kind: 'pending' }>['reason'],
  required: RecoveryContinuation,
): ObligationDisposition {
  return { kind: 'pending', reason, required }
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
 */
export function buildObligations(
  source: ObligationSource,
  candidate: FinishCandidate,
  pendingOperations: readonly PendingOperation[],
): Readonly<{ items: readonly FinishObligation[]; coverage: ResponsibilityCoverage }> {
  const cancelled = candidate.conclusion.kind === 'cancelled'
  const revision = source.revision
  const fixed = (what: string): DurableEvidence =>
    journalEvidence(`${source.id}/obligation/${what}`, revision)
  const items: FinishObligation[] = []
  // inputs: an ordinary candidate does not pass an input no batch took; a cancelled candidate keeps
  // every accepted input under its original owner (SPEC "条件终结" table, inputs).
  source.inputs.forEach((input: AcceptedInput, index) => {
    const taken = batchOf(source, index)
    const key = input.id
    const sourceEvidence = fixed(`input/${key}`)
    items.push({
      kind: 'accepted-input',
      category: 'inputs',
      key,
      source: sourceEvidence,
      version: sourceEvidence,
      position: null,
      disposition:
        taken !== null
          ? settled(fixed(`input/${key}/taken/${taken}`))
          : cancelled
            ? held(sourceEvidence, continuation('input-read', sourceEvidence, 'load'))
            : pending('input-disposition', continuation('input-read', sourceEvidence, 'submit')),
      input: input.id,
      value: input,
      acceptance: acceptanceOf(source, input) ?? candidate.candidate,
      origin: input.source ?? sourceEvidence,
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
    const query = continuation('original-operation-query', sourceEvidence, 'query')
    items.push({
      kind: 'control',
      category: 'controls',
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
              ? held(sourceEvidence, continuation('producer-query', sourceEvidence, 'query'))
              : settled(intent?.source ?? sourceEvidence),
      control: control.operation,
    })
  }
  // operations: a write still undecided may change the candidate (SPEC "条件终结" table, operations).
  for (const { operation, method } of pendingOperations) {
    const sourceEvidence = fixed(`operation/${operation}`)
    items.push({
      kind: 'operation',
      category: 'operations',
      key: operation,
      source: sourceEvidence,
      version: sourceEvidence,
      position: null,
      disposition: {
        kind: 'unknown',
        question: {
          owner: JOURNAL_OWNER,
          key: operation,
          position: sourceEvidence,
          reason: 'original-operation-unknown',
        },
        required: continuation('original-operation-query', sourceEvidence, 'query'),
      },
      operation,
      method,
      request: sourceEvidence,
      resolution: 'unknown',
    })
  }
  // handoffs: a prepared H that no Ja published is retained by the terminal disposition.
  for (const record of source.handoffs) {
    if (record.history.kind !== 'pending') continue
    const key = canonical(record.handoff)
    const sourceEvidence = record.prepared ?? fixed(`handoff/${key}`)
    items.push({
      kind: 'handoff',
      category: 'operations',
      key,
      source: sourceEvidence,
      version: sourceEvidence,
      position: null,
      disposition: held(
        sourceEvidence,
        continuation('handoff-lookup', sourceEvidence, 'read-message-handoff'),
      ),
      handoff: record.handoff,
      record: { ...record, custody: null },
    })
  }
  // calls: every effect intent is a call responsibility until a result or an association holds it.
  for (const effect of source.effects) {
    const key = effect.action
    const sourceEvidence = effect.pending.fixed
    const association = source.finishing.toolAssociations.find(
      item => item.intent.action === effect.action,
    )
    const result = source.results.find(item => item.consumption === effect.pending.consumption)
    const intent = source.finishing.effectOperations.get(effect.action)
    items.push({
      kind: 'call',
      category: 'operations',
      key,
      source: sourceEvidence,
      version: fixed(`call/${key}`),
      position: effect.pending.position,
      disposition:
        result?.completion !== null && result?.completion !== undefined
          ? settled(result.completion)
          : result?.custody !== null && result?.custody !== undefined
            ? held(
                result.custody,
                continuation('producer-receive', sourceEvidence, 'receive-result'),
              )
            : association !== undefined
              ? held(
                  association.source,
                  continuation('tool-association-retain', association.request, 'reconcile'),
                  association.obligation.kind === 'call' &&
                    association.obligation.custodian !== null
                    ? association.obligation.custodian
                    : JOURNAL_CUSTODIAN,
                )
              : pending('call-custody', continuation('producer-query', sourceEvidence, 'query')),
      action: effect.action,
      intent: intent ?? candidate.candidate,
      pending: effect.pending,
      started: null,
      outcome: null,
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
    items.push({
      kind: 'passage',
      category: 'passages',
      key,
      source: passage.effective,
      version: fixed(`passage/${key}`),
      position: null,
      disposition: applied
        ? settled(passage.effective)
        : cancelled || passage.position === 'after_terminal'
          ? held(passage.effective, continuation('card-lookup', passage.input, 'reconcile'))
          : pending('passage-custody', continuation('card-lookup', passage.input, 'reconcile')),
      passage,
      candidate: superseded
        ? (supersededCandidate(source.finishing, candidate) ?? candidate.candidate)
        : candidate.candidate,
      route: route?.record ?? fixed(`route/${key}`),
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
      items.push(
        reconciled?.obligation ?? {
          kind: 'card-round',
          category: 'passages',
          key: roundKey,
          source: roundEvidence,
          version: roundEvidence,
          position: null,
          disposition: cancelled
            ? held(roundEvidence, continuation('card-lookup', passage.input, 'reconcile'))
            : pending('card-custody', continuation('card-lookup', passage.input, 'reconcile')),
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
    items.push({
      kind: 'result',
      category: 'custody',
      key,
      source: responsibility.result.source,
      version: fixed(`result/${key}`),
      position: null,
      disposition:
        responsibility.completion !== null
          ? settled(responsibility.completion)
          : responsibility.custody !== null
            ? held(
                responsibility.custody,
                continuation('producer-release', responsibility.result.source, 'reconcile'),
              )
            : pending(
                'result-custody',
                continuation('producer-receive', responsibility.result.source, 'reconcile'),
              ),
      responsibility,
      material: null,
    })
  }
  // output: the emitted events the Journal retains until they are acknowledged.
  if (source.events.length > 0) {
    const retention = fixed('output')
    items.push({
      kind: 'output',
      category: 'custody',
      key: `output/1-${source.events.length}`,
      source: retention,
      version: retention,
      position: null,
      disposition: held(retention, continuation('output-read-ack', retention, 'acknowledge')),
      emittedThrough: String(source.events.length),
      acknowledgedThrough: source.acknowledged === 0 ? null : String(source.acknowledged),
      retention,
    })
  }
  // terminal observations: the fixed plan of the after-terminal passages, carried by the Journal.
  for (const passage of source.checkpoint.passages) {
    if (passage.position !== 'after_terminal') continue
    const key = passage.id
    items.push({
      kind: 'terminal-observation',
      category: 'custody',
      key,
      source: passage.effective,
      version: fixed(`observation/${key}`),
      position: null,
      disposition: held(
        passage.effective,
        continuation('terminal-observe', passage.input, 'record-terminal-observation'),
      ),
      observation: {
        terminal: fixed('terminal'),
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

/** The entry operation that accepted an input, from the handoff record of its external H. */
function acceptanceOf(
  source: ObligationSource,
  input: AcceptedInput,
): AgentOperationId | undefined {
  for (const record of source.handoffs) {
    if (record.handoff.kind === 'input' && record.handoff.input === input.id)
      return record.handoff.entry
  }
  return undefined
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
    (left, right) => CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category),
  )
  return pendingItems[0]
}
