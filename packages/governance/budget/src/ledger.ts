import type { CodecLimits, CommitEnvelope, StreamRef } from '@omne-harness-lite/records'
import type { JsonValue, Money, OpaqueId } from '@omne-harness-lite/work-data'
import { canonicalJson, equalJson } from '@omne-harness-lite/work-data'
import { decodeBudgetEnvelope, decodeBudgetLine, factDigest } from './decoder.ts'
import { addMoney, compareMoney, maxMoney, subtractMoney, validateMoney } from './money.ts'
import { accepted, isRejected, rejected } from './result.ts'
import type { BudgetIssue, BudgetIssueCode, BudgetResult } from './result.ts'
import type {
  Allocation,
  AttemptAccount,
  AttemptExposure,
  Budget,
  BudgetLedger,
  BudgetRecord,
  ChargeAttempt,
  CostAttributed,
  DecodedBudgetEnvelope,
  DeniedOperation,
  MeterFact,
  ReservationChanged,
  SourceFactEntry,
  SourceFactIndexed,
  SourcePosture,
  ThresholdCrossing,
} from './types.ts'

class FoldFailure extends Error {
  constructor(readonly issue: BudgetIssue) {
    super(issue.message)
  }
}

function fail(code: BudgetIssueCode, message: string, path = ''): never {
  throw new FoldFailure(Object.freeze({ code, message, path }))
}

function fromFailure(error: FoldFailure): BudgetResult<never> {
  return Object.freeze({ ok: false, issues: Object.freeze([error.issue]) })
}

function exact(left: unknown, right: unknown): boolean {
  return equalJson(left as JsonValue, right as JsonValue)
}

function streamKey(stream: StreamRef): string {
  return canonicalJson(stream as unknown as JsonValue)
}

function factKey(fact: Pick<MeterFact, 'sourceId' | 'externalFactId' | 'revision'>): string {
  return `${fact.sourceId}\u0000${fact.externalFactId}\u0000${fact.revision}`
}

function seriesKey(fact: Pick<MeterFact, 'sourceId' | 'externalFactId'>): string {
  return `${fact.sourceId}\u0000${fact.externalFactId}`
}

function allocationKey(allocation: Pick<Allocation, 'budgetId' | 'periodId'>): string {
  return `${allocation.budgetId}\u0000${allocation.periodId}`
}

function crossingKey(crossing: {
  crossingOperation: { namespace: string; principalId: string; operationId: string }
  budgetId: string
  periodId: string
  threshold: Money
}): string {
  return canonicalJson([
    crossing.crossingOperation,
    crossing.budgetId,
    crossing.periodId,
    crossing.threshold,
  ] as unknown as JsonValue)
}

function nextCounter(value: string): string {
  return (BigInt(value) + 1n).toString()
}

function expectNext(previous: string, next: string, path: string): void {
  if (nextCounter(previous) !== next) {
    fail('revision', `expected revision ${nextCounter(previous)}, received ${next}`, path)
  }
}

function sameMoney(left: Money, right: Money): boolean {
  const compared = compareMoney(left, right)
  return compared.ok && compared.value === 0
}

function zeroMoney(currency: string, scale: number): Money {
  return Object.freeze({ integer: '0', scale, currency })
}

function ensureMoney(value: Money, currency: string, path: string, nonNegative = false): void {
  const checked = validateMoney(value, { nonNegative })
  if (isRejected(checked)) {
    const issue = checked.issues[0]
    fail(issue?.code ?? 'money', issue?.message ?? 'invalid Money', path)
  }
  if (checked.value.currency !== currency) {
    fail('currency', `expected ${currency}, received ${checked.value.currency}`, path)
  }
}

function boundReserve(source: SourcePosture['source']): Money {
  return source.bound.kind === 'finite' ? source.bound.maximum : source.bound.knownReserve
}

function sortByCanonical<T>(values: readonly T[]): readonly T[] {
  return Object.freeze(
    [...values].sort((left, right) =>
      canonicalJson(left as unknown as JsonValue).localeCompare(
        canonicalJson(right as unknown as JsonValue),
      ),
    ),
  )
}

function freezeAttempt(account: AttemptAccount): AttemptAccount {
  return Object.freeze({
    ...account,
    currentAllocations: Object.freeze([...account.currentAllocations]),
    finalFacts: Object.freeze([...account.finalFacts]),
    releaseEvidence: Object.freeze([...account.releaseEvidence]),
  })
}

function freezeLedger(state: BudgetLedger): BudgetLedger {
  return Object.freeze({
    ...state,
    streamRevisions: sortByCanonical(state.streamRevisions.map(item => Object.freeze(item))),
    budgets: sortByCanonical(state.budgets),
    periods: sortByCanonical(state.periods.map(item => Object.freeze(item))),
    sourcePostures: sortByCanonical(state.sourcePostures),
    attempts: sortByCanonical(state.attempts.map(freezeAttempt)),
    sourceFacts: sortByCanonical(state.sourceFacts.map(item => Object.freeze(item))),
    thresholdCrossings: sortByCanonical(
      state.thresholdCrossings.map(item =>
        Object.freeze({
          ...item,
          unknownAttempts: Object.freeze([...item.unknownAttempts]),
          evidence: Object.freeze([...item.evidence]),
        }),
      ),
    ),
    deniedOperations: Object.freeze(
      state.deniedOperations.map(item =>
        Object.freeze({ ...item, evidence: Object.freeze([...item.evidence]) }),
      ),
    ),
  })
}

