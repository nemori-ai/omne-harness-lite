import { expect, it } from 'vitest'
import { calendarQuerySchema } from '@omne-harness/calendar-contract'
import { createCalendarCalculator } from '../../src/index.ts'
import { context } from './fixture.ts'

it('asks the effective calendar at its latest version, whatever the question', async () => {
  const asked: unknown[] = []
  const calculator = createCalendarCalculator({
    async resolve(ctx, input) {
      asked.push([ctx, input])
      return {
        kind: 'error',
        error: { code: 'not_found', message: '', retryable: false, requestId: 'r', details: {} },
      }
    },
  })
  const question = calendarQuerySchema.parse({ kind: 'shift', date: '2026-10-01', offset: 5 })
  expect(await calculator.answer(context, question)).toMatchObject({ kind: 'error' })
  expect(asked).toEqual([
    [context, { selection: { kind: 'effective' }, version: { kind: 'latest' }, query: question }],
  ])
})
