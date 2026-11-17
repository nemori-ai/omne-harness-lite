import { createHash } from 'node:crypto'
import type {
  ScheduleCallContext,
  ScheduleCommands,
  ScheduleInstant,
  ScheduleQueries,
} from '@omne-harness/schedule-contract'
import type { ToolExecutionContext, ToolExecutionScope } from '@omne-harness/tool-contract/provider'

/** What the host knows of one call: its tenant, the schedule services now, and the context it derives. */
export type ScheduleCallSource = Readonly<{
  tenant: string
  call: string
  commands(): ScheduleCommands | undefined
  queries(): ScheduleQueries | undefined
  context(): Promise<ScheduleCallContext | undefined>
  now(): ScheduleInstant
}>

export type ScheduleFaces = Readonly<{
  commands: ScheduleCommands
  queries: ScheduleQueries
  context: ScheduleCallContext
}>

/** Why a call could not reach the schedule services: absent, or a context of another tenant. */
export type ScheduleUnreachable = Readonly<{
  kind: 'unreachable'
  reason: 'unavailable' | 'forbidden'
}>

/** The schedule services bound to one call. Keys and consent references derive from the call, not the model. */
export type BoundSchedules = Readonly<{
  faces(): Promise<ScheduleFaces | ScheduleUnreachable>
  /** The operation key of one write of this call; the same step of the same call is the same write. */
  operationKey(step: string): string
  /** The consent reference of a card this call raised. */
  consentRef(cardId: string): string
  now(): ScheduleInstant
}>

const unavailable: ScheduleUnreachable = { kind: 'unreachable', reason: 'unavailable' }

/** Binds a call; a context whose owner is not the call's tenant is refused before any service is asked. */
export function bindSchedules(source: ScheduleCallSource): BoundSchedules {
  return {
    async faces() {
      const commands = source.commands()
      const queries = source.queries()
      if (commands === undefined || queries === undefined) return unavailable
      let context: ScheduleCallContext | undefined
      try {
        context = await source.context()
      } catch {
        return unavailable
      }
      if (context === undefined) return unavailable
      if (context.owner.kind !== 'tenant' || context.owner.tenantId !== source.tenant)
        return { kind: 'unreachable', reason: 'forbidden' }
      return { commands, queries, context }
    },
    operationKey: step => `tool:${digestOf([source.tenant, source.call, step])}`,
    consentRef: cardId => scheduleConsentRef(source.call, cardId),
    now: () => source.now(),
  }
}

const digestOf = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 48)

/** The reference a consent from a card of this call carries: bound to the call, readable by the host. */
export function scheduleConsentRef(call: string, cardId: string): string {
  return `tool-call/${digestOf(call)}/${cardId}`
}

/** Keyed by the call's abort signal: a checkpoint segment gets a narrowed context that keeps it. */
const attachments = new WeakMap<AbortSignal, BoundSchedules>()
export function schedulesOf(
  context: Pick<ToolExecutionContext, 'signal'>,
): BoundSchedules | undefined {
  return attachments.get(context.signal)
}

/** Attach after other context-producing attachments. Finish removes the services before delegation. */
export function attachSchedules(
  scope: ToolExecutionScope,
  schedules: BoundSchedules,
): ToolExecutionScope {
  const context = scope.context
  attachments.set(context.signal, schedules)
  let finished: ReturnType<ToolExecutionScope['finish']> | undefined
  return {
    context,
    limits: scope.limits,
    finish(exit) {
      if (finished !== undefined) return finished
      if (attachments.get(context.signal) === schedules) attachments.delete(context.signal)
      finished = Promise.resolve().then(() => scope.finish(exit))
      return finished
    },
  }
}
