import canonicalize from 'canonicalize'
import { z } from 'zod'
import type { CalendarEnvironmentReader } from '@omne-harness/calendar'
import {
  calendarCallContextSchema,
  calendarOwnerSchema,
  calendarIdSchema,
  timezoneSchema,
  type CalendarCallContext,
  type CalendarOwner,
} from '@omne-harness/calendar-contract'
import {
  evaluateSettings,
  SettingsTargetSchema,
  SettingsDefinitionRefSchema,
  SettingDefinitionsSchema,
  SettingsStateSchema,
  type SettingsReadPort,
  type SettingsTarget,
  type SettingsDefinitionRef,
  type SettingsViewRequest,
} from '@omne-harness/settings'

export type CalendarSettingsBinding<P> = Readonly<{
  principal: P
  owner: CalendarOwner
  request: SettingsViewRequest
  target: SettingsTarget
  definitionRef: SettingsDefinitionRef
  timezoneItemId: string
  calendarItemId: string
}>
export type CalendarSettingsEnvironmentOptions<P> = Readonly<{
  settings: SettingsReadPort<P>
  /** The host recovers an issued principal and adopted mapping from the original call. */
  resolve(context: CalendarCallContext): Promise<CalendarSettingsBinding<P> | null>
}>
const same = (left: unknown, right: unknown) => canonicalize(left) === canonicalize(right)
type EnvironmentResult = Awaited<ReturnType<CalendarEnvironmentReader['read']>>
const basisSchema = z.object({
  scopeKey: z.string().min(1),
  revision: z.string().min(1),
  completeness: z.literal('complete'),
  unavailableProviders: z.array(z.string()).max(0),
  views: z.tuple([
    z.object({
      target: SettingsTargetSchema,
      definitionRef: SettingsDefinitionRefSchema,
      definition: SettingDefinitionsSchema,
      state: SettingsStateSchema,
    }),
  ]),
})

function matchesBinding<P>(
  context: CalendarCallContext,
  binding: CalendarSettingsBinding<P>,
): boolean {
  return (
    calendarOwnerSchema.safeParse(binding.owner).success &&
    same(context.owner, binding.owner) &&
    binding.request.targets.length === 1 &&
    same(binding.request.targets[0], binding.target) &&
    binding.timezoneItemId !== binding.calendarItemId
  )
}

function matchesDeclaration(view: z.infer<typeof basisSchema>['views'][0]): boolean {
  return (
    view.definition.providerId === view.definitionRef.providerId &&
    view.definition.definitionId === view.definitionRef.definitionId &&
    view.definition.version === view.definitionRef.version
  )
}

function project<P>(raw: unknown, binding: CalendarSettingsBinding<P>): EnvironmentResult {
  const parsed = basisSchema.safeParse(raw)
  if (!parsed.success) return { kind: 'unavailable' }
  const basis = parsed.data
  const [view] = basis.views
  if (!same(view.target, binding.target) || !same(view.definitionRef, binding.definitionRef))
    return { kind: 'unavailable' }
  if (!matchesDeclaration(view)) return { kind: 'unavailable' }
  const declared = view.definition
  const evaluated = evaluateSettings({ definition: declared, sources: view.state.sources })
  if (evaluated.kind !== 'complete') return { kind: 'unavailable' }
  const timezone = evaluated.entries.find(item => item.itemId === binding.timezoneItemId)?.value
  const calendar = evaluated.entries.find(item => item.itemId === binding.calendarItemId)?.value
  if (timezone?.kind !== 'value' || calendar?.kind !== 'value') return { kind: 'missing' }
  const zone = timezoneSchema.safeParse(timezone.value)
  const calendarId = calendarIdSchema.nullable().safeParse(calendar.value)
  if (!zone.success || !calendarId.success) return { kind: 'unavailable' }
  return {
    kind: 'found',
    value: {
      owner: binding.owner,
      revision: basis.revision,
      timezone: zone.data,
      calendarId: calendarId.data,
    },
  }
}

export function createCalendarSettingsEnvironment<P>(
  options: CalendarSettingsEnvironmentOptions<P>,
): CalendarEnvironmentReader {
  return {
    async read(context) {
      try {
        if (!calendarCallContextSchema.safeParse(context).success) return { kind: 'unavailable' }
        const binding = await options.resolve(context)
        if (binding === null || !matchesBinding(context, binding)) return { kind: 'unavailable' }
        const basis = await options.settings.read(binding.principal, binding.request)
        return project(basis, binding)
      } catch {
        return { kind: 'unavailable' }
      }
    },
  }
}
