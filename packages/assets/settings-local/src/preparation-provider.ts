import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import {
  SettingsChangeSchema,
  SettingsRebaseSchema,
  SettingsPreparedCommitSchema,
  SettingsCancelChangeSchema,
  SettingsOperationRefSchema,
  SettingsTargetSchema,
  type SettingsFailure,
} from '@omne-harness/settings'
import type { StandingDestinationResolver } from '@omne-harness/identity'
import { PreparationEngine } from './preparation-engine.ts'
import { preparationDestination } from './preparation-destination.ts'
import { operationObservation } from './preparation-observation.ts'
import { changesSchema, HANDLER, PROTOCOL } from './schema.ts'
import { json, withinBudget } from './encoding.ts'
import type { SettingsPreparationOptions, SettingsPreparationService } from './preparation-types.ts'
const failure = (reason: SettingsFailure['reason']): SettingsFailure => ({
  kind: 'rejected',
  reason,
})
const changesInputSchema = z.strictObject({
  target: SettingsTargetSchema,
  afterRevision: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER - 1),
  limit: z.number().int().min(1).max(100),
})
export function createSettingsPreparationBackend<Context>(
  options: SettingsPreparationOptions<Context>,
): {
  service: SettingsPreparationService<Context>
  control: { close(): Promise<void>; destination: StandingDestinationResolver }
} {
  const engine = new PreparationEngine(options)
  const active = new Set<Promise<unknown>>()
  let closing: Promise<void> | undefined
  function run<T>(task: () => Promise<T>, unavailable: T): Promise<T | SettingsFailure> {
    if (closing) return Promise.resolve(failure('closing'))
    const promise = task().catch(() => unavailable)
    active.add(promise)
    void promise.then(() => active.delete(promise))
    return promise
  }
  const service: SettingsPreparationService<Context> = {
    prepareChange(context, command) {
      if (!withinBudget(command)) return Promise.resolve(failure('limit_exceeded'))
      const parsed = SettingsChangeSchema.safeParse(command)
      if (!parsed.success) return Promise.resolve(failure('invalid_input'))
      return run(() => engine.prepare(context, { kind: 'change', command: parsed.data }), {
        kind: 'unknown' as const,
        operation: { target: parsed.data.target, operationId: parsed.data.operationId },
      })
    },
    prepareRebase(context, command) {
      if (!withinBudget(command)) return Promise.resolve(failure('limit_exceeded'))
      const parsed = SettingsRebaseSchema.safeParse(command)
      if (!parsed.success) return Promise.resolve(failure('invalid_input'))
      return run(() => engine.prepare(context, { kind: 'rebase', command: parsed.data }), {
        kind: 'unknown' as const,
        operation: { target: parsed.data.target, operationId: parsed.data.operationId },
      })
    },
    commitChange(context, input) {
      const parsed = SettingsPreparedCommitSchema.safeParse(input)
      if (!parsed.success) return Promise.resolve(failure('invalid_input'))
      return run(() => engine.commit(context, parsed.data), {
        kind: 'unknown' as const,
        operation: parsed.data.preparation.operation,
      })
    },
    cancelChange(context, input) {
      const parsed = SettingsCancelChangeSchema.safeParse(input)
      if (!parsed.success) return Promise.resolve(failure('invalid_input'))
      return run(() => engine.cancel(context, parsed.data), {
        kind: 'unknown' as const,
        operation: parsed.data.operation,
      })
    },
    getOperation(context, input) {
      const parsed = SettingsOperationRefSchema.safeParse(input)
      if (!parsed.success) return Promise.resolve(failure('invalid_input'))
      return run(
        async () => {
          const identity = await engine.authorize(context, parsed.data, 'query')
          return 'kind' in identity
            ? identity
            : operationObservation(await engine.sql.root(identity))
        },
        { kind: 'unknown' as const, operation: parsed.data },
      )
    },
    readChanges(context, input) {
      const parsed = changesInputSchema.safeParse(input)
      if (!parsed.success) return Promise.resolve(failure('invalid_input'))
      return run(async () => {
        const identity = await engine.authorize(
          context,
          { target: parsed.data.target, operationId: 'read-changes' },
          'readChanges',
        )
        if ('kind' in identity) return identity
        const result = await options.storage.read({
          domain: options.domain,
          handler: HANDLER,
          protocol: PROTOCOL,
          requestKey: randomUUID(),
          input: json({
            domain: identity.domain,
            principalRef: identity.principalRef,
            target: parsed.data.target,
            kind: 'changes',
            afterRevision: parsed.data.afterRevision,
            limit: parsed.data.limit,
          }),
        })
        return result.kind === 'read' ? changesSchema.parse(result.output) : failure('unavailable')
      }, failure('unavailable'))
    },
  }
  const destination = preparationDestination(engine.sql)
  return {
    service,
    control: {
      close() {
        return (closing ??= Promise.allSettled(active).then(() => undefined))
      },
      destination: {
        seal(reservation) {
          const unavailable = {
            kind: 'unavailable' as const,
            diagnostic: 'settings-attempt-destination-closing',
          }
          if (closing) return Promise.resolve(unavailable)
          const promise = destination.seal(reservation).catch(() => unavailable)
          active.add(promise)
          void promise.then(() => active.delete(promise))
          return promise
        },
      },
    },
  }
}
