import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  ScheduleListPageSchema,
  ScheduleRevisionsPageSchema,
} from '@omne-harness/schedule-contract'
import type { ReadResult, ScheduleManagementStore } from '@omne-harness/schedule'
import type { SqlStorage, StorageScope } from '@omne-harness/sql-contract'
import { domainError, json, ownerMatches } from './encoding.ts'
import { DOMAIN, HANDLER, PROTOCOL, recordSchema } from './schema.ts'
import { readRequestSchema, type RepositoryRequest } from './read-schema.ts'

export async function readRepository<T>(
  storage: SqlStorage,
  request: RepositoryRequest,
  schema: z.ZodType<T>,
): Promise<ReadResult<T>> {
  try {
    const input = readRequestSchema.parse(request)
    const owner =
      input.kind === 'schedule'
        ? input.owner
        : input.kind === 'operation'
          ? input.recovery.owner
          : input.access.owner
    if (!ownerMatches(input.scope, owner))
      return {
        kind: 'unavailable',
        error: domainError(
          'forbidden',
          'schedule.management.read',
          'Owner is outside the configured storage scope',
        ),
      }
    const requestKey = randomUUID()
    const result = await storage.read({
      domain: { scope: request.scope, transactionDomain: DOMAIN },
      handler: HANDLER,
      protocol: PROTOCOL,
      requestKey,
      input: json(input),
    })
    if (result.kind !== 'read')
      return {
        kind: 'unavailable',
        error: domainError(
          'provider_failure',
          requestKey,
          result.kind === 'unavailable' ? result.reason : 'cancelled',
        ),
      }
    if (result.requestKey !== requestKey) throw new Error('Read correlation mismatch')
    return z
      .discriminatedUnion('kind', [
        z.strictObject({ kind: z.literal('ok'), value: schema }),
        z.strictObject({ kind: z.literal('absent') }),
        z.strictObject({ kind: z.literal('changed') }),
      ])
      .parse(result.output)
  } catch {
    return {
      kind: 'unavailable',
      error: domainError(
        'provider_failure',
        'schedule.management.read',
        'Repository input or result was invalid',
      ),
    }
  }
}
const snapshotSchema = z.strictObject({
  observationRevision: z.string().min(1),
  value: recordSchema,
})
export function managementStore(storage: SqlStorage, scope: StorageScope): ScheduleManagementStore {
  return {
    readSchedule: input =>
      readRepository(storage, { ...input, kind: 'schedule', scope }, snapshotSchema),
    getSchedule: input => readRepository(storage, { ...input, kind: 'get', scope }, snapshotSchema),
    listSchedules: input =>
      readRepository(storage, { ...input, kind: 'list', scope }, ScheduleListPageSchema),
    readRevisions: input =>
      readRepository(storage, { ...input, kind: 'revisions', scope }, ScheduleRevisionsPageSchema),
  }
}
