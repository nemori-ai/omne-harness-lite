import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { DispatchCommand, DispatchPending, DispatchStore } from '@omne-harness/schedule'
import { ScheduleRevisionViewSchema, type ScheduleOwner } from '@omne-harness/schedule-contract'
import type { FactCommandV2, SqlStorage, StorageScope } from '@omne-harness/sql-contract'
import { digest, json } from './encoding.ts'
import { scheduleDispatchRequirement } from './dispatch-commit.ts'
import {
  dispatchCommandSchema,
  dispatchStateSchema,
  type DispatchRequirement,
} from './dispatch-schema.ts'
import { HANDLER, PARTICIPANT, PROTOCOL, recordSchema } from './schema.ts'

export type ScheduleDispatchSqlOptions = Readonly<{
  storage: SqlStorage
  scope: StorageScope
  owner: ScheduleOwner
  transactionDomain: string
  combinationVersion: string
  manifestDigest: string
  guards: Readonly<{
    participant: string
    dispatch(requirement: DispatchRequirement): FactCommandV2
  }>
}>

const scheduleSchema = z.strictObject({
  record: recordSchema,
  state: dispatchStateSchema.nullable(),
  latest: ScheduleRevisionViewSchema.nullable(),
  unfinishedJobs: z.int().nonnegative(),
})
const pendingSchema = z.strictObject({
  kind: z.literal('ok'),
  value: z.strictObject({
    stale: z.array(scheduleSchema),
    due: z.array(scheduleSchema),
    active: z.boolean(),
    watch: z.strictObject({ beatAt: z.string(), watchFrom: z.string() }).nullable(),
    earliest: z.string().nullable(),
    jobs: z.array(z.unknown()),
  }),
})

/** An admission is named by its slot and its content, so a retry is recalled; a beat or a refresh keeps no receipt. */
function identity(options: ScheduleDispatchSqlOptions, command: DispatchCommand) {
  const admission = command.kind === 'admit' || command.kind === 'direct'
  return {
    scope: options.scope,
    transactionDomain: options.transactionDomain,
    operation: `schedule.dispatch.${command.kind}`,
    protocolVersion: '2' as const,
    operationKey: digest(
      admission
        ? ['omne.schedule.dispatch.admission/1', options.scope, command]
        : ['omne.schedule.dispatch.step/1', options.scope, command, randomUUID()],
    ),
    ...(admission ? {} : { recall: 'never' as const }),
  }
}

export function createScheduleDispatchSqlStore(options: ScheduleDispatchSqlOptions): DispatchStore {
  return {
    async pending(now, limit) {
      try {
        const result = await options.storage.read({
          domain: { scope: options.scope, transactionDomain: options.transactionDomain },
          handler: HANDLER,
          protocol: PROTOCOL,
          requestKey: randomUUID(),
          input: json({
            kind: 'dispatchPending',
            scope: options.scope,
            owner: options.owner,
            now,
            limit: Math.min(limit, 50),
          }),
        })
        if (result.kind !== 'read') return { kind: 'unavailable' }
        const parsed = pendingSchema.safeParse(result.output)
        return parsed.success
          ? { kind: 'ok', value: parsed.data.value as unknown as DispatchPending }
          : { kind: 'unavailable' }
      } catch {
        return { kind: 'unavailable' }
      }
    },
    async job(jobId) {
      try {
        const result = await options.storage.read({
          domain: { scope: options.scope, transactionDomain: options.transactionDomain },
          handler: HANDLER,
          protocol: PROTOCOL,
          requestKey: randomUUID(),
          input: json({ kind: 'dispatchJob', scope: options.scope, owner: options.owner, jobId }),
        })
        if (result.kind !== 'read') return { kind: 'unavailable' }
        const output = result.output as { kind?: string; value?: unknown }
        return output.kind === 'ok'
          ? { kind: 'ok', value: (output.value ?? null) as never }
          : { kind: 'unavailable' }
      } catch {
        return { kind: 'unavailable' }
      }
    },
    async commit(command) {
      try {
        const requirement = scheduleDispatchRequirement(
          options.scope,
          dispatchCommandSchema.parse(command),
        )
        const guard = options.guards.dispatch(requirement)
        if (guard.participant !== options.guards.participant) return { kind: 'unknown' }
        const result = await options.storage.commit({
          identity: identity(options, command),
          combinationVersion: options.combinationVersion,
          manifestDigest: options.manifestDigest,
          commands: [guard, { participant: PARTICIPANT, facts: { dispatch: json(requirement) } }],
        })
        if (result.kind === 'committed') return { kind: 'committed', replayed: result.recalled }
        if (result.kind === 'rolled_back') return { kind: 'stale' }
        return { kind: 'unknown' }
      } catch {
        return { kind: 'unknown' }
      }
    },
  }
}
