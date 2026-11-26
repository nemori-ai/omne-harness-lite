import { z } from 'zod'
import {
  directJobId,
  type ScheduleHistoryReader,
  type ScheduleReadAuthorizer,
} from '@omne-harness/schedule'
import {
  ScheduleExecutionsPageSchema,
  ScheduleJobDetailSchema,
  type ScheduleCallContext,
  type ScheduleJobDetail,
  type ScheduleJobExecutor,
  type ScheduleJobs,
  type ScheduleOwner,
  type ScheduleQueries,
  type ScheduleQueryResult,
  type ScheduleWork,
} from '@omne-harness/schedule-contract'
import { domainError, equal } from './storage/encoding.ts'
import { readRepository } from './storage/store.ts'
import type { ScheduleManagementSqlOptions } from './storage/index.ts'

type Sql = Pick<ScheduleManagementSqlOptions, 'storage' | 'scope' | 'transactionDomain'>
const revisionSchema = z.strictObject({ observationRevision: z.string() })

/** The history this store keeps: slots, lapses and direct Jobs, newest first; its revision grows with every append. */
export function createScheduleHistoryReader(sql: Sql): ScheduleHistoryReader {
  const revision = (owner: ScheduleOwner) =>
    readRepository(
      sql.storage,
      sql.transactionDomain,
      { kind: 'historyRevision', scope: sql.scope, owner },
      revisionSchema,
    )
  return {
    observe: ({ access }) => revision(access.owner),
    confirm: async ({ access, observationRevision }) => {
      const now = await revision(access.owner)
      return now.kind === 'ok' && now.value.observationRevision !== observationRevision
        ? { kind: 'changed' }
        : now
    },
    read: async ({ access, observationRevision, request }) => {
      const page = await readRepository(
        sql.storage,
        sql.transactionDomain,
        { kind: 'history', scope: sql.scope, owner: access.owner, ...request },
        ScheduleExecutionsPageSchema,
      )
      return page.kind === 'ok' && page.value.observationRevision !== observationRevision
        ? { kind: 'changed' }
        : page
    },
  }
}

export type JobsDispatcher = Readonly<{
  cancel(
    jobId: never,
    operation: string,
  ): Promise<Readonly<{ kind: 'changed' | 'unchanged' | 'absent' | 'unknown' }>>
  startDirect(
    work: ScheduleWork,
    key: string,
    by: 'human' | 'agent' | 'system',
  ): Promise<
    | Readonly<{ kind: 'started' | 'unknown' | 'conflict'; jobId: string }>
    | Readonly<{ kind: 'refused'; jobId: string; reason: string }>
  >
}>

type Ports = Readonly<{
  sql: Sql
  owner: ScheduleOwner
  queries: Pick<ScheduleQueries, 'get'>
  authorizer: ScheduleReadAuthorizer
  dispatcher: JobsDispatcher
  /** The executor registered now for a work's path: asked what an execution in a session left. */
  executor?: (work: ScheduleWork) => ScheduleJobExecutor | undefined
}>

