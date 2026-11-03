import {
  instantSchema,
  calendarPublicationQuerySchema,
  type CalendarCallContext,
  type CalendarSupply,
  type CalendarRefreshInput,
  type CalendarImportSeedInput,
  type CalendarSupplyResult,
  type CalendarQueryResult,
} from '@omne-harness/calendar-contract'
import type { CalendarSupplyDependencies } from './ports.ts'
import { refreshCalendar, finishRun } from './refresh.ts'
import { importSeeds } from './seed.ts'
import { probeSource } from './probes.ts'
import { supplyHealth } from './health.ts'
import { authorize, authorityFailed, supplyError } from './access.ts'
import { recoverRuns, deliverReactions } from './recovery.ts'

export type CalendarSupplyOptions = Readonly<{ signal?: AbortSignal }>
export interface CalendarSupplyApplication extends CalendarSupply {
  refresh(
    context: CalendarCallContext,
    input: CalendarRefreshInput,
    options?: CalendarSupplyOptions,
  ): ReturnType<CalendarSupply['refresh']>
  importSeed(
    context: CalendarCallContext,
    input: CalendarImportSeedInput,
    options?: CalendarSupplyOptions,
  ): ReturnType<CalendarSupply['importSeed']>
  recover(
    context: CalendarCallContext,
    input: Readonly<{ limit: number }>,
  ): Promise<CalendarQueryResult<readonly CalendarSupplyResult[]>>
  runDue(
    context: CalendarCallContext,
    input: Readonly<{ limit: number }>,
  ): Promise<CalendarQueryResult<readonly Awaited<ReturnType<CalendarSupply['probe']>>[]>>
  deliverReactions(
    context: CalendarCallContext,
    input: Readonly<{ limit: number; acknowledgementKey: string }>,
  ): ReturnType<typeof deliverReactions>
  stop(): Readonly<{ kind: 'admissionStopped'; durableRuns: 'retained' }>
}
async function boundary<T>(
  context: CalendarCallContext,
  operation: () => Promise<CalendarQueryResult<T>>,
): Promise<CalendarQueryResult<T>> {
  try {
    return await operation()
  } catch (error) {
    return supplyError(context, 'provider_failure', String(error))
  }
}
function validLimit(limit: number): boolean {
  return Number.isSafeInteger(limit) && limit > 0 && limit <= 100
}
export function createCalendarSupplyApplication(
  deps: CalendarSupplyDependencies,
): CalendarSupplyApplication {
  const ids = deps.sourceAdapters.map(source => source.sourceId)
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate source adapter')
  let stopped = false
  const abort = new AbortController()
  const now = () =>
    deps.clock?.now() ??
    instantSchema.parse(
      /* wall-clock: clock-source -- default application clock; never supplies source knowledge */ new Date().toISOString(),
    )
  const control = { now, stopped: () => stopped }
  const signal = (options?: CalendarSupplyOptions) =>
    options?.signal ? AbortSignal.any([abort.signal, options.signal]) : abort.signal
  const application: CalendarSupplyApplication = {
    refresh: (context, input, options) =>
      boundary(context, () => refreshCalendar(deps, context, input, control, signal(options))),
    importSeed: (context, input, options) =>
      boundary(context, () => importSeeds(deps, context, input, control, signal(options))),
    probe: (context, input) =>
      boundary(context, () => probeSource(deps, context, input, now(), abort.signal)),
    health: (context, input) => boundary(context, () => supplyHealth(deps, context, input, now())),
    queryPublication: (context, input) =>
      boundary(context, async () => {
        const parsed = calendarPublicationQuerySchema.safeParse(input)
        if (!parsed.success)
          return supplyError(context, 'invalid_input', 'Invalid publication query')
        const guards = await authorize(
          deps,
          context,
          'queryPublication',
          parsed.data.address.calendarId,
        )
        if (authorityFailed(guards)) return { kind: 'error', error: guards }
        if (
          context.owner.kind !== 'system' ||
          context.owner.systemScopeRef !== input.address.systemScopeRef
        )
          return supplyError(context, 'forbidden', 'Publication owner differs from caller')
        return {
          kind: 'ok',
          value: await finishRun(
            deps,
            input,
            await deps.persistence.observeOperation(input),
            now(),
          ),
        }
      }),
    recover: (context, input) =>
      boundary(context, () =>
        validLimit(input.limit)
          ? recoverRuns(deps, context, input.limit, control)
          : Promise.resolve(supplyError(context, 'invalid_input', 'Invalid recovery limit')),
      ),
    deliverReactions: (context, input) =>
      boundary(context, () =>
        !stopped && validLimit(input.limit) && input.acknowledgementKey.trim()
          ? deliverReactions(deps, context, input)
          : Promise.resolve(
              supplyError(context, 'invalid_input', 'Invalid acknowledgement intent'),
            ),
      ),
    runDue: (context, input) =>
      boundary(context, async () => {
        if (!validLimit(input.limit))
          return supplyError(context, 'invalid_input', 'Invalid due limit')
        const guards = await authorize(deps, context, 'probe', null)
        if (authorityFailed(guards)) return { kind: 'error', error: guards }
        if (context.owner.kind !== 'system')
          return supplyError(context, 'forbidden', 'Supply requires system owner')
        const due = await deps.journal.due({
          systemScopeRef: context.owner.systemScopeRef,
          at: now(),
          limit: input.limit,
        })
        if (due.kind !== 'ok')
          return supplyError(context, 'provider_failure', `Due journal ${due.kind}`)
        const results: Awaited<ReturnType<CalendarSupply['probe']>>[] = []
        for (const probe of due.value) results.push(await application.probe(context, probe))
        return { kind: 'ok', value: results }
      }),
    stop: () => {
      stopped = true
      abort.abort()
      return { kind: 'admissionStopped', durableRuns: 'retained' }
    },
  }
  return application
}
export { CALENDAR_SUPPLY_POLICY_VERSION } from './probes.ts'
