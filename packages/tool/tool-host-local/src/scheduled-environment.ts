import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type { Reply, ToolOperationId } from '@omne-harness/tool-contract'
import {
  type PreparationProgress,
  type ToolEnvironment,
} from '@omne-harness/tool-contract/provider'
import {
  capacity,
  createDrrSelector,
  positive,
  type DrrQueue,
  type EnvironmentPreparationInput,
  type ToolEnvironmentSchedulingPolicy,
} from './environment-policy.ts'

import {
  environmentUnavailable as unavailable,
  fixedPreparationInput,
  matchingEnvironment,
  fixedReleaseInput,
  checkedPreparationProgress,
} from './environment-input.ts'

import {
  environmentDiagnostic,
  type ToolEnvironmentDiagnostics,
} from './environment-diagnostics.ts'

export type LocalScheduledEnvironmentInput<P, E> = Readonly<{
  environment: ToolEnvironment<P, E>
  policy: ToolEnvironmentSchedulingPolicy<P>
  diagnostics: ToolEnvironmentDiagnostics
  /** Qualify the current principal, tenant, call and original preparation before queueing. */
  qualify(input: EnvironmentPreparationInput<P>): Reply<void>
}>

type Entry<E> = {
  readonly digest: string
  readonly preparation: EnvironmentPreparationInput<unknown>['preparation']
  readonly queue: DrrQueue
  occupied: boolean
  sent: boolean
  retired: boolean
  progress: PreparationProgress<E>
  running: Reply<PreparationProgress<E>> | null
  waiting: { readonly key: string; dispatch(): void; cancel(): void } | null
}

const pending = (diagnostic: string) => succeed({ kind: 'pending' as const, diagnostic })

function tenantKey(tenant: TenantId): string {
  return JSON.stringify([tenant.organization.text, tenant.account.text])
}

function operationKey(tenant: TenantId, call: string, operation: string): string {
  return JSON.stringify([tenantKey(tenant), call, operation])
}

