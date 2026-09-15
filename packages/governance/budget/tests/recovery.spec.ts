import { encodeEnvelope } from '@omne-harness-lite/records'
import type { CommitEnvelope } from '@omne-harness-lite/records'
import { describe, expect, it } from 'vitest'
import {
  applyBudgetEnvelope,
  createBudgetLedger,
  decodeAndFoldBudgetLines,
  decodeBudgetEnvelope,
  foldBudgetEnvelopes,
  readAttemptExposure,
} from '../dist/index.js'
import {
  allocation,
  attempt,
  baseEnvelopes,
  budget,
  causality,
  digest,
  envelope,
  fact,
  indexedRecord,
  limits,
  money,
  period,
  record,
  source,
  tenantId,
} from './fixtures.js'

function accepted<T>(result: { ok: boolean; value?: T }): T {
  if (!result.ok) throw new Error(`expected accepted result: ${JSON.stringify(result)}`)
  expect(result.ok).toBe(true)
  return result.value as T
}

// Results use the shared Checked shape; the budget failure category is the message prefix.
function rejected(
  result: { ok: boolean; issues?: readonly { code: string; message: string }[] },
  category?: string,
) {
  expect(result.ok).toBe(false)
  if (
    category !== undefined &&
    !result.issues?.some(issue => issue.message.startsWith(`${category}: `))
  ) {
    throw new Error(`expected rejection ${category}: ${JSON.stringify(result)}`)
  }
}

function meterEnvelope(
  seq: string,
  meterFact: ReturnType<typeof fact>,
  before: string,
  after: string,
  expectedRevision = '0',
  extraRecords: readonly ReturnType<typeof record>[] = [],
) {
  return envelope({
    seq,
    streamId: 'meter-source:source-1',
    expectedRevision,
    inputCausality: causality,
    records: [
      record('budget.meter_recorded', { fact: meterFact }),
      indexedRecord(meterFact),
      record('budget.reservation_changed', {
        chargeAttemptId: 'charge-1',
        budgetId: 'budget-1',
        periodId: 'period-1',
        before: money(before),
        after: money(after),
        reason: 'partial_meter',
        evidence: meterFact.evidence,
      }),
      ...extraRecords,
    ],
  })
}