/** Reading, cancelling and directly starting Jobs: a Job is seen by whoever sees its schedule; a direct one by any reader of the tenant. */
export function createScheduleJobs(ports: Ports): ScheduleJobs {
  const fail = (
    ctx: ScheduleCallContext,
    code: 'not_found' | 'operation_key_conflict' | 'provider_failure',
  ) => ({
    kind: 'error' as const,
    error: domainError(code, ctx.requestId, `schedule job: ${code}`),
  })
  const read = async (jobId: string) => {
    const result = await readRepository(
      ports.sql.storage,
      ports.sql.transactionDomain,
      { kind: 'jobDetail', scope: ports.sql.scope, owner: ports.owner, jobId: jobId as never },
      ScheduleJobDetailSchema.nullable(),
    )
    return result.kind === 'ok' ? result.value : undefined
  }
  const accounted = async (detail: ScheduleJobDetail): Promise<ScheduleJobDetail> => {
    const where = detail.executionWhere
    if (where?.kind !== 'session' || detail.purpose.kind !== 'execution') return detail
    const { work } = detail.purpose
    const job = {
      owner: ports.owner,
      jobId: detail.job.jobId,
      scheduleId: detail.scheduleId,
      work,
      executionRef: where.sessionRef,
      acceptedAt: detail.job.acceptedAt,
    }
    const account = await Promise.resolve()
      .then(() => ports.executor?.(work)?.describe?.(job))
      .catch(() => null)
    return account == null ? detail : { ...detail, executionWhere: { ...where, account } }
  }
  const visible = async (ctx: ScheduleCallContext, detail: ScheduleJobDetail) => {
    if (detail.scheduleId !== null)
      return (await ports.queries.get(ctx, { scheduleId: detail.scheduleId })).kind === 'ok'
    const access = await ports.authorizer.observe({ context: ctx, action: 'executions' })
    return access.kind === 'ok' && equal(access.value.owner, ports.owner)
  }
  const seen = async (
    ctx: ScheduleCallContext,
    jobId: string,
  ): Promise<ScheduleQueryResult<ScheduleJobDetail>> => {
    const detail = await read(jobId)
    if (detail === undefined) return fail(ctx, 'provider_failure')
    if (detail === null || !(await visible(ctx, detail))) return fail(ctx, 'not_found')
    return { kind: 'ok', value: await accounted(detail) }
  }
  const may = async (ctx: ScheduleCallContext) => {
    const access = await ports.authorizer.observe({ context: ctx, action: 'executions' })
    return access.kind === 'ok' && equal(access.value.owner, ports.owner)
  }
  return {
    get: (ctx, input) => seen(ctx, input.jobId),
    async ofExecution(ctx, input) {
      const found = await readRepository(
        ports.sql.storage,
        ports.sql.transactionDomain,
        { kind: 'jobsOfExecution', scope: ports.sql.scope, owner: ports.owner, ...input },
        z.array(ScheduleJobDetailSchema),
      )
      if (found.kind !== 'ok') return fail(ctx, 'provider_failure')
      const shown: ScheduleJobDetail[] = []
      for (const detail of found.value)
        if (await visible(ctx, detail)) shown.push(await accounted(detail))
      return { kind: 'ok', value: shown }
    },
    async cancel(ctx, input) {
      const before = await seen(ctx, input.jobId)
      if (before.kind === 'error') return before
      const answer = await ports.dispatcher.cancel(input.jobId as never, input.operationKey)
      if (answer.kind === 'absent') return fail(ctx, 'not_found')
      if (answer.kind === 'unknown')
        return { kind: 'ok', value: { outcome: 'unknown', detail: null } }
      const detail = (await read(input.jobId)) ?? null
      const outcome = answer.kind === 'changed' ? 'committed' : 'noChange'
      return { kind: 'ok', value: { outcome, detail } }
    },
    async queryCancel(ctx, input) {
      const before = await seen(ctx, input.jobId)
      if (before.kind === 'error') return before
      const recorded = await readRepository(
        ports.sql.storage,
        ports.sql.transactionDomain,
        {
          kind: 'jobCancel',
          scope: ports.sql.scope,
          owner: ports.owner,
          jobId: input.jobId,
          operation: input.operationKey,
        },
        z.boolean(),
      )
      if (recorded.kind !== 'ok') return fail(ctx, 'provider_failure')
      return { kind: 'ok', value: { committed: recorded.value, detail: before.value } }
    },
    async start(ctx, input) {
      if (!(await may(ctx))) return fail(ctx, 'not_found')
      const answer = await ports.dispatcher.startDirect(
        input.work,
        input.operationKey,
        ctx.actor.kind,
      )
      if (answer.kind === 'conflict') return fail(ctx, 'operation_key_conflict')
      if (answer.kind === 'refused')
        return {
          kind: 'error',
          error: domainError('invalid_input', ctx.requestId, answer.reason),
        }
      if (answer.kind === 'unknown')
        return { kind: 'ok', value: { outcome: 'unknown', detail: null } }
      return {
        kind: 'ok',
        value: { outcome: 'committed', detail: (await read(answer.jobId)) ?? null },
      }
    },
    async queryStart(ctx, input) {
      if (!(await may(ctx))) return fail(ctx, 'not_found')
      const detail = await read(directJobId(ports.owner, input.operationKey))
      if (detail === undefined) return fail(ctx, 'provider_failure')
      if (detail === null) return { kind: 'ok', value: { committed: false, detail: null } }
      const work = detail.purpose.kind === 'execution' ? detail.purpose.work : null
      if (!equal(work, input.work)) return fail(ctx, 'operation_key_conflict')
      return { kind: 'ok', value: { committed: true, detail } }
    },
  }
}
