import type {
  CalendarAnswer,
  CalendarCalculator,
  CalendarCallContext,
  CalendarQuestion,
} from '@omne-harness/calendar-contract'
import type { ToolExecutionContext, ToolExecutionScope } from '@omne-harness/tool-contract/provider'

/** What the host knows of one call: its tenant, the calculator now, and the domain context it derives. */
export type CalendarCallSource = Readonly<{
  tenant: string
  requestId: string
  calculator(): CalendarCalculator | undefined
  context(): Promise<CalendarCallContext | undefined>
}>

/** The calculator bound to one call: the tool asks questions, never names a calendar or a version. */
export type BoundCalendar = Readonly<{
  answer(question: CalendarQuestion): Promise<CalendarAnswer>
}>

const refusal = (
  requestId: string,
  code: 'forbidden' | 'provider_failure',
  message: string,
): CalendarAnswer => ({
  kind: 'error',
  error: { code, message, retryable: code === 'provider_failure', requestId, details: {} },
})

/** Binds a call; a context whose owner is not the call's tenant is refused before the calculator is asked. */
export function bindCalendar(source: CalendarCallSource): BoundCalendar {
  return {
    async answer(question) {
      const calculator = source.calculator()
      if (calculator === undefined)
        return refusal(source.requestId, 'provider_failure', 'the calendar calculator is absent')
      let context: CalendarCallContext | undefined
      try {
        context = await source.context()
      } catch {
        context = undefined
      }
      if (context === undefined)
        return refusal(source.requestId, 'provider_failure', 'the call context is not available')
      if (context.owner.kind !== 'tenant' || context.owner.tenantId !== source.tenant)
        return refusal(source.requestId, 'forbidden', 'the call context names another tenant')
      try {
        return await calculator.answer(context, question)
      } catch {
        return refusal(
          source.requestId,
          'provider_failure',
          'the calendar calculator did not answer',
        )
      }
    },
  }
}

const attachments = new WeakMap<ToolExecutionContext, BoundCalendar>()
export function calendarOf(context: ToolExecutionContext): BoundCalendar | undefined {
  return attachments.get(context)
}

/** Attach after other context-producing attachments. Finish removes the calendar before delegation. */
export function attachCalendar(
  scope: ToolExecutionScope,
  calendar: BoundCalendar,
): ToolExecutionScope {
  const context = scope.context
  attachments.set(context, calendar)
  let finished: ReturnType<ToolExecutionScope['finish']> | undefined
  return {
    context,
    limits: scope.limits,
    finish(exit) {
      if (finished !== undefined) return finished
      attachments.delete(context)
      finished = Promise.resolve().then(() => scope.finish(exit))
      return finished
    },
  }
}