export function createBudgetLedger(): BudgetLedger {
  return freezeLedger({
    coordinationDomain: null,
    throughSeq: '0',
    lastCommitId: null,
    streamRevisions: [],
    budgets: [],
    periods: [],
    sourcePostures: [],
    attempts: [],
    sourceFacts: [],
    thresholdCrossings: [],
    deniedOperations: [],
  })
}

function currentFactsForAttempt(
  facts: readonly SourceFactEntry[],
  chargeAttemptId: string,
): readonly SourceFactEntry[] {
  return facts.filter(
    entry => entry.status === 'current' && entry.allocatedChargeAttemptId === chargeAttemptId,
  )
}

function knownCost(
  facts: readonly SourceFactEntry[],
  account: AttemptAccount,
): BudgetResult<Money> {
  let total = zeroMoney(
    account.attempt.source.currency,
    account.attempt.source.bound.kind === 'finite'
      ? account.attempt.source.bound.maximum.scale
      : account.attempt.source.bound.knownReserve.scale,
  )
  for (const entry of currentFactsForAttempt(facts, account.attempt.chargeAttemptId)) {
    if (entry.fact.amount === null) continue
    const sum = addMoney(total, entry.fact.amount)
    if (isRejected(sum)) return sum
    total = sum.value
  }
  return accepted(total)
}

function expectedReserve(
  account: AttemptAccount,
  facts: readonly SourceFactEntry[],
): BudgetResult<Money> {
  if (account.phase === 'reconciled' || account.phase === 'released_before_start') {
    const original = boundReserve(account.attempt.source)
    return accepted(zeroMoney(original.currency, original.scale))
  }
  const cost = knownCost(facts, account)
  if (isRejected(cost)) return cost
  const remaining = subtractMoney(boundReserve(account.attempt.source), cost.value)
  if (isRejected(remaining)) return remaining
  return maxMoney(remaining.value, zeroMoney(remaining.value.currency, remaining.value.scale))
}

function currentQualities(
  facts: readonly SourceFactEntry[],
  chargeAttemptId: string,
): readonly ('actual' | 'estimated')[] {
  const qualities = new Set<'actual' | 'estimated'>()
  for (const entry of currentFactsForAttempt(facts, chargeAttemptId)) {
    if (entry.fact.quality !== 'unknown') qualities.add(entry.fact.quality)
  }
  return Object.freeze(
    [...qualities].sort((left, right) => (left === right ? 0 : left === 'actual' ? -1 : 1)),
  )
}

export function readAttemptExposure(
  state: BudgetLedger,
  chargeAttemptId: OpaqueId,
): BudgetResult<AttemptExposure> {
  const account = state.attempts.find(item => item.attempt.chargeAttemptId === chargeAttemptId)
  if (account === undefined) return rejected('ownership', 'unknown charge attempt')
  const cost = knownCost(state.sourceFacts, account)
  if (isRejected(cost)) return cost
  const remainingReserve =
    account.currentAllocations[0]?.reserved ??
    zeroMoney(account.attempt.source.currency, boundReserve(account.attempt.source).scale)
  const exposure = addMoney(cost.value, remainingReserve)
  if (isRejected(exposure)) return exposure
  let boundViolated = false
  if (account.attempt.source.bound.kind === 'finite') {
    const compared = compareMoney(cost.value, account.attempt.source.bound.maximum)
    if (isRejected(compared)) return compared
    boundViolated = compared.value > 0
  }
  return accepted(
    Object.freeze({
      chargeAttemptId,
      knownCost: cost.value,
      remainingReserve,
      knownExposure: exposure.value,
      boundViolated,
      unknown: account.uncertainty === 'unknown',
      qualities: currentQualities(state.sourceFacts, chargeAttemptId),
    }),
  )
}

