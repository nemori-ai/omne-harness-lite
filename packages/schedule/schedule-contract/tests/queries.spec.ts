import { describe, expect, it } from 'vitest'
import {
  ScheduleAgendaRequestSchema,
  ScheduleAgendaViewSchema,
  ScheduleListRequestSchema,
  ScheduleListResultSchema,
  SchedulePreviewRequestSchema,
  ScheduleRevisionsRequestSchema,
  ScheduleExecutionsRequestSchema,
  ScheduleOperationViewSchema,
  ScheduleJobSummarySchema,
  ScheduleReceiptSummarySchema,
  ScheduleNotificationSummarySchema,
  ScheduleStandingSchema,
} from '@omne-harness/schedule-contract'
const id = '00000000-0000-4000-8000-000000000001'
const instant = '2026-11-04T01:00:00.000Z'
const filter = {
  agentRef: null,
  control: null,
  standing: null,
  createdBy: null,
  targetDeviceRef: null,
  calendarId: null,
  purpose: null,
}
const page = { items: [], nextCursor: null, observationRevision: 'observation:1', complete: true }
describe('strict read parameters', () => {
  it('requires exact totals for successful lists', () => {
    expect(
      ScheduleListResultSchema.safeParse({
        kind: 'ok',
        value: { ...page, total: { kind: 'exact', value: 501 } },
      }).success,
    ).toBe(true)
    expect(
      ScheduleListResultSchema.safeParse({
        kind: 'ok',
        value: { ...page, total: { kind: 'unknown', reason: 'sourceUnavailable' } },
      }).success,
    ).toBe(false)
    expect(
      ScheduleListResultSchema.safeParse({
        kind: 'ok',
        value: { ...page, total: { kind: 'exact', value: -1 } },
      }).success,
    ).toBe(false)
  })
  it('checks limits and rejects invented filters', () => {
    expect(
      ScheduleListRequestSchema.safeParse({ ...filter, cursor: null, limit: 200 }).success,
    ).toBe(true)
    expect(
      ScheduleListRequestSchema.safeParse({ ...filter, cursor: null, limit: 201 }).success,
    ).toBe(false)
    expect(
      ScheduleListRequestSchema.safeParse({ ...filter, cursor: null, limit: 50, owner: 'forged' })
        .success,
    ).toBe(false)
    expect(
      ScheduleRevisionsRequestSchema.safeParse({ scheduleId: id, cursor: null, limit: 501 })
        .success,
    ).toBe(false)
    expect(
      ScheduleExecutionsRequestSchema.safeParse({
        scheduleId: id,
        cursor: null,
        limit: 500,
        from: instant,
        to: instant,
      }).success,
    ).toBe(false)
  })
  it('uses a strict preview source and explicit count', () => {
    const request = { source: { kind: 'schedule', scheduleId: id }, after: instant, count: 5 }
    expect(SchedulePreviewRequestSchema.parse(request)).toEqual(request)
    for (const count of [0, 101, 1.5, undefined])
      expect(SchedulePreviewRequestSchema.safeParse({ ...request, count }).success).toBe(false)
    expect(
      SchedulePreviewRequestSchema.safeParse({
        ...request,
        source: { ...request.source, definition: {} },
      }).success,
    ).toBe(false)
  })
  it('enforces the half-open 92 civil day agenda budget', () => {
    const request = {
      from: '2026-01-01T00:00:00',
      to: '2026-04-03T00:00:00',
      timezone: 'Asia/Tokyo',
      filter,
      cursor: null,
      limit: 5000,
    }
    expect(ScheduleAgendaRequestSchema.parse(request)).toEqual(request)
    expect(
      ScheduleAgendaRequestSchema.safeParse({ ...request, to: '2026-04-03T00:00:01' }).success,
    ).toBe(false)
    expect(ScheduleAgendaRequestSchema.safeParse({ ...request, to: request.from }).success).toBe(
      false,
    )
    expect(ScheduleAgendaRequestSchema.safeParse({ ...request, limit: 5001 }).success).toBe(false)
    expect(
      ScheduleAgendaViewSchema.safeParse({
        ...page,
        total: { kind: 'exact', value: 0 },
        range: { from: request.from, to: request.to },
        timezone: request.timezone,
        scannedScheduleCount: 10001,
        incompleteReason: null,
      }).success,
    ).toBe(false)
  })
})
it('notCommitted requires all five authoritative negative proofs', () => {
  const proofs = {
    writerGenerationExcluded: true,
    oldTransactionTerminated: true,
    databaseRecoveryFinished: true,
    authoritativeReadSucceeded: true,
    operationNotQueued: true,
  }
  const view = {
    operationRef: id,
    observedAt: instant,
    kind: 'notCommitted',
    result: null,
    error: null,
    notCommittedProofs: proofs,
  }
  expect(ScheduleOperationViewSchema.parse(view)).toEqual(view)
  for (const key of Object.keys(proofs))
    expect(
      ScheduleOperationViewSchema.safeParse({
        ...view,
        notCommittedProofs: { ...proofs, [key]: false },
      }).success,
    ).toBe(false)
  expect(ScheduleOperationViewSchema.safeParse({ ...view, notCommittedProofs: null }).success).toBe(
    false,
  )
  expect(ScheduleOperationViewSchema.safeParse({ ...view, kind: 'unknown' }).success).toBe(false)
})
it('separates pending history from proven terminal receipts', () => {
  const job = {
    jobId: id,
    revision: 1,
    acceptedAt: instant,
    stopState: 'none',
    stopOperationRef: null,
    stopReceiptRef: null,
    body: {
      kind: 'execution',
      executionState: 'concluded',
      executionRef: 'execution:1',
      terminalReceiptRef: 'terminal:1',
      outcome: 'succeeded',
    },
  }
  expect(ScheduleJobSummarySchema.parse(job)).toEqual(job)
  expect(
    ScheduleJobSummarySchema.safeParse({ ...job, body: { ...job.body, outcome: 'unknown' } })
      .success,
  ).toBe(false)
  expect(
    ScheduleJobSummarySchema.safeParse({ ...job, body: { ...job.body, terminalReceiptRef: null } })
      .success,
  ).toBe(false)
  expect(
    ScheduleJobSummarySchema.safeParse({ ...job, body: { ...job.body, executionState: 'running' } })
      .success,
  ).toBe(false)
  expect(
    ScheduleReceiptSummarySchema.safeParse({
      receiptId: id,
      decidedAt: instant,
      reasonCode: '',
      operationRef: id,
      disposition: 'missed',
      jobId: id,
    }).success,
  ).toBe(false)
  expect(
    ScheduleReceiptSummarySchema.safeParse({
      receiptId: id,
      decidedAt: instant,
      reasonCode: '',
      operationRef: id,
      disposition: 'acceptedExecution',
      jobId: null,
    }).success,
  ).toBe(false)
  expect(
    ScheduleNotificationSummarySchema.safeParse({
      notificationIntentId: 'intent',
      notificationId: null,
      outcome: 'durableAvailable',
      durableAvailableReceiptRef: null,
      observedAt: instant,
    }).success,
  ).toBe(false)
})
it('does not label blocked standing as ready', () => {
  const standing = {
    kind: 'ready',
    generation: 0,
    reasons: [],
    authorityEvidence: [],
    since: instant,
    observedAt: instant,
  }
  expect(ScheduleStandingSchema.parse(standing)).toEqual(standing)
  expect(
    ScheduleStandingSchema.safeParse({ ...standing, reasons: ['missing_environment'] }).success,
  ).toBe(false)
  expect(ScheduleStandingSchema.safeParse({ ...standing, kind: 'blocked' }).success).toBe(false)
})