describe('budget record decoding and recovery', () => {
  it('rejects bad owner, kind, version, shape, stream revision, and reservation causality', () => {
    const good = baseEnvelopes()[0]!
    expect(decodeBudgetEnvelope(good, limits).ok).toBe(true)
    rejected(
      decodeBudgetEnvelope(
        envelope({
          seq: '1',
          streamOwner: 'other-owner',
          records: good.appends[0]!.records,
        }),
        limits,
      ),
      'owner',
    )
    rejected(
      decodeBudgetEnvelope(
        envelope({ seq: '1', records: [record('budget.future_event', {})] }),
        limits,
      ),
      'kind',
    )
    rejected(
      decodeBudgetEnvelope(
        envelope({ seq: '1', records: [record('budget.policy_changed', {}, '2')] }),
        limits,
      ),
      'version',
    )
    rejected(
      decodeBudgetEnvelope(
        envelope({ seq: '1', records: [record('budget.policy_changed', {})] }),
        limits,
      ),
      'shape',
    )

    const wrongCause = { work: causality.work }
    const wrongAttempt = attempt({ causality: wrongCause })
    const causeLog = [
      ...baseEnvelopes().slice(0, 2),
      envelope({
        seq: '3',
        inputCausality: causality,
        records: [record('budget.attempt_reserved', { attempt: wrongAttempt })],
      }),
    ]
    rejected(foldBudgetEnvelopes(causeLog, limits), 'causality')

    const revisionGap = [
      baseEnvelopes()[0]!,
      envelope({
        seq: '2',
        streamId: 'budget:budget-1',
        expectedRevision: '2',
        records: [
          record('budget.operation_denied', {
            operationKind: 'changeBudget',
            target: {},
            code: 'stale',
            evidence: [],
            observed: { coordinationDomain: 'core', seq: '1', commitId: 'commit-1' },
          }),
        ],
      }),
    ]
    rejected(foldBudgetEnvelopes(revisionGap, limits), 'revision')

    const skippedFactRevision = fact({ revision: '3', previousRevision: '1' })
    rejected(
      decodeBudgetEnvelope(
        envelope({
          seq: '1',
          inputCausality: causality,
          records: [
            record('budget.meter_recorded', { fact: skippedFactRevision }),
            indexedRecord(skippedFactRevision),
          ],
        }),
        limits,
      ),
      'revision',
    )
  })

  it('rejects negative policy and reservation amounts before folding them', () => {
    const negativeLimit = envelope({
      seq: '1',
      records: [
        record('budget.policy_changed', {
          budget: budget({ limit: money('-1') }),
          previousRevision: '0',
          affectedAttempts: [],
          effectiveBoundary: 'next_admission',
        }),
      ],
    })
    rejected(decodeBudgetEnvelope(negativeLimit, limits), 'money')

    const negativeReserve = envelope({
      seq: '3',
      inputCausality: causality,
      records: [
        record('budget.attempt_reserved', {
          attempt: attempt({ allocations: [allocation(money('-1'))] }),
        }),
      ],
    })
    rejected(decodeBudgetEnvelope(negativeReserve, limits), 'money')
  })

  it('advances a touched stream once for a multi-record batch', () => {
    const first = envelope({
      seq: '1',
      streamId: 'budget:audit',
      records: [
        record('budget.operation_denied', {
          operationKind: 'first',
          target: {},
          code: 'denied',
          evidence: [],
          observed: { coordinationDomain: 'core', seq: '0', commitId: 'genesis' },
        }),
        record('budget.operation_denied', {
          operationKind: 'second',
          target: {},
          code: 'denied',
          evidence: [],
          observed: { coordinationDomain: 'core', seq: '0', commitId: 'genesis' },
        }),
      ],
    })
    const second = envelope({
      seq: '2',
      streamId: 'budget:audit',
      expectedRevision: '1',
      records: [
        record('budget.operation_denied', {
          operationKind: 'third',
          target: {},
          code: 'denied',
          evidence: [],
          observed: { coordinationDomain: 'core', seq: '1', commitId: 'commit-1' },
        }),
      ],
    })

    const state = accepted(foldBudgetEnvelopes([first, second], limits))
    expect(state.streamRevisions).toEqual([expect.objectContaining({ revision: '2' })])
  })

  it('preserves immutable identity and old-period attempts across period changes and late facts', () => {
    const identityChange = envelope({
      seq: '2',
      streamId: 'budget:budget-1',
      expectedRevision: '1',
      records: [
        record('budget.policy_changed', {
          budget: budget({
            currency: 'EUR',
            limit: money('10', 0, 'EUR'),
            thresholds: [money('5', 0, 'EUR')],
            revision: '2',
          }),
          previousRevision: '1',
          affectedAttempts: [],
          effectiveBoundary: 'next_admission',
        }),
      ],
    })
    rejected(foldBudgetEnvelopes([baseEnvelopes()[0]!, identityChange], limits), 'identity')

    const opened = envelope({
      seq: '4',
      streamId: 'budget:budget-1',
      expectedRevision: '1',
      records: [
        record('budget.period_opened', {
          budgetId: 'budget-1',
          previousPeriodId: 'period-1',
          period: { periodId: 'period-2', startsAt: '2030-02-01T00:00:00Z', endsAt: null },
          budgetRevision: '2',
        }),
      ],
    })
    const late = fact()
    const lateEnvelope = meterEnvelope('5', late, '7', '4')
    const state = accepted(foldBudgetEnvelopes([...baseEnvelopes(), opened, lateEnvelope], limits))
    expect(state.budgets[0]!.period.periodId).toBe('period-2')
    expect(state.attempts[0]!.attempt.allocations[0]!.periodId).toBe(period.periodId)
    expect(state.attempts[0]!.attempt.allocations[0]!.budgetRevision).toBe('1')

    const reusedPeriod = envelope({
      seq: '6',
      streamId: 'budget:budget-1',
      expectedRevision: '2',
      records: [
        record('budget.period_opened', {
          budgetId: 'budget-1',
          previousPeriodId: 'period-2',
          period,
          budgetRevision: '3',
        }),
      ],
    })
    rejected(applyBudgetEnvelope(state, reusedPeriod, limits), 'identity')
  })

  it('uses C plus remaining R once while retaining unknown liability', () => {
    const c3 = meterEnvelope('4', fact(), '7', '4')
    const afterC3 = accepted(foldBudgetEnvelopes([...baseEnvelopes(), c3], limits))
    expect(accepted(readAttemptExposure(afterC3, 'charge-1'))).toEqual({
      chargeAttemptId: 'charge-1',
      knownCost: money('3'),
      remainingReserve: money('4'),
      knownExposure: money('7'),
      boundViolated: false,
      unknown: true,
      qualities: ['estimated'],
    })

    const actual9 = fact({
      revision: '2',
      previousRevision: '1',
      quality: 'actual',
      amount: money('9'),
    })
    const c9 = meterEnvelope('5', actual9, '4', '0', '1')
    const afterC9 = accepted(applyBudgetEnvelope(afterC3, c9, limits))
    expect(accepted(readAttemptExposure(afterC9, 'charge-1'))).toEqual({
      chargeAttemptId: 'charge-1',
      knownCost: money('9'),
      remainingReserve: money('0'),
      knownExposure: money('9'),
      boundViolated: false,
      unknown: true,
      qualities: ['actual'],
    })
  })

  it('uses the same C/R rule for a finite upper bound without unknown liability', () => {
    const finiteSource = source({
      kind: 'finite',
      maximum: money('7'),
      guarantee: [{ authority: 'test-source', kind: 'bound', id: 'finite-7', revision: '1' }],
    })
    const finiteAttempt = attempt({
      source: finiteSource,
      uncertainty: 'known',
    })
    const envelopes = [
      baseEnvelopes()[0]!,
      envelope({
        seq: '2',
        streamId: 'budget-source:source-1',
        inputCausality: causality,
        records: [
          record('budget.source_posture_changed', {
            tenantId,
            source: finiteSource,
            enabled: true,
            tenantPostureBudgetId: 'budget-1',
            unknownPermissions: [],
            previousRevision: '0',
          }),
        ],
      }),
      envelope({
        seq: '3',
        streamId: 'charge:charge-1',
        inputCausality: causality,
        records: [record('budget.attempt_reserved', { attempt: finiteAttempt })],
      }),
      meterEnvelope('4', fact(), '7', '4'),
    ]
    const c3 = accepted(foldBudgetEnvelopes(envelopes, limits))
    expect(accepted(readAttemptExposure(c3, 'charge-1'))).toEqual({
      chargeAttemptId: 'charge-1',
      knownCost: money('3'),
      remainingReserve: money('4'),
      knownExposure: money('7'),
      boundViolated: false,
      unknown: false,
      qualities: ['estimated'],
    })

    const actual9 = fact({
      revision: '2',
      previousRevision: '1',
      quality: 'actual',
      amount: money('9'),
    })
    const overBound = accepted(
      applyBudgetEnvelope(c3, meterEnvelope('5', actual9, '4', '0', '1'), limits),
    )
    expect(accepted(readAttemptExposure(overBound, 'charge-1'))).toEqual({
      chargeAttemptId: 'charge-1',
      knownCost: money('9'),
      remainingReserve: money('0'),
      knownExposure: money('9'),
      boundViolated: true,
      unknown: false,
      qualities: ['actual'],
    })
  })

  it('accepts the per-budget reserved record paired with a new attempt', () => {
    const log = [
      ...baseEnvelopes().slice(0, 2),
      envelope({
        seq: '3',
        streamId: 'charge:charge-1',
        inputCausality: causality,
        records: [
          record('budget.attempt_reserved', { attempt: attempt() }),
          record('budget.reservation_changed', {
            chargeAttemptId: 'charge-1',
            budgetId: 'budget-1',
            periodId: 'period-1',
            before: money('0'),
            after: money('7'),
            reason: 'reserved',
            evidence: [],
          }),
        ],
      }),
    ]
    const state = accepted(foldBudgetEnvelopes(log, limits))
    expect(state.attempts[0]!.currentAllocations[0]!.reserved).toEqual(money('7'))
  })

  it('rejects persisted reservations that bypass posture, scope, period, or hard balance', () => {
    const overLimitPolicy = envelope({
      seq: '1',
      streamId: 'budget:budget-1',
      records: [
        record('budget.policy_changed', {
          budget: budget({ limit: money('5') }),
          previousRevision: '0',
          affectedAttempts: [],
          effectiveBoundary: 'next_admission',
        }),
      ],
    })
    rejected(
      foldBudgetEnvelopes([overLimitPolicy, ...baseEnvelopes().slice(1)], limits),
      'transition',
    )

    const disabled = envelope({
      seq: '2',
      streamId: 'budget-source:source-1',
      inputCausality: causality,
      records: [
        record('budget.source_posture_changed', {
          tenantId,
          source: source(),
          enabled: false,
          tenantPostureBudgetId: 'budget-1',
          unknownPermissions: [{ budgetId: 'budget-1', allowed: true }],
          previousRevision: '0',
        }),
      ],
    })
    rejected(
      foldBudgetEnvelopes([baseEnvelopes()[0]!, disabled, baseEnvelopes()[2]!], limits),
      'transition',
    )

    const noUnknownPermission = envelope({
      seq: '2',
      streamId: 'budget-source:source-1',
      inputCausality: causality,
      records: [
        record('budget.source_posture_changed', {
          tenantId,
          source: source(),
          enabled: true,
          tenantPostureBudgetId: 'budget-1',
          unknownPermissions: [],
          previousRevision: '0',
        }),
      ],
    })
    rejected(
      foldBudgetEnvelopes([baseEnvelopes()[0]!, noUnknownPermission, baseEnvelopes()[2]!], limits),
      'transition',
    )

    const wrongPeriod = envelope({
      seq: '3',
      streamId: 'charge:charge-1',
      inputCausality: causality,
      records: [
        record('budget.attempt_reserved', {
          attempt: attempt({
            allocations: [{ ...allocation(), periodId: 'period-other' }],
          }),
        }),
      ],
    })
    rejected(
      foldBudgetEnvelopes([...baseEnvelopes().slice(0, 2), wrongPeriod], limits),
      'ownership',
    )
  })

  it('releases only the remaining reserve on explicit reconciliation', () => {
    const partial = accepted(
      foldBudgetEnvelopes([...baseEnvelopes(), meterEnvelope('4', fact(), '7', '4')], limits),
    )
    const reconciled = envelope({
      seq: '5',
      streamId: 'charge:charge-1',
      expectedRevision: '1',
      inputCausality: causality,
      records: [
        record('budget.reservation_changed', {
          chargeAttemptId: 'charge-1',
          budgetId: 'budget-1',
          periodId: 'period-1',
          before: money('4'),
          after: money('0'),
          reason: 'reconciled',
          evidence: [fact().evidence[0]],
        }),
        record('budget.attempt_reconciled', {
          chargeAttemptId: 'charge-1',
          finalFacts: [fact().evidence[0]],
          released: [allocation(money('4'))],
          remainingUnknown: false,
        }),
      ],
    })
    const terminal = accepted(applyBudgetEnvelope(partial, reconciled, limits))
    expect(terminal.attempts[0]!.phase).toBe('reconciled')
    expect(accepted(readAttemptExposure(terminal, 'charge-1'))).toEqual({
      chargeAttemptId: 'charge-1',
      knownCost: money('3'),
      remainingReserve: money('0'),
      knownExposure: money('3'),
      boundViolated: false,
      unknown: false,
      qualities: ['estimated'],
    })

    const illegalExposure = envelope({
      seq: '6',
      inputCausality: causality,
      records: [
        record('budget.exposure_recorded', {
          chargeAttemptId: 'charge-1',
          phase: 'possibly_emitted',
          uncertainty: 'unknown',
          sourceFact: fact().evidence[0],
        }),
      ],
    })
    rejected(applyBudgetEnvelope(terminal, illegalExposure, limits), 'transition')
  })

  it('does not treat a final meter component as complete reconciliation', () => {
    const finalComponent = fact({ completeness: 'final', quality: 'actual' })
    const state = accepted(
      foldBudgetEnvelopes(
        [...baseEnvelopes(), meterEnvelope('4', finalComponent, '7', '4')],
        limits,
      ),
    )
    expect(state.attempts[0]!.phase).toBe('reserved')
    expect(accepted(readAttemptExposure(state, 'charge-1')).unknown).toBe(true)
  })

  it('does not infer settlement from an unrelated finish, disconnect, or replay restart', () => {
    const state = accepted(foldBudgetEnvelopes(baseEnvelopes(), limits))
    const finished = envelope({
      seq: '4',
      streamOwner: 'run',
      streamId: 'run:run-1',
      records: [record('run.finished', { runId: 'run-1' })],
    })
    const after = accepted(applyBudgetEnvelope(state, finished, limits))
    expect(after.attempts[0]!.phase).toBe('reserved')
    expect(accepted(readAttemptExposure(after, 'charge-1')).unknown).toBe(true)
    expect(after.attempts[0]!.currentAllocations[0]!.reserved).toEqual(money('7'))
  })

  it('rejects an allocated meter operation that drops its original call causality', () => {
    const meterFact = fact()
    const droppedCall = envelope({
      seq: '4',
      inputCausality: { work: causality.work },
      records: [record('budget.meter_recorded', { fact: meterFact }), indexedRecord(meterFact)],
    })
    rejected(foldBudgetEnvelopes([...baseEnvelopes(), droppedCall], limits), 'causality')
  })

  it('matches continuous folding after real records encode/decode and keeps inputs immutable', () => {
    const meter = meterEnvelope('4', fact(), '7', '4')
    const envelopes = [...baseEnvelopes(), meter]
    const before = JSON.stringify(envelopes)
    const continuous = accepted(foldBudgetEnvelopes(envelopes, limits))
    const head = accepted(foldBudgetEnvelopes(envelopes.slice(0, 2), limits))
    const resumed = accepted(foldBudgetEnvelopes(envelopes.slice(2), limits, head))
    expect(resumed).toEqual(continuous)

    const lines = envelopes.map(item => accepted(encodeEnvelope(item, limits)))
    const decoded = accepted(decodeAndFoldBudgetLines(lines, limits))
    expect(decoded).toEqual(continuous)
    expect(JSON.stringify(envelopes)).toBe(before)
    expect(Object.isFrozen(decoded)).toBe(true)
    expect(Object.isFrozen(decoded.attempts[0]!.currentAllocations)).toBe(true)
  })
})

