import { describe, expect, it } from 'vitest'
import { createScheduleQueryApplication } from '@omne-harness/schedule'
import { ScheduleExecutionRowSchema } from '@omne-harness/schedule-contract'
import { context, fixture, listRequest, now } from './fixtures.ts'

describe('provider request integrity', () => {
  it('does not disclose history after a provider substitutes an unauthorized schedule', async () => {
    const f = fixture(2)
    const [authorized, other] = f.records
    if (!authorized || !other) throw new Error('Expected two schedules')
    f.state.access.visibility = {
      kind: 'grantedIds',
      scheduleIds: [authorized.view.scheduleId],
    }
    const candidate = other.view.nextOccurrence
    if (!candidate) throw new Error('Expected candidate')
    f.state.rows = [
      ScheduleExecutionRowSchema.parse({
        rowRef: 'other:history',
        scheduleId: other.view.scheduleId,
        occurrenceKey: 'other:occurrence',
        originalScheduledAt: candidate.scheduledAt,
        candidate,
        preparation: null,
        receipt: null,
        job: null,
        notification: null,
      }),
    ]
    const read = f.dependencies.history.read
    f.dependencies.history.read = async input => {
      input.request.scheduleId = other.view.scheduleId
      return read(input)
    }
    const request = {
      scheduleId: authorized.view.scheduleId,
      cursor: null,
      limit: 50,
      from: null,
      to: null,
    }
    const result = await createScheduleQueryApplication(f.dependencies).queries.executions(
      context,
      request,
    )
    expect(result).toMatchObject({ kind: 'error', error: { code: 'provider_failure' } })
    expect(result).not.toHaveProperty('value')
    expect(request.scheduleId).toBe(authorized.view.scheduleId)
  })

  it.each(['revision', 'definition'] as const)(
    'rejects provider mutation of prediction %s',
    async field => {
      const f = fixture()
      const saved = f.records[0]
      if (!saved) throw new Error('Expected schedule')
      const definition = structuredClone(saved.view.definition)
      const preview = f.dependencies.prediction.preview
      f.dependencies.prediction.preview = async (context, input) => {
        if (field === 'revision') input.definitionRevision = 99
        else input.definition.binding = { kind: 'explicit', timezone: 'Asia/Tokyo', calendar: null }
        return preview(context, input)
      }
      const result = await createScheduleQueryApplication(f.dependencies).queries.preview(context, {
        source: { kind: 'inline', definition },
        after: now,
        count: 1,
      })
      expect(result).toMatchObject({ kind: 'error', error: { code: 'provider_failure' } })
      expect(result).not.toHaveProperty('value')
      expect(definition).toEqual(saved.view.definition)
    },
  )

  it('does not let a store replace the requested list filter', async () => {
    const f = fixture()
    const list = f.dependencies.store.listSchedules
    f.dependencies.store.listSchedules = async input => {
      input.request.control = 'active'
      return list(input)
    }
    const result = await createScheduleQueryApplication(f.dependencies).queries.list(context, {
      ...listRequest,
      control: 'paused',
    })
    expect(result).toMatchObject({ kind: 'error', error: { code: 'provider_failure' } })
    expect(result).not.toHaveProperty('value')
  })
})