/** One-process scheduling only. The original environment owns acquisition persistence and recovery. */
export function createLocalScheduledEnvironment<P, E>(
  input: LocalScheduledEnvironmentInput<P, E>,
): ToolEnvironment<P, E> {
  const { environment, policy } = input
  positive(policy.quantum, 'quantum')
  capacity(policy.capacity, 'capacity')
  capacity(policy.inFlight, 'inFlight')
  const queues = new Map<string, DrrQueue>()
  const entries = new Map<string, Entry<E>>()
  const admissions = new Map<string, Promise<void>>()
  const select = createDrrSelector(policy.quantum)
  let queued = 0
  let occupied = 0
  let scheduled = false

  const matches = (adoption: ToolEnvironment<P, E>['adoption']) =>
    matchingEnvironment(environment, adoption)

  const pump = () => {
    scheduled = false
    while (occupied < policy.inFlight) {
      const queue = select([...queues.values()])
      const key = queue?.pending.shift()
      if (queue === undefined || key === undefined) return
      const entry = entries.get(key)
      if (entry?.waiting == null) throw new Error('scheduled preparation missing')
      const waiting = entry.waiting
      entry.waiting = null
      queued -= 1
      occupied += 1
      queue.occupied += 1
      entry.occupied = true
      waiting.dispatch()
    }
  }
  const wake = () => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(pump)
  }
  const vacate = (entry: Entry<E>) => {
    if (!entry.occupied) return
    entry.occupied = false
    occupied -= 1
    entry.queue.occupied -= 1
    wake()
  }
  const retire = (entry: Entry<E>) => {
    entry.retired = true
    const waiting = entry.waiting
    if (waiting !== null) {
      const index = entry.queue.pending.indexOf(waiting.key)
      if (index < 0) throw new Error('queued preparation missing')
      entry.queue.pending.splice(index, 1)
      queued -= 1
      entry.waiting = null
      entry.running = null
      waiting.cancel()
    }
    vacate(entry)
  }
  const observe = (entry: Entry<E>, progress: PreparationProgress<E>) => {
    if (entry.retired) return
    entry.progress = progress
    if (progress.kind === 'rejected') entry.retired = true
    // Rejection can retain cleanup work. Only exclusion proves no delayed allocation survives.
    if (progress.kind === 'excluded') vacate(entry)
  }
  const queueFor = (tenant: TenantId): DrrQueue => {
    const key = tenantKey(tenant)
    const existing = queues.get(key)
    if (existing !== undefined) return existing
    const limits = policy.tenant(tenant)
    positive(limits.weight, 'tenant.weight')
    capacity(limits.inFlight, 'tenant.inFlight')
    const queue = {
      credit: 0,
      weight: limits.weight,
      limit: limits.inFlight,
      occupied: 0,
      pending: [],
    }
    queues.set(key, queue)
    return queue
  }

  const check = async (
    raw: EnvironmentPreparationInput<P>,
    onFailure: () => void = () => {},
    operation?: ToolOperationId,
  ): Reply<EnvironmentPreparationInput<P>> => {
    try {
      const fixed = fixedPreparationInput(raw, environment)
      if ('failure' in fixed) {
        onFailure()
        return fixed
      }
      const allowed = await input.qualify(fixed.ok)
      if ('failure' in allowed) {
        onFailure()
        return allowed
      }
      if (matches(fixed.ok.preparation.adoption)) return fixed
      onFailure()
      return unavailable('the original environment adapter is unavailable')
    } catch (cause) {
      onFailure()
      return unavailable(
        await environmentDiagnostic(input.diagnostics, {
          stage: 'qualify',
          tenant: raw.tenant,
          call: raw.call,
          operation: operation ?? raw.preparation.operation,
          cause,
        }),
      )
    }
  }

  /**
   * The final original-adoption check of a path that resumed from an await: it runs synchronously,
   * so nothing can replace the adapter between it and the forward that follows. `null` means the
   * forward may go ahead; a failure is the reply, after `onFailure` ran (before any diagnostic wait).
   */
  const adoptionGuard = (
    request: EnvironmentPreparationInput<P>,
    onFailure: () => void,
  ): Reply<never> | null => {
    try {
      if (matches(request.preparation.adoption)) return null
    } catch (cause) {
      onFailure()
      return environmentDiagnostic(input.diagnostics, {
        stage: 'qualify',
        tenant: request.tenant,
        call: request.call,
        operation: request.preparation.operation,
        cause,
      }).then(unavailable)
    }
    onFailure()
    return Promise.resolve(unavailable('the original environment adapter is unavailable'))
  }

  const attempt = async (
    entry: Entry<E>,
    work: () => Reply<PreparationProgress<E>>,
  ): Reply<PreparationProgress<E>> => {
    const outcome = await work()
    const checked =
      'failure' in outcome ? outcome : checkedPreparationProgress(outcome.ok, entry.preparation)
    if ('ok' in checked) observe(entry, checked.ok)
    return checked
  }
  const sendPreparation = async (
    entry: Entry<E>,
    request: EnvironmentPreparationInput<P>,
  ): Reply<PreparationProgress<E>> => {
    entry.sent = true
    try {
      return await environment.prepare(request)
    } catch (cause) {
      return succeed({
        kind: 'unknown',
        diagnostic: await environmentDiagnostic(input.diagnostics, {
          stage: 'prepare',
          tenant: request.tenant,
          call: request.call,
          operation: request.preparation.operation,
          cause,
        }),
      })
    }
  }

  const run = (entry: Entry<E>, work: () => Reply<PreparationProgress<E>>) => {
    const running = attempt(entry, work)
    entry.running = running
    void running.then(() => {
      if (entry.running === running) entry.running = null
    })
    return running
  }
  const queryPreparation = async (
    request: EnvironmentPreparationInput<P>,
  ): Reply<PreparationProgress<E>> => {
    try {
      const result = await environment.inspectPreparation(request)
      return 'failure' in result
        ? result
        : checkedPreparationProgress(result.ok, request.preparation)
    } catch (cause) {
      return succeed({
        kind: 'unknown',
        diagnostic: await environmentDiagnostic(input.diagnostics, {
          stage: 'inspect-preparation',
          tenant: request.tenant,
          call: request.call,
          operation: request.preparation.operation,
          cause,
        }),
      })
    }
  }
  const inspectOrRecognize = async (
    entry: Entry<E>,
    request: EnvironmentPreparationInput<P>,
    decision: 'inspect' | 'recognize',
  ): Reply<PreparationProgress<E>> => {
    const inspected = await queryPreparation(request)
    if (entry.retired) return unavailable('the original preparation was retired')
    if (
      'failure' in inspected ||
      decision === 'inspect' ||
      !['allocated', 'prepared'].includes(inspected.ok.kind)
    )
      return inspected
    // Recognition preserves every original input. The provider must not allocate a second time.
    const checked = await check(request)
    if ('failure' in checked) return checked
    if (entry.retired) return unavailable('the original preparation was retired')
    const refused = adoptionGuard(checked.ok, () => {
      if (!entry.sent) vacate(entry)
    })
    if (refused !== null) return refused
    return sendPreparation(entry, checked.ok)
  }
  const recall = (
    entry: Entry<E>,
    request: EnvironmentPreparationInput<P>,
  ): Reply<PreparationProgress<E>> => {
    if (entry.retired)
      return Promise.resolve(
        entry.progress.kind === 'rejected'
          ? succeed(entry.progress)
          : unavailable('the original preparation was released'),
      )
    if (entry.running !== null) return entry.running
    return run(entry, async () => {
      let decision: Awaited<ReturnType<typeof policy.retry>>
      try {
        decision = await policy.retry(request)
      } catch (cause) {
        return succeed({
          kind: 'unknown',
          diagnostic: await environmentDiagnostic(input.diagnostics, {
            stage: 'retry',
            tenant: request.tenant,
            call: request.call,
            operation: request.preparation.operation,
            cause,
          }),
        })
      }
      if (entry.retired) return unavailable('the original preparation was retired')
      if (decision === 'wait') return pending('the original preparation is retained')
      try {
        if (!matches(request.preparation.adoption))
          return unavailable('the original environment adapter is unavailable')
      } catch (cause) {
        return unavailable(
          await environmentDiagnostic(input.diagnostics, {
            stage: 'qualify',
            tenant: request.tenant,
            call: request.call,
            operation: request.preparation.operation,
            cause,
          }),
        )
      }
      return inspectOrRecognize(entry, request, decision)
    })
  }

  const enqueue = (
    entry: Entry<E>,
    request: EnvironmentPreparationInput<P>,
    key: string,
  ): Reply<PreparationProgress<E>> => {
    if (queued >= policy.capacity)
      return Promise.resolve(unavailable('preparation queue capacity reached'))
    // Confirmed exclusion permits a new dispatch attempt without retaining the old reservation.
    if (entry.progress.kind === 'excluded') entry.sent = false
    const waiting: Reply<PreparationProgress<E>> = new Promise(resolve => {
      entry.waiting = {
        key,
        cancel: () => resolve(unavailable('the original preparation was released')),
        dispatch: () => {
          void run(entry, async () => {
            const unsent = () => {
              if (!entry.sent) vacate(entry)
            }
            const checked = await check(request, unsent)
            if ('failure' in checked) return checked
            if (entry.retired) return unavailable('the original preparation was retired')
            const refused = adoptionGuard(checked.ok, unsent)
            if (refused !== null) return refused
            return sendPreparation(entry, checked.ok)
          }).then(resolve)
        },
      }
    })
    entry.running = waiting
    entry.progress = { kind: 'pending', diagnostic: 'preparation queued' }
    entry.queue.pending.push(key)
    queued += 1
    wake()
    return waiting
  }

  const admit = async (
    checking: ReturnType<typeof check>,
  ): Promise<{ reply: Reply<PreparationProgress<E>> }> => {
    const checked = await checking
    if ('failure' in checked) return { reply: Promise.resolve(checked) }
    const request = checked.ok
    const { preparation } = request
    const key = operationKey(request.tenant, request.call, preparation.operation)
    const digest = canonicalDigest(preparation)
    const existing = entries.get(key)
    if (existing !== undefined)
      return {
        reply:
          existing.digest === digest
            ? !existing.retired &&
              (!existing.sent || existing.progress.kind === 'excluded') &&
              existing.running === null
              ? enqueue(existing, request, key)
              : recall(existing, request)
            : Promise.resolve(fail({ kind: 'conflict', operation: preparation.operation })),
      }
    const queue = queueFor(request.tenant)
    if (queued >= policy.capacity)
      return { reply: Promise.resolve(unavailable('preparation queue capacity reached')) }
    const entry: Entry<E> = {
      digest,
      preparation,
      queue,
      occupied: false,
      sent: false,
      retired: false,
      progress: { kind: 'pending', diagnostic: 'preparation queued' },
      running: null,
      waiting: null,
    }
    entries.set(key, entry)
    return { reply: enqueue(entry, request, key) }
  }

  const prepare: ToolEnvironment<P, E>['prepare'] = async raw => {
    if (!raw || !tenantCodec.encode(raw.tenant).ok)
      return fail({ kind: 'denied', action: 'prepare' })
    const key = tenantKey(raw.tenant)
    const checking = check(raw)
    const admission = (admissions.get(key) ?? Promise.resolve()).then(() => admit(checking))
    const release = () => {
      if (admissions.get(key) === tail) admissions.delete(key)
    }
    const tail = admission.then(release, release)
    admissions.set(key, tail)
    return (await admission).reply
  }

  const inspectPreparation: ToolEnvironment<P, E>['inspectPreparation'] = async raw => {
    const checked = await check(raw)
    if ('failure' in checked) return checked
    const request = checked.ok
    const entry = entries.get(
      operationKey(request.tenant, request.call, request.preparation.operation),
    )
    if (entry && entry.digest !== canonicalDigest(request.preparation))
      return fail({ kind: 'conflict', operation: request.preparation.operation })
    // Inspection never dispatches queued work or performs acquisition/recognition.
    if (entry && !entry.occupied && entry.running !== null) return pending('preparation queued')
    const refused = adoptionGuard(request, () => {})
    if (refused !== null) return refused
    const result = await queryPreparation(request)
    if (entry && 'ok' in result && !entry.retired) observe(entry, result.ok)
    return result
  }

  const finishRelease = async (
    request: Parameters<ToolEnvironment<P, E>['release']>[0],
    inspect: boolean,
    entry: Entry<E> | undefined,
  ) => {
    let result: Awaited<ReturnType<typeof environment.release>>
    try {
      result = await (inspect ? environment.inspectRelease(request) : environment.release(request))
    } catch (cause) {
      return succeed({
        kind: 'unknown' as const,
        diagnostic: await environmentDiagnostic(input.diagnostics, {
          stage: inspect ? 'inspect-release' : 'release',
          tenant: request.tenant,
          call: request.call,
          operation: request.release.operation,
          cause,
        }),
      })
    }
    if (entry && 'ok' in result && result.ok.kind === 'released') retire(entry)
    return result
  }

  const releaseEntry = async (
    raw: Parameters<ToolEnvironment<P, E>['release']>[0],
    inspect: boolean,
  ) => {
    let fixed: ReturnType<typeof fixedReleaseInput<P>>
    try {
      fixed = fixedReleaseInput(raw, environment)
    } catch (cause) {
      return unavailable(
        await environmentDiagnostic(input.diagnostics, {
          stage: 'qualify',
          tenant: raw.tenant,
          call: raw.call,
          operation: raw.release.operation,
          cause,
        }),
      )
    }
    if ('failure' in fixed) return fixed
    const request = fixed.ok
    const entry = entries.get(
      operationKey(request.tenant, request.call, request.release.preparation),
    )
    if (entry !== undefined) {
      const checked = await check(
        {
          principal: request.principal,
          tenant: request.tenant,
          call: request.call,
          preparation: entry.preparation,
        },
        undefined,
        request.release.operation,
      )
      if ('failure' in checked) return checked
    }
    if (!inspect) {
      try {
        if ((await policy.release(request)) === 'wait') return pending('release deferred by policy')
      } catch (cause) {
        return succeed({
          kind: 'unknown' as const,
          diagnostic: await environmentDiagnostic(input.diagnostics, {
            stage: 'release-policy',
            tenant: request.tenant,
            call: request.call,
            operation: request.release.operation,
            cause,
          }),
        })
      }
    }
    try {
      if (!matches(request.release.adoption))
        return unavailable('the original environment adapter is unavailable')
    } catch (cause) {
      return unavailable(
        await environmentDiagnostic(input.diagnostics, {
          stage: 'qualify',
          tenant: request.tenant,
          call: request.call,
          operation: request.release.operation,
          cause,
        }),
      )
    }
    return finishRelease(request, inspect, entry)
  }

  const scheduledEnvironment: ToolEnvironment<P, E> = {
    get adoption() {
      return environment.adoption
    },
    prepare,
    inspectPreparation,
    release: request => releaseEntry(request, false),
    inspectRelease: request => releaseEntry(request, true),
  }
  return Object.freeze(scheduledEnvironment)
}
