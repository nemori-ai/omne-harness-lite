import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { calendarSnapshotSchema } from '@omne-harness/calendar-contract'
import type { CalendarReadResult, CalendarRepository } from '@omne-harness/calendar'
import type { SqlStorage } from '@omne-harness/sql-contract'
import {
  DOMAIN,
  HANDLER,
  PROTOCOL,
  candidateRecordSchema,
  directorySchema,
  reactionSchema,
  readSchema,
  versionSchema,
  type RepositoryRead,
} from './schema.ts'

export function reader(storage: SqlStorage) {
  return async function read<T>(
    input: RepositoryRead,
    schema: z.ZodType<T>,
  ): Promise<CalendarReadResult<T>> {
    const parsed = readSchema.safeParse(input)
    if (!parsed.success) return { kind: 'invalid', message: 'Invalid repository query' }
    try {
      const result = await storage.read({
        domain: { scope: { kind: 'system' }, transactionDomain: DOMAIN },
        handler: HANDLER,
        protocol: PROTOCOL,
        requestKey: randomUUID(),
        input: parsed.data,
      })
      if (result.kind !== 'read')
        return {
          kind: 'unavailable',
          reason: result.kind === 'unavailable' ? result.reason : 'cancelled',
        }
      const output = schema.safeParse(result.output)
      return output.success
        ? { kind: 'ok', value: output.data }
        : { kind: 'unavailable', reason: 'invalidStoredData' }
    } catch {
      return { kind: 'unavailable', reason: 'providerFailure' }
    }
  }
}
function page<T>(item: z.ZodType<T>) {
  return z.strictObject({ items: z.array(item), nextCursor: z.string().nullable() })
}
export function repository(storage: SqlStorage): CalendarRepository {
  const read = reader(storage)
  return {
    getCalendar: input => read({ ...input, kind: 'calendar' }, directorySchema.nullable()),
    listCalendars: input => read({ ...input, kind: 'calendars' }, page(directorySchema)),
    listVersions: input => read({ ...input, kind: 'versions' }, page(versionSchema)),
    getSnapshot: input => read({ ...input, kind: 'snapshot' }, calendarSnapshotSchema.nullable()),
    getCandidate: input => read({ ...input, kind: 'candidate' }, candidateRecordSchema.nullable()),
    listCandidates: input => read({ ...input, kind: 'candidates' }, page(candidateRecordSchema)),
    listPendingReactions: input => read({ ...input, kind: 'reactions' }, page(reactionSchema)),
  }
}
