import { describe, expect, it } from 'vitest'
import { ScheduleAgendaRequestSchema } from '@omne-harness/schedule-contract'
import { createScheduleQueryApplication as create } from '@omne-harness/schedule'
import { agendaRequest, context, fixture, listRequest } from './fixtures.ts'

describe('ScheduleQueries current disclosure', () => {
  it('preserves exact 501 total on a 50 item first page with one store call', async () => {
    const f = fixture(501)
    const result = await create(f.dependencies).queries.list(context, listRequest)
    expect(result).toMatchObject({
      kind: 'ok',
      value: { total: { kind: 'exact', value: 501 }, items: expect.any(Array) },
    })
    if (result.kind !== 'ok') throw new Error('Expected a page')
    expect(result.value.items).toHaveLength(50)
    expect(f.calls).toEqual(['authorize', 'list', 'confirm'])
  })
  it('rejects changed current permission before disclosure', async () => {
    const f = fixture()
    f.dependencies.authorizer.confirm = async () => ({ kind: 'changed' })
    expect(
      await create(f.dependencies).queries.get(context, {
        scheduleId:
          f.records.at(0)?.view.scheduleId ??
          (() => {
            throw new Error('Missing fixture record')
          })(),
      }),
    ).toMatchObject({ kind: 'error', error: { code: 'stale_cursor' } })
  })
  it('rejects a mixed data generation in revisions', async () => {
    const f = fixture()
    f.dependencies.store.readRevisions = async () => ({
      kind: 'ok',
      value: {
        items: [],
        nextCursor: null,
        observationRevision: 'other',
        complete: true,
        total: { kind: 'exact', value: 0 },
      },
    })
    expect(
      await create(f.dependencies).queries.revisions(context, {
        scheduleId:
          f.records.at(0)?.view.scheduleId ??
          (() => {
            throw new Error('Missing fixture record')
          })(),
        cursor: null,
        limit: 50,
      }),
    ).toMatchObject({ kind: 'error', error: { code: 'stale_cursor' } })
  })
  it('paginates same-instant agenda rows without dropping the next schedule', async () => {
    const f = fixture(3)
    const queries = create(f.dependencies).queries
    const request = ScheduleAgendaRequestSchema.parse({ ...agendaRequest, limit: 1 })
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      const result = await queries.agenda(context, request)
      expect(result.kind).toBe('ok')
      if (result.kind !== 'ok') throw new Error('Expected agenda')
      ids.push(...result.value.items.map(row => row.scheduleId))
      request.cursor = result.value.nextCursor
    }
    expect(ids).toEqual(f.records.map(item => item.view.scheduleId))
    expect(request.cursor).toBeNull()
  })
})