function recomputeFactStatuses(entries: readonly SourceFactEntry[]): readonly SourceFactEntry[] {
  const bySeries = new Map<string, SourceFactEntry[]>()
  for (const entry of entries) {
    const list = bySeries.get(seriesKey(entry.fact)) ?? []
    list.push(entry)
    bySeries.set(seriesKey(entry.fact), list)
  }
  const status = new Map<string, SourceFactEntry['status']>()
  for (const list of bySeries.values()) {
    const roots = list.filter(entry => entry.fact.previousRevision === null)
    if (roots.length > 1) fail('revision', 'a source fact series has multiple roots')
    if (roots.length === 0) {
      for (const entry of list) status.set(factKey(entry.fact), 'pending')
      continue
    }
    let cursor = roots[0]!
    const chain = new Set<string>()
    while (true) {
      const key = factKey(cursor.fact)
      if (chain.has(key)) fail('revision', 'source fact revision cycle')
      chain.add(key)
      const successors = list.filter(entry => entry.fact.previousRevision === cursor.fact.revision)
      if (successors.length > 1) fail('revision', 'a source fact revision has multiple successors')
      if (successors.length === 0) break
      cursor = successors[0]!
    }
    for (const entry of list) {
      status.set(
        factKey(entry.fact),
        chain.has(factKey(entry.fact)) ? (entry === cursor ? 'current' : 'superseded') : 'pending',
      )
    }
  }

  const corrections = new Map<string, string>()
  for (const entry of entries) {
    if (status.get(factKey(entry.fact)) !== 'current' || entry.fact.corrects === null) continue
    const targetKey = factKey(entry.fact.corrects)
    const target = entries.find(candidate => factKey(candidate.fact) === targetKey)
    if (target === undefined) {
      status.set(factKey(entry.fact), 'pending')
      continue
    }
    if (target.allocatedChargeAttemptId !== entry.allocatedChargeAttemptId) {
      fail('ownership', 'a correction must retain the corrected fact allocation')
    }
    const prior = corrections.get(targetKey)
    if (prior !== undefined && prior !== factKey(entry.fact)) {
      fail('fact_conflict', 'multiple current facts correct the same source fact')
    }
    corrections.set(targetKey, factKey(entry.fact))
    status.set(targetKey, 'superseded')
  }
  return entries.map(entry =>
    Object.freeze({ ...entry, status: status.get(factKey(entry.fact)) ?? 'pending' }),
  )
}

function assertIndexPair(
  fact: MeterFact,
  allocation: string | null,
  indexes: readonly SourceFactIndexed[],
): SourceFactIndexed {
  const matching = indexes.filter(
    index =>
      index.data.sourceId === fact.sourceId &&
      index.data.externalFactId === fact.externalFactId &&
      index.data.revision === fact.revision &&
      index.data.previousRevision === fact.previousRevision &&
      index.data.chargeAttemptId === allocation &&
      index.data.inputDigest === factDigest(fact),
  )
  if (matching.length !== 1)
    fail('source_index', 'meter fact requires one exact source index record')
  return matching[0]!
}

function sameAllocations(left: readonly Allocation[], right: readonly Allocation[]): boolean {
  if (left.length !== right.length) return false
  const rightByKey = new Map(right.map(item => [allocationKey(item), item]))
  return left.every(item => {
    const match = rightByKey.get(allocationKey(item))
    return (
      match !== undefined &&
      item.budgetRevision === match.budgetRevision &&
      sameMoney(item.reserved, match.reserved)
    )
  })
}

function sourceIdentity(source: SourcePosture['source']): JsonValue {
  return [source.sourceId, source.providerId, source.currency, source.kind] as JsonValue
}

function budgetIdentity(budget: Budget): JsonValue {
  return [budget.budgetId, budget.tenantId, budget.scope, budget.currency] as JsonValue
}

function budgetAppliesToAttempt(budget: Budget, attempt: ChargeAttempt): boolean {
  if (budget.tenantId !== attempt.tenantId) return false
  if (budget.scope.kind === 'tenant') return budget.scope.tenantId === attempt.tenantId
  if (budget.scope.kind === 'definition') {
    return (
      budget.scope.tenantId === attempt.tenantId &&
      exact(budget.scope.definition, attempt.subjectDefinition.definition)
    )
  }
  if (budget.scope.kind === 'session') {
    return attempt.session !== null && exact(budget.scope.session, attempt.session)
  }
  return attempt.run !== null && exact(budget.scope.run, attempt.run)
}

function currentBudgetExposure(
  attempts: ReadonlyMap<string, AttemptAccount>,
  facts: readonly SourceFactEntry[],
  budget: Budget,
): Money {
  let total = zeroMoney(budget.currency, budget.scale)
  for (const account of attempts.values()) {
    const allocation = account.currentAllocations.find(
      item => item.budgetId === budget.budgetId && item.periodId === budget.period.periodId,
    )
    if (allocation === undefined) continue
    const cost = knownCost(facts, account)
    if (isRejected(cost)) fail(cost.issues[0]!.code, cost.issues[0]!.message)
    const contribution = addMoney(cost.value, allocation.reserved)
    if (isRejected(contribution))
      fail(contribution.issues[0]!.code, contribution.issues[0]!.message)
    const next = addMoney(total, contribution.value)
    if (isRejected(next)) fail(next.issues[0]!.code, next.issues[0]!.message)
    total = next.value
  }
  return total
}

function validateFactForAttempt(fact: MeterFact, account: AttemptAccount): void {
  if (fact.sourceId !== account.attempt.source.sourceId) {
    fail('ownership', 'meter fact source does not own the charge attempt')
  }
  if (fact.amount !== null)
    ensureMoney(fact.amount, account.attempt.source.currency, '/fact/amount')
}

function validateAttemptCausality(
  causality: DecodedBudgetEnvelope['input']['causality'],
  account: AttemptAccount,
): void {
  if (causality.work === undefined || !exact(causality.work, account.attempt.owner)) {
    fail('causality', 'budget operation must retain the charge attempt work owner')
  }
  if (
    account.attempt.target.kind === 'tool' &&
    (causality.call === undefined || !exact(causality.call, account.attempt.target.call))
  ) {
    fail('causality', 'budget operation must retain the charge attempt tool call')
  }
  if (
    account.attempt.target.kind === 'model' &&
    (causality.request === undefined ||
      causality.request.requestId !== account.attempt.target.requestId ||
      causality.request.tenantId !== account.attempt.tenantId)
  ) {
    fail('causality', 'budget operation must retain the charge attempt model request')
  }
}

