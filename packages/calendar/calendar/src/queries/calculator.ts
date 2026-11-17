import type { CalendarCalculator, CalendarQueries } from '@omne-harness/calendar-contract'

/** The calculator is the effective calendar at its latest version; the selection never comes from the caller. */
export function createCalendarCalculator(
  queries: Pick<CalendarQueries, 'resolve'>,
): CalendarCalculator {
  return {
    answer: (ctx, question) =>
      queries.resolve(ctx, {
        selection: { kind: 'effective' },
        version: { kind: 'latest' },
        query: question,
      }),
  }
}