describe('meter fact identity, revisions, and allocation', () => {
  it('deduplicates exact facts, rejects same-key changes and cross-attempt reuse', () => {
    const first = meterEnvelope('4', fact(), '7', '4')
    const same = meterEnvelope('5', fact(), '4', '4', '1')
    const replayed = accepted(foldBudgetEnvelopes([...baseEnvelopes(), first, same], limits))
    expect(accepted(readAttemptExposure(replayed, 'charge-1')).knownCost).toEqual(money('3'))

    const changed = meterEnvelope('5', fact({ amount: money('4') }), '4', '3', '1')
    rejected(foldBudgetEnvelopes([...baseEnvelopes(), first, changed], limits), 'fact_conflict')

    const originalAttempt = attempt()
    if (originalAttempt.target.kind !== 'tool') throw new Error('expected tool fixture')
    const secondCall = { ...causality.call!, attemptId: 'attempt-2' }
    const secondCausality = { ...causality, call: secondCall }
    const secondAttempt = attempt({
      chargeAttemptId: 'charge-2',
      target: {
        kind: 'tool',
        call: secondCall,
        toolDefinition: originalAttempt.target.toolDefinition,
      },
      causality: secondCausality,
      allocations: [{ ...allocation(), budgetRevision: '2' }],
    })
    const increasedLimit = envelope({
      seq: '5',
      streamId: 'budget:budget-1',
      expectedRevision: '1',
      records: [
        record('budget.policy_changed', {
          budget: budget({ limit: money('20'), revision: '2' }),
          previousRevision: '1',
          affectedAttempts: ['charge-1'],
          effectiveBoundary: 'next_admission',
        }),
      ],
    })
    const secondReserved = envelope({
      seq: '6',
      inputCausality: secondCausality,
      records: [record('budget.attempt_reserved', { attempt: secondAttempt })],
    })
    const reusedFact = fact({ chargeAttemptId: 'charge-2' })
    const reused = meterEnvelope('7', reusedFact, '7', '4', '1')
    rejected(
      foldBudgetEnvelopes(
        [...baseEnvelopes(), first, increasedLimit, secondReserved, reused],
        limits,
      ),
      'fact_conflict',
    )
  })

  it('holds missing revisions pending, catches up their chain, and ignores late old heads', () => {
    const revision3 = fact({ revision: '3', previousRevision: '2', amount: money('3') })
    const gap = envelope({
      seq: '4',
      streamId: 'meter-source:source-1',
      inputCausality: causality,
      records: [record('budget.meter_recorded', { fact: revision3 }), indexedRecord(revision3)],
    })
    const withGap = accepted(foldBudgetEnvelopes([...baseEnvelopes(), gap], limits))
    expect(accepted(readAttemptExposure(withGap, 'charge-1')).knownCost).toEqual(money('0'))
    expect(withGap.sourceFacts[0]!.status).toBe('pending')

    const revision1 = fact({ amount: money('1') })
    const first = meterEnvelope('5', revision1, '7', '6', '1')
    const revision2 = fact({ revision: '2', previousRevision: '1', amount: money('2') })
    const closes = meterEnvelope('6', revision2, '6', '4', '2')
    const caughtUp = accepted(foldBudgetEnvelopes([...baseEnvelopes(), gap, first, closes], limits))
    expect(accepted(readAttemptExposure(caughtUp, 'charge-1')).knownCost).toEqual(money('3'))
    expect(caughtUp.sourceFacts.find(item => item.fact.revision === '2')!.status).toBe('superseded')
    expect(caughtUp.sourceFacts.find(item => item.fact.revision === '3')!.status).toBe('current')

    const lateReplay = meterEnvelope('7', revision2, '4', '4', '3')
    const afterLate = accepted(applyBudgetEnvelope(caughtUp, lateReplay, limits))
    expect(accepted(readAttemptExposure(afterLate, 'charge-1')).knownCost).toEqual(money('3'))
  })

  it('replaces estimates with actual revisions or explicit corrections and sums independent charges', () => {
    const estimated = meterEnvelope('4', fact(), '7', '4')
    const actual = fact({
      revision: '2',
      previousRevision: '1',
      quality: 'actual',
      amount: money('5'),
    })
    const actualEnvelope = meterEnvelope('5', actual, '4', '2', '1')
    const actualState = accepted(
      foldBudgetEnvelopes([...baseEnvelopes(), estimated, actualEnvelope], limits),
    )
    expect(accepted(readAttemptExposure(actualState, 'charge-1')).knownCost).toEqual(money('5'))

    const correction = fact({
      externalFactId: 'fact-correction',
      quality: 'actual',
      amount: money('4'),
      corrects: { sourceId: 'source-1', externalFactId: 'fact-1', revision: '1' },
    })
    const corrected = meterEnvelope('5', correction, '4', '3', '1')
    const correctedState = accepted(
      foldBudgetEnvelopes([...baseEnvelopes(), estimated, corrected], limits),
    )
    expect(accepted(readAttemptExposure(correctedState, 'charge-1')).knownCost).toEqual(money('4'))

    const independent = fact({ externalFactId: 'fact-2', quality: 'actual', amount: money('2') })
    const independentEnvelope = meterEnvelope('6', independent, '3', '1', '2')
    const sumState = accepted(applyBudgetEnvelope(correctedState, independentEnvelope, limits))
    expect(accepted(readAttemptExposure(sumState, 'charge-1')).knownCost).toEqual(money('6'))
  })

  it('moves an unallocated source fact to its original attempt without adding cost twice', () => {
    const unallocated = fact({ chargeAttemptId: null, amount: money('3') })
    const unallocatedEnvelope = envelope({
      seq: '4',
      streamId: 'meter-source:source-1',
      records: [
        record('budget.unallocated_recorded', { fact: unallocated, tenantId }),
        indexedRecord(unallocated),
      ],
    })
    const waiting = accepted(foldBudgetEnvelopes([...baseEnvelopes(), unallocatedEnvelope], limits))
    expect(waiting.sourceFacts[0]!.allocatedChargeAttemptId).toBeNull()
    expect(accepted(readAttemptExposure(waiting, 'charge-1')).knownCost).toEqual(money('0'))

    const attributed = envelope({
      seq: '5',
      streamId: 'meter-source:source-1',
      expectedRevision: '1',
      inputCausality: causality,
      records: [
        record('budget.cost_attributed', {
          sourceId: 'source-1',
          externalFactId: 'fact-1',
          revision: '1',
          chargeAttemptId: 'charge-1',
          allocations: [allocation()],
          evidence: [unallocated.evidence[0]],
        }),
        indexedRecord(unallocated, 'charge-1'),
        record('budget.reservation_changed', {
          chargeAttemptId: 'charge-1',
          budgetId: 'budget-1',
          periodId: 'period-1',
          before: money('7'),
          after: money('4'),
          reason: 'partial_meter',
          evidence: unallocated.evidence,
        }),
      ],
    })
    const moved = accepted(applyBudgetEnvelope(waiting, attributed, limits))
    expect(moved.sourceFacts[0]!.allocatedChargeAttemptId).toBe('charge-1')
    expect(accepted(readAttemptExposure(moved, 'charge-1')).knownCost).toEqual(money('3'))
    expect(moved.sourceFacts).toHaveLength(1)
  })

  it('requires the source index pair and the original allocation tuple', () => {
    const noIndex = envelope({
      seq: '4',
      records: [record('budget.meter_recorded', { fact: fact() })],
    })
    rejected(foldBudgetEnvelopes([...baseEnvelopes(), noIndex], limits), 'source_index')

    const unallocated = fact({ chargeAttemptId: null })
    const first = envelope({
      seq: '4',
      records: [
        record('budget.unallocated_recorded', { fact: unallocated, tenantId }),
        indexedRecord(unallocated),
      ],
    })
    const wrongAllocation = envelope({
      seq: '5',
      inputCausality: causality,
      records: [
        record('budget.cost_attributed', {
          sourceId: 'source-1',
          externalFactId: 'fact-1',
          revision: '1',
          chargeAttemptId: 'charge-1',
          allocations: [allocation(money('6'))],
          evidence: unallocated.evidence,
        }),
        indexedRecord(unallocated, 'charge-1'),
      ],
    })
    rejected(foldBudgetEnvelopes([...baseEnvelopes(), first, wrongAllocation], limits), 'ownership')
  })
})