function applyDecoded(
  state: BudgetLedger,
  decoded: DecodedBudgetEnvelope,
): BudgetResult<BudgetLedger> {
  try {
    if (
      state.coordinationDomain !== null &&
      state.coordinationDomain !== decoded.position.coordinationDomain
    ) {
      fail('record', 'coordination domain changed during recovery', '/position/coordinationDomain')
    }
    expectNext(state.throughSeq, decoded.position.seq, '/position/seq')

    const streamRevisions = new Map(
      state.streamRevisions.map(item => [streamKey(item.stream), { ...item }]),
    )
    for (const item of decoded.streamRevisions) {
      const key = streamKey(item.stream)
      const current = streamRevisions.get(key)?.revision ?? '0'
      if (item.expectedRevision !== current) {
        fail(
          'revision',
          `stream expected revision ${item.expectedRevision}, recovered ${current}`,
          '/appends/expectedRevision',
        )
      }
      // shared-interfaces/1 defines one stream revision per committed batch.
      streamRevisions.set(key, { stream: item.stream, revision: nextCounter(current) })
    }

    const budgets = new Map(state.budgets.map(item => [item.budgetId, item]))
    const periods = new Map(
      state.periods.map(item => [`${item.budgetId}\u0000${item.period.periodId}`, item]),
    )
    const postures = new Map(state.sourcePostures.map(item => [item.source.sourceId, item]))
    const attempts = new Map(state.attempts.map(item => [item.attempt.chargeAttemptId, item]))
    let sourceFacts = [...state.sourceFacts]
    const thresholdCrossings = new Map(
      state.thresholdCrossings.map(item => [crossingKey(item), item]),
    )
    const deniedOperations: DeniedOperation[] = [...state.deniedOperations]

    const precedence: readonly BudgetRecord['kind'][] = [
      'budget.policy_changed',
      'budget.period_opened',
      'budget.source_posture_changed',
      'budget.attempt_reserved',
      'budget.exposure_recorded',
      'budget.meter_recorded',
      'budget.unallocated_recorded',
      'budget.cost_attributed',
      'budget.reservation_changed',
      'budget.attempt_reconciled',
      'budget.released_before_start',
      'budget.threshold_crossed',
      'budget.threshold_delivery_changed',
      'budget.operation_denied',
      'budget.source_fact_indexed',
    ]
    const ordered = [...decoded.records].sort(
      (left, right) => precedence.indexOf(left.kind) - precedence.indexOf(right.kind),
    )
    const indexes = ordered.filter(
      (record): record is SourceFactIndexed => record.kind === 'budget.source_fact_indexed',
    )
    const usedIndexes = new Set<SourceFactIndexed>()

    for (const record of ordered) {
      if (record.kind !== 'budget.policy_changed') continue
      const previous = budgets.get(record.data.budget.budgetId)
      if (previous === undefined) {
        if (record.data.previousRevision !== '0')
          fail('revision', 'new budget must start at previousRevision 0')
        expectNext('0', record.data.budget.revision, '/budget/revision')
      } else {
        if (record.data.previousRevision !== previous.revision)
          fail('revision', 'budget revision chain does not match current revision')
        expectNext(previous.revision, record.data.budget.revision, '/budget/revision')
        if (!exact(budgetIdentity(previous), budgetIdentity(record.data.budget))) {
          fail('identity', 'budget identity is immutable')
        }
        if (!exact(previous.period, record.data.budget.period)) {
          fail('identity', 'budget period can change only through period_opened')
        }
      }
      budgets.set(record.data.budget.budgetId, record.data.budget)
      if (previous === undefined) {
        periods.set(
          `${record.data.budget.budgetId}\u0000${record.data.budget.period.periodId}`,
          Object.freeze({
            budgetId: record.data.budget.budgetId,
            period: record.data.budget.period,
          }),
        )
      }
    }

    for (const record of ordered) {
      if (record.kind !== 'budget.period_opened') continue
      const current = budgets.get(record.data.budgetId)
      if (current === undefined) fail('transition', 'period opened for unknown budget')
      if (current.period.periodId !== record.data.previousPeriodId)
        fail('identity', 'previousPeriodId does not match current budget period')
      if (record.data.period.periodId === current.period.periodId)
        fail('identity', 'new period must have a new identity')
      const periodKey = `${current.budgetId}\u0000${record.data.period.periodId}`
      if (periods.has(periodKey)) fail('identity', 'budget period identity cannot be reused')
      expectNext(current.revision, record.data.budgetRevision, '/budgetRevision')
      budgets.set(
        current.budgetId,
        Object.freeze({
          ...current,
          period: record.data.period,
          revision: record.data.budgetRevision,
        }),
      )
      periods.set(
        periodKey,
        Object.freeze({ budgetId: current.budgetId, period: record.data.period }),
      )
    }

    for (const record of ordered) {
      if (record.kind !== 'budget.source_posture_changed') continue
      const targetBudget = budgets.get(record.data.tenantPostureBudgetId)
      if (targetBudget === undefined || targetBudget.tenantId !== record.data.tenantId) {
        fail('ownership', 'source posture budget must exist in its tenant')
      }
      if (targetBudget.currency !== record.data.source.currency)
        fail('currency', 'source posture budget currency must match source')
      for (const permission of record.data.unknownPermissions) {
        const permissionBudget = budgets.get(permission.budgetId)
        if (permissionBudget === undefined || permissionBudget.tenantId !== record.data.tenantId) {
          fail('ownership', 'unknown permission budget must exist in source tenant')
        }
        if (permissionBudget.currency !== record.data.source.currency)
          fail('currency', 'unknown permission budget currency must match source')
      }
      const previous = postures.get(record.data.source.sourceId)
      if (previous === undefined) {
        if (record.data.previousRevision !== '0')
          fail('revision', 'new source posture must start at previousRevision 0')
        expectNext('0', record.data.source.revision, '/source/revision')
      } else {
        if (
          previous.tenantId !== record.data.tenantId ||
          !exact(sourceIdentity(previous.source), sourceIdentity(record.data.source))
        ) {
          fail('identity', 'source tenant/provider/currency/kind identity is immutable')
        }
        if (record.data.previousRevision !== previous.source.revision)
          fail('revision', 'source posture revision chain does not match current revision')
        expectNext(previous.source.revision, record.data.source.revision, '/source/revision')
      }
      const { previousRevision: _previousRevision, ...posture } = record.data
      postures.set(posture.source.sourceId, Object.freeze(posture))
    }

    for (const record of ordered) {
      if (record.kind !== 'budget.attempt_reserved') continue
      const attempt = record.data.attempt
      if (attempt.phase !== 'reserved') fail('transition', 'new charge attempt must start reserved')
      if (attempts.has(attempt.chargeAttemptId))
        fail('identity', 'charge attempt identity is not reusable')
      const duplicateTarget = [...attempts.values()].find(
        existing =>
          existing.attempt.source.sourceId === attempt.source.sourceId &&
          exact(existing.attempt.target, attempt.target),
      )
      if (duplicateTarget !== undefined)
        fail('identity', 'the same physical source attempt cannot receive a second chargeAttemptId')
      const posture = postures.get(attempt.source.sourceId)
      if (
        posture === undefined ||
        posture.tenantId !== attempt.tenantId ||
        !exact(posture.source, attempt.source)
      ) {
        fail('ownership', 'charge attempt must use the current tenant source posture')
      }
      if (!posture.enabled) fail('transition', 'disabled source posture cannot reserve an attempt')
      if (attempt.target.kind !== attempt.source.kind) {
        fail('ownership', 'charge attempt target kind must match its cost source kind')
      }
      const reserve = boundReserve(attempt.source)
      const applicableBudgets = [...budgets.values()].filter(
        item => item.currency === attempt.source.currency && budgetAppliesToAttempt(item, attempt),
      )
      for (const item of attempt.allocations) {
        const target = budgets.get(item.budgetId)
        if (target === undefined || target.tenantId !== attempt.tenantId)
          fail('ownership', 'attempt allocation budget must exist in its tenant')
        if (!budgetAppliesToAttempt(target, attempt))
          fail('ownership', 'attempt allocation budget scope does not match the attempt')
        if (item.budgetRevision !== target.revision || item.periodId !== target.period.periodId) {
          fail(
            'ownership',
            'attempt allocation must preserve the admitted budget revision and period',
          )
        }
        ensureMoney(item.reserved, target.currency, '/attempt/allocations/reserved', true)
        if (!sameMoney(item.reserved, reserve))
          fail('transition', 'initial reservation must equal the source bound reserve')
        if (target.mode === 'hard') {
          if (
            attempt.source.bound.kind === 'unknown' &&
            !posture.unknownPermissions.some(
              permission => permission.budgetId === target.budgetId && permission.allowed,
            )
          ) {
            fail('transition', 'hard budget has no explicit permission for unknown exposure')
          }
          const before = currentBudgetExposure(attempts, sourceFacts, target)
          const after = addMoney(before, item.reserved)
          if (isRejected(after)) fail(after.issues[0]!.code, after.issues[0]!.message)
          const withinLimit = compareMoney(after.value, target.limit!)
          if (isRejected(withinLimit))
            fail(withinLimit.issues[0]!.code, withinLimit.issues[0]!.message)
          if (withinLimit.value > 0) {
            fail('transition', 'persisted reservation exceeds the hard budget limit')
          }
          if (attempt.source.bound.kind === 'unknown') {
            const beforeLimit = compareMoney(before, target.limit!)
            if (isRejected(beforeLimit))
              fail(beforeLimit.issues[0]!.code, beforeLimit.issues[0]!.message)
            if (beforeLimit.value >= 0) {
              fail('transition', 'unknown attempt cannot start when hard exposure is at its limit')
            }
          }
        }
      }
      for (const applicable of applicableBudgets) {
        if (!attempt.allocations.some(item => item.budgetId === applicable.budgetId)) {
          fail('ownership', 'attempt allocations omit an applicable budget')
        }
      }
      if (!attempt.allocations.some(item => item.budgetId === posture.tenantPostureBudgetId)) {
        fail('ownership', 'attempt allocations must include the explicit tenant posture budget')
      }
      attempts.set(
        attempt.chargeAttemptId,
        freezeAttempt({
          attempt,
          phase: 'reserved',
          uncertainty: attempt.uncertainty,
          currentAllocations: attempt.allocations,
          finalFacts: [],
          releaseEvidence: [],
        }),
      )
    }

    for (const record of ordered) {
      if (record.kind !== 'budget.exposure_recorded') continue
      const account = attempts.get(record.data.chargeAttemptId)
      if (account === undefined) fail('ownership', 'exposure references unknown attempt')
      validateAttemptCausality(decoded.input.causality, account)
      if (account.phase === 'reconciled' || account.phase === 'released_before_start')
        fail('transition', 'terminal attempt cannot become possibly emitted')
      if (account.uncertainty === 'unknown' && record.data.uncertainty === 'known')
        fail('transition', 'unknown exposure cannot become known without reconciliation')
      attempts.set(
        account.attempt.chargeAttemptId,
        freezeAttempt({
          ...account,
          phase: 'possibly_emitted',
          uncertainty: record.data.uncertainty,
        }),
      )
    }

    const beforeCosts = new Map<string, Money>()
    for (const account of attempts.values()) {
      const cost = knownCost(sourceFacts, account)
      if (isRejected(cost)) fail(cost.issues[0]!.code, cost.issues[0]!.message)
      beforeCosts.set(account.attempt.chargeAttemptId, cost.value)
    }

    for (const record of ordered) {
      if (record.kind !== 'budget.meter_recorded' && record.kind !== 'budget.unallocated_recorded')
        continue
      const fact = record.data.fact
      const index = assertIndexPair(fact, fact.chargeAttemptId, indexes)
      usedIndexes.add(index)
      const existing = sourceFacts.find(entry => factKey(entry.fact) === factKey(fact))
      if (existing !== undefined) {
        if (existing.inputDigest !== factDigest(fact) || !exact(existing.fact, fact)) {
          fail('fact_conflict', 'same source fact key has different canonical content')
        }
        if (existing.allocatedChargeAttemptId !== fact.chargeAttemptId) {
          fail('fact_conflict', 'replayed source fact conflicts with its current allocation')
        }
        continue
      }
      if (fact.chargeAttemptId !== null) {
        const account = attempts.get(fact.chargeAttemptId)
        if (account === undefined) fail('ownership', 'meter fact references unknown attempt')
        validateAttemptCausality(decoded.input.causality, account)
        validateFactForAttempt(fact, account)
      } else {
        const posture = postures.get(fact.sourceId)
        if (posture === undefined) fail('ownership', 'unallocated fact references unknown source')
        if (
          record.kind !== 'budget.unallocated_recorded' ||
          record.data.tenantId !== posture.tenantId
        ) {
          fail('ownership', 'unallocated fact tenant does not own source')
        }
        if (fact.amount !== null) ensureMoney(fact.amount, posture.source.currency, '/fact/amount')
      }
      sourceFacts.push(
        Object.freeze({
          fact,
          inputDigest: factDigest(fact),
          allocatedChargeAttemptId: fact.chargeAttemptId,
          status: 'pending',
        }),
      )
    }
    sourceFacts = [...recomputeFactStatuses(sourceFacts)]

    for (const record of ordered) {
      if (record.kind !== 'budget.cost_attributed') continue
      const account = attempts.get(record.data.chargeAttemptId)
      if (account === undefined) fail('ownership', 'cost attribution references unknown attempt')
      validateAttemptCausality(decoded.input.causality, account)
      if (!sameAllocations(record.data.allocations, account.attempt.allocations)) {
        fail('ownership', 'cost attribution must preserve the attempt original allocations')
      }
      const entryIndex = sourceFacts.findIndex(
        entry =>
          entry.fact.sourceId === record.data.sourceId &&
          entry.fact.externalFactId === record.data.externalFactId &&
          entry.fact.revision === record.data.revision,
      )
      if (entryIndex < 0) fail('ownership', 'cost attribution references unknown source fact')
      const entry = sourceFacts[entryIndex]!
      if (entry.allocatedChargeAttemptId !== null)
        fail('transition', 'source fact is already allocated')
      validateFactForAttempt(entry.fact, account)
      const index = assertIndexPair(entry.fact, record.data.chargeAttemptId, indexes)
      usedIndexes.add(index)
      sourceFacts[entryIndex] = Object.freeze({
        ...entry,
        allocatedChargeAttemptId: record.data.chargeAttemptId,
      })
    }
    sourceFacts = [...recomputeFactStatuses(sourceFacts)]

    if (indexes.some(index => !usedIndexes.has(index))) {
      fail('source_index', 'source index record has no matching fact or attribution')
    }

    const reservationChanges = ordered.filter(
      (record): record is ReservationChanged => record.kind === 'budget.reservation_changed',
    )
    const changedCosts = new Set<string>()
    for (const account of attempts.values()) {
      const before =
        beforeCosts.get(account.attempt.chargeAttemptId) ??
        zeroMoney(account.attempt.source.currency, 0)
      const after = knownCost(sourceFacts, account)
      if (isRejected(after)) fail(after.issues[0]!.code, after.issues[0]!.message)
      if (!sameMoney(before, after.value)) changedCosts.add(account.attempt.chargeAttemptId)
    }

    const terminalRecords = ordered.filter(
      record =>
        record.kind === 'budget.attempt_reconciled' ||
        record.kind === 'budget.released_before_start',
    )
    const terminalAttempts = new Set<string>()
    for (const record of terminalRecords) {
      if (terminalAttempts.has(record.data.chargeAttemptId)) {
        fail('transition', 'an attempt can have only one terminal event')
      }
      terminalAttempts.add(record.data.chargeAttemptId)
    }
    for (const record of reservationChanges) {
      if (record.data.reason === 'reconciled' || record.data.reason === 'never_started') continue
      const account = attempts.get(record.data.chargeAttemptId)
      if (account === undefined) fail('ownership', 'reservation change references unknown attempt')
      validateAttemptCausality(decoded.input.causality, account)
      const allocationIndex = account.currentAllocations.findIndex(
        item => item.budgetId === record.data.budgetId && item.periodId === record.data.periodId,
      )
      if (allocationIndex < 0)
        fail('ownership', 'reservation change does not match original budget period')
      const current = account.currentAllocations[allocationIndex]!
      if (record.data.reason === 'reserved') {
        const pairedAttempt = ordered.some(
          item =>
            item.kind === 'budget.attempt_reserved' &&
            item.data.attempt.chargeAttemptId === account.attempt.chargeAttemptId,
        )
        if (
          !pairedAttempt ||
          !sameMoney(
            record.data.before,
            zeroMoney(current.reserved.currency, current.reserved.scale),
          ) ||
          !sameMoney(record.data.after, current.reserved)
        ) {
          fail(
            'transition',
            'reserved allocation record must match a new attempt from zero in the same envelope',
          )
        }
        continue
      }
      if (!sameMoney(record.data.before, current.reserved))
        fail('transition', 'reservation before amount does not match current state')
      ensureMoney(record.data.after, current.reserved.currency, '/reservation/after', true)
      const expected = expectedReserve(account, sourceFacts)
      if (isRejected(expected)) fail(expected.issues[0]!.code, expected.issues[0]!.message)
      if (!sameMoney(record.data.after, expected.value))
        fail('transition', 'partial meter reserve must equal max(bound minus current cost, zero)')
      const updated = [...account.currentAllocations]
      updated[allocationIndex] = Object.freeze({ ...current, reserved: record.data.after })
      attempts.set(
        account.attempt.chargeAttemptId,
        freezeAttempt({ ...account, currentAllocations: updated }),
      )
    }

    for (const chargeAttemptId of changedCosts) {
      if (terminalAttempts.has(chargeAttemptId)) continue
      const account = attempts.get(chargeAttemptId)!
      const expected = expectedReserve(account, sourceFacts)
      if (isRejected(expected)) fail(expected.issues[0]!.code, expected.issues[0]!.message)
      for (const allocation of account.currentAllocations) {
        if (!sameMoney(allocation.reserved, expected.value)) {
          fail(
            'transition',
            'cost-changing fact must carry exact reservation changes in the same envelope',
          )
        }
      }
    }

    for (const record of terminalRecords) {
      const account = attempts.get(record.data.chargeAttemptId)
      if (account === undefined) fail('ownership', 'terminal event references unknown attempt')
      validateAttemptCausality(decoded.input.causality, account)
      if (account.phase === 'reconciled' || account.phase === 'released_before_start')
        fail('transition', 'attempt is already terminal')
      if (!sameAllocations(record.data.released, account.currentAllocations))
        fail('ownership', 'terminal release must match the remaining original allocations')
    }

    for (const record of reservationChanges) {
      if (record.data.reason !== 'reconciled' && record.data.reason !== 'never_started') continue
      const account = attempts.get(record.data.chargeAttemptId)
      if (account === undefined) fail('ownership', 'reservation change references unknown attempt')
      validateAttemptCausality(decoded.input.causality, account)
      const allocationIndex = account.currentAllocations.findIndex(
        item => item.budgetId === record.data.budgetId && item.periodId === record.data.periodId,
      )
      if (allocationIndex < 0)
        fail('ownership', 'reservation change does not match original budget period')
      const current = account.currentAllocations[allocationIndex]!
      if (!sameMoney(record.data.before, current.reserved))
        fail('transition', 'reservation before amount does not match current state')
      ensureMoney(record.data.after, current.reserved.currency, '/reservation/after', true)
      const kind =
        record.data.reason === 'reconciled'
          ? 'budget.attempt_reconciled'
          : 'budget.released_before_start'
      if (
        !terminalRecords.some(
          item =>
            item.kind === kind && item.data.chargeAttemptId === account.attempt.chargeAttemptId,
        )
      ) {
        fail(
          'transition',
          `${record.data.reason} reservation requires its terminal event in the same envelope`,
        )
      }
      if (
        !sameMoney(record.data.after, zeroMoney(current.reserved.currency, current.reserved.scale))
      ) {
        fail('transition', 'terminal reservation must become zero')
      }
      const updated = [...account.currentAllocations]
      updated[allocationIndex] = Object.freeze({ ...current, reserved: record.data.after })
      attempts.set(
        account.attempt.chargeAttemptId,
        freezeAttempt({ ...account, currentAllocations: updated }),
      )
    }

    for (const record of terminalRecords) {
      const account = attempts.get(record.data.chargeAttemptId)!
      if (record.kind === 'budget.released_before_start') {
        if (account.phase !== 'reserved')
          fail('transition', 'possibly emitted attempt cannot be released before start')
        attempts.set(
          account.attempt.chargeAttemptId,
          freezeAttempt({
            ...account,
            phase: 'released_before_start',
            currentAllocations: account.currentAllocations.map(item =>
              Object.freeze({
                ...item,
                reserved: zeroMoney(item.reserved.currency, item.reserved.scale),
              }),
            ),
            releaseEvidence: record.data.proof,
          }),
        )
      } else {
        attempts.set(
          account.attempt.chargeAttemptId,
          freezeAttempt({
            ...account,
            phase: 'reconciled',
            uncertainty: record.data.remainingUnknown ? 'unknown' : 'known',
            currentAllocations: account.currentAllocations.map(item =>
              Object.freeze({
                ...item,
                reserved: zeroMoney(item.reserved.currency, item.reserved.scale),
              }),
            ),
            finalFacts: record.data.finalFacts,
          }),
        )
      }
    }

    for (const record of ordered) {
      if (record.kind === 'budget.threshold_crossed') {
        const budget = budgets.get(record.data.budgetId)
        if (budget === undefined) fail('ownership', 'threshold references unknown budget')
        ensureMoney(record.data.threshold, budget.currency, '/threshold', true)
        ensureMoney(record.data.knownExposure, budget.currency, '/knownExposure', true)
        const crossing: ThresholdCrossing = Object.freeze({
          crossingOperation: decoded.operation,
          budgetId: record.data.budgetId,
          periodId: record.data.periodId,
          threshold: record.data.threshold,
          knownExposure: record.data.knownExposure,
          unknownAttempts: record.data.unknownAttempts,
          delivery: 'pending',
          evidence: Object.freeze([]),
        })
        const key = crossingKey(crossing)
        if (thresholdCrossings.has(key))
          fail('transition', 'threshold crossing is already recorded')
        thresholdCrossings.set(key, crossing)
      }
      if (record.kind === 'budget.threshold_delivery_changed') {
        const key = crossingKey(record.data)
        const crossing = thresholdCrossings.get(key)
        if (crossing === undefined)
          fail('causality', 'threshold delivery has no matching crossing operation')
        if (crossing.delivery === 'applied')
          fail('transition', 'applied threshold delivery is terminal')
        thresholdCrossings.set(
          key,
          Object.freeze({
            ...crossing,
            delivery: record.data.delivery,
            evidence: record.data.evidence,
          }),
        )
      }
      if (record.kind === 'budget.operation_denied') {
        deniedOperations.push(Object.freeze(record.data))
      }
    }

    return accepted(
      freezeLedger({
        coordinationDomain: decoded.position.coordinationDomain,
        throughSeq: decoded.position.seq,
        lastCommitId: decoded.position.commitId,
        streamRevisions: [...streamRevisions.values()],
        budgets: [...budgets.values()],
        periods: [...periods.values()],
        sourcePostures: [...postures.values()],
        attempts: [...attempts.values()],
        sourceFacts,
        thresholdCrossings: [...thresholdCrossings.values()],
        deniedOperations,
      }),
    )
  } catch (error) {
    if (error instanceof FoldFailure) return fromFailure(error)
    throw error
  }
}

