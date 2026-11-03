import type { z } from 'zod'
import {
  ScheduleExecutionsPageSchema,
  ScheduleListPageSchema,
  SchedulePreviewResultSchema,
  type ScheduleCallContext,
  type ScheduleExecutionsRequest,
  type ScheduleId,
  type ScheduleListRequest,
} from '@omne-harness/schedule-contract'
import type { ReadAccess, ScheduleReadAuthorizer, ScheduleRecord } from '../management/types.ts'
import type { SchedulePredictionInput } from '../prediction/types.ts'
import type { ScheduleQueryDependencies } from './types.ts'
import {
  equal,
  freeze,
  fail,
  ObservationSchema,
  QueryFailure,
  ReadAccessSchema,
  ReadEnvelopeSchema,
  RecordSnapshotSchema,
  requireEqual,
  requireId,
  visible,
} from './boundary.ts'

export class QueryObservation {
  private calls = 0
  private readonly deadline: number
  reserve = 0
  readonly dependencies: ScheduleQueryDependencies
  readonly context: ScheduleCallContext
  constructor(dependencies: ScheduleQueryDependencies, context: ScheduleCallContext) {
    this.dependencies = dependencies
    this.context = context
    this.deadline = this.now() + dependencies.limits.timeoutMs
  }
  private now(): number {
    const now = this.dependencies.monotonicClock.now()
    if (!Number.isFinite(now)) fail(this.context, 'provider_failure', 'Invalid monotonic clock')
    return now
  }
  check() {
    if (this.now() >= this.deadline)
      fail(this.context, 'search_limit', 'Query deadline exceeded', 'deadline_exceeded')
  }
  async call<T>(operation: () => Promise<T>): Promise<T> {
    this.check()
    if (this.calls >= this.dependencies.limits.maxDependencyCalls - this.reserve)
      fail(this.context, 'search_limit', 'Dependency call budget exceeded', 'dependency_calls')
    this.calls++
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new QueryFailure({
                code: 'search_limit',
                message: 'Query deadline exceeded',
                retryable: true,
                requestId: this.context.requestId,
                details: { reason: 'deadline_exceeded' },
              }),
            ),
          Math.max(1, this.deadline - this.now()),
        )
      })
      const value = await Promise.race([Promise.resolve().then(operation), timeout])
      this.check()
      return value
    } catch (error) {
      if (error instanceof QueryFailure) throw error
      return fail(this.context, 'provider_failure', 'Query dependency failed')
    } finally {
      clearTimeout(timer)
    }
  }
  parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
    const result = schema.safeParse(value)
    if (!result.success)
      return fail(this.context, 'provider_failure', 'Dependency returned an invalid value')
    return result.data
  }
  async read<S extends z.ZodType>(
    schema: S,
    operation: () => Promise<unknown>,
    absent: 'forbidden' | 'not_found' | 'dependency_blocked' = 'dependency_blocked',
  ): Promise<z.output<S>> {
    const result = this.parse(ReadEnvelopeSchema, await this.call(operation))
    switch (result.kind) {
      case 'ok':
        return this.parse(schema, result.value)
      case 'absent':
        return fail(this.context, absent, 'Required observation is absent')
      case 'changed':
        return fail(this.context, 'stale_cursor', 'Observation changed')
      case 'unavailable':
        throw new QueryFailure(result.error)
    }
  }
  async authorize(action: Parameters<ScheduleReadAuthorizer['observe']>[0]['action']) {
    const access = await this.read(
      ReadAccessSchema,
      () => this.dependencies.authorizer.observe({ context: this.context, action }),
      'forbidden',
    )
    if (
      !equal(access.owner, this.context.owner) ||
      access.principalRef !== this.context.principalRef
    )
      fail(this.context, 'forbidden', 'Authorization scope does not match the caller')
    return freeze(access)
  }
  async confirm(access: ReadAccess) {
    const confirmed = await this.read(
      ReadAccessSchema,
      () => this.dependencies.authorizer.confirm({ context: this.context, observed: access }),
      'forbidden',
    )
    requireEqual(this.context, access, confirmed)
  }
  async get(access: ReadAccess, scheduleId: ScheduleId) {
    requireId(this.context, access, scheduleId)
    const snapshot = await this.read(
      RecordSnapshotSchema,
      () => this.dependencies.store.getSchedule({ access, scheduleId }),
      'not_found',
    ).catch(async error => {
      if (error instanceof QueryFailure && error.error.code === 'not_found')
        await this.confirm(access)
      throw error
    })
    visible(this.context, access, snapshot.value.view)
    if (snapshot.value.view.scheduleId !== scheduleId)
      fail(this.context, 'provider_failure', 'Wrong schedule identity')
    return snapshot
  }
  async list(access: ReadAccess, request: ScheduleListRequest) {
    const page = await this.read(ScheduleListPageSchema, () =>
      this.dependencies.store.listSchedules({ access, request }),
    )
    if (
      page.items.length > request.limit ||
      page.total.value < page.items.length ||
      !page.complete ||
      (request.cursor === null &&
        page.nextCursor === null &&
        page.total.value !== page.items.length) ||
      (page.nextCursor !== null && page.total.value <= page.items.length) ||
      (page.nextCursor !== null && (page.items.length === 0 || page.nextCursor === request.cursor))
    )
      fail(this.context, 'provider_failure', 'Invalid list pagination')
    const ids = new Set<string>()
    for (const view of page.items) {
      visible(this.context, access, view)
      if (ids.has(view.scheduleId))
        fail(this.context, 'provider_failure', 'Duplicate schedule identity')
      ids.add(view.scheduleId)
      if (
        (request.control !== null && request.control !== view.control) ||
        (request.standing !== null && request.standing !== view.standing.kind) ||
        (request.createdBy !== null && request.createdBy !== view.createdBy) ||
        (request.purpose !== null && request.purpose !== view.definition.purpose.kind) ||
        (request.targetDeviceRef !== null &&
          (view.definition.purpose.kind !== 'execution' ||
            view.definition.purpose.scope.kind !== 'device' ||
            view.definition.purpose.scope.deviceRef !== request.targetDeviceRef)) ||
        (request.agentRef !== null &&
          (view.author.kind !== 'agent' || view.author.actorRef !== request.agentRef)) ||
        (request.calendarId !== null &&
          view.definition.binding.kind === 'explicit' &&
          view.definition.binding.calendar?.calendarId !== request.calendarId)
      )
        fail(this.context, 'provider_failure', 'Store returned a row outside the filter')
    }
    return page
  }
  async historyObservation(access: ReadAccess) {
    return this.read(ObservationSchema, () => this.dependencies.history.observe({ access }))
  }
  async confirmHistory(access: ReadAccess, observationRevision: string) {
    const value = await this.read(ObservationSchema, () =>
      this.dependencies.history.confirm({ access, observationRevision }),
    )
    requireEqual(this.context, value.observationRevision, observationRevision)
  }
  async history(
    access: ReadAccess,
    observationRevision: string,
    request: ScheduleExecutionsRequest,
  ) {
    const page = await this.read(ScheduleExecutionsPageSchema, () =>
      this.dependencies.history.read({ access, observationRevision, request }),
    )
    requireEqual(this.context, observationRevision, page.observationRevision)
    if (
      page.items.length > request.limit ||
      (page.nextCursor !== null && (page.items.length === 0 || page.nextCursor === request.cursor))
    )
      fail(this.context, 'provider_failure', 'Invalid history pagination')
    const ids = new Set<string>()
    for (const row of page.items) {
      if (
        row.scheduleId !== request.scheduleId ||
        ids.has(row.rowRef) ||
        (request.from !== null && row.originalScheduledAt < request.from) ||
        (request.to !== null && row.originalScheduledAt >= request.to)
      )
        fail(this.context, 'provider_failure', 'History returned a row outside the request')
      ids.add(row.rowRef)
    }
    return page
  }
  async predict(input: SchedulePredictionInput) {
    const result = this.parse(
      SchedulePreviewResultSchema,
      await this.call(() => this.dependencies.prediction.preview(this.context, input)),
    )
    if (result.kind === 'error') throw new QueryFailure(result.error)
    const value = result.value
    if (
      value.basis.definitionRevision !== input.definitionRevision ||
      value.candidates.length > input.count ||
      value.observedThrough < input.after
    )
      fail(
        this.context,
        'provider_failure',
        'Prediction does not match the requested definition or range',
      )
    const binding = input.definition.binding
    if (
      binding.kind === 'explicit' &&
      (value.basis.timezone !== binding.timezone ||
        value.basis.environmentRevision !== null ||
        value.basis.calendarId !== (binding.calendar?.calendarId ?? null) ||
        (binding.calendar?.version.kind === 'pinned' &&
          value.basis.calendarVersionId !== binding.calendar.version.versionId))
    )
      fail(this.context, 'provider_failure', 'Prediction basis does not match the explicit binding')
    if (binding.kind === 'followUserEnvironment' && value.basis.environmentRevision === null)
      fail(this.context, 'provider_failure', 'Follow prediction has no environment observation')
    let previous = input.after
    for (const candidate of value.candidates) {
      if (!equal(candidate.basis, value.basis) || candidate.scheduledAt <= previous)
        fail(
          this.context,
          'provider_failure',
          'Prediction candidates are not a consistent ordered prefix',
        )
      previous = candidate.scheduledAt
    }
    return value
  }
}
export function predictionInput(
  record: ScheduleRecord,
  after: SchedulePredictionInput['after'],
  count: number,
): SchedulePredictionInput {
  return {
    definition: record.view.definition,
    definitionRevision: record.view.definitionRevision,
    activationExclusive: record.activationExclusive,
    eligibleConsumed: record.view.eligibleConsumed,
    acceptedJobCount: record.view.acceptedJobCount,
    after,
    count,
  }
}