export function applyBudgetEnvelope(
  state: BudgetLedger,
  envelope: CommitEnvelope,
  limits: CodecLimits,
): BudgetResult<BudgetLedger> {
  const decoded = decodeBudgetEnvelope(envelope, limits)
  return isRejected(decoded) ? decoded : applyDecoded(state, decoded.value)
}

export function foldBudgetEnvelopes(
  envelopes: readonly CommitEnvelope[],
  limits: CodecLimits,
  initial: BudgetLedger = createBudgetLedger(),
): BudgetResult<BudgetLedger> {
  let state = initial
  for (const envelope of envelopes) {
    const applied = applyBudgetEnvelope(state, envelope, limits)
    if (isRejected(applied)) return applied
    state = applied.value
  }
  return accepted(state)
}

export function decodeAndFoldBudgetLines(
  lines: readonly Uint8Array[],
  limits: CodecLimits,
  initial: BudgetLedger = createBudgetLedger(),
): BudgetResult<BudgetLedger> {
  let state = initial
  for (const line of lines) {
    const decoded = decodeBudgetLine(line, limits)
    if (isRejected(decoded)) return decoded
    const applied = applyDecoded(state, decoded.value)
    if (isRejected(applied)) return applied
    state = applied.value
  }
  return accepted(state)
}

export { decodeBudgetEnvelope, decodeBudgetLine }
