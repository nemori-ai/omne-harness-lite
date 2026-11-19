import type { CalendarEnvironmentReader } from '@omne-harness/calendar'
import { calendarIdSchema, timezoneSchema, type CalendarId } from '@omne-harness/calendar-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  StaticBlock,
  StaticReaderRequest,
  StaticScopeHolder,
  SuppliedBlockDescriptor,
} from '@omne-harness/runtime-context-contract'

export const CALENDAR_ENVIRONMENT_KEY = 'calendar.environment'

/** A tenant's effective calendar and timezone, read in one revision; `missing`: not set. */
export type CalendarEnvironmentValue =
  | Readonly<{ kind: 'found'; revision: string; timezone: string; calendarId: CalendarId | null }>
  | Readonly<{ kind: 'missing' }>

declare module '@omne-harness/runtime-context-contract' {
  interface ContextBlocks {
    'calendar.environment': CalendarEnvironmentValue
  }
}

function valueOf(value: unknown): CalendarEnvironmentValue | null {
  if (typeof value !== 'object' || value === null) return null
  const item = value as Record<string, unknown>
  if (item['kind'] === 'missing') return { kind: 'missing' }
  if (item['kind'] !== 'found' || typeof item['revision'] !== 'string') return null
  const timezone = timezoneSchema.safeParse(item['timezone'])
  const calendarId = calendarIdSchema.nullable().safeParse(item['calendarId'])
  if (!timezone.success || !calendarId.success) return null
  return {
    kind: 'found',
    revision: item['revision'],
    timezone: timezone.data,
    calendarId: calendarId.data,
  }
}

export const calendarEnvironmentDescriptor = Object.freeze({
  key: CALENDAR_ENVIRONMENT_KEY,
  kind: 'supplied',
  schema: {
    '~standard': {
      version: 1,
      vendor: 'calendar-adapters',
      validate: (value: unknown) => {
        const environment = valueOf(value)
        return environment === null
          ? { issues: [{ message: 'Expected the effective calendar environment of a tenant' }] }
          : { value: environment }
      },
    },
  },
  consumers: ['coordinator'],
  required: true,
  disclosure: 'plain',
  carriesPrevious: false,
  volatility: 'per-read',
  recovery: 'reread',
} satisfies SuppliedBlockDescriptor<typeof CALENDAR_ENVIRONMENT_KEY, CalendarEnvironmentValue>)

/** The block the assembly fills from the tenant's settings. Null from `read`: not readable now. */
export function calendarEnvironmentBlock(
  read: (tenant: TenantId) => Promise<CalendarEnvironmentValue | null>,
): StaticBlock {
  return Object.freeze({
    declaration: calendarEnvironmentDescriptor,
    supply: async ({ tenant }) => {
      const value = await read(tenant)
      return value === null
        ? ({ kind: 'unavailable' } as const)
        : ({ kind: 'value', value } as const)
    },
  })
}

export type CalendarEnvironmentReaderDeps<P> = Readonly<{
  scope(): Pick<StaticScopeHolder<P>, 'read'> | undefined
  /** Who reads for the tenant of a call; null when nobody may now. */
  reader(tenantId: string): Promise<Readonly<{ principal: P; tenant: TenantId }> | null>
}>

const REQUEST: StaticReaderRequest = {
  consumer: 'coordinator',
  blocks: [CALENDAR_ENVIRONMENT_KEY],
  needs: [],
}

/** The calendar queries read the environment through the tenant-level scope; anything but a value is unavailable. */
export function createCalendarEnvironmentReader<P>(
  deps: CalendarEnvironmentReaderDeps<P>,
): CalendarEnvironmentReader {
  const reader: CalendarEnvironmentReader = {
    async read(context) {
      try {
        if (context.owner.kind !== 'tenant') return { kind: 'unavailable' }
        const scope = deps.scope()
        const who = await deps.reader(context.owner.tenantId)
        if (scope === undefined || who === null) return { kind: 'unavailable' }
        const read = await scope.read(who.principal, who.tenant, REQUEST)
        if ('failure' in read) return { kind: 'unavailable' }
        const entry = read.ok.entries.find(item => item.key === CALENDAR_ENVIRONMENT_KEY)
        const value = entry?.kind === 'value' ? valueOf(entry.value) : null
        if (value === null) return { kind: 'unavailable' }
        if (value.kind === 'missing') return { kind: 'missing' }
        const { kind: _kind, ...found } = value
        return { kind: 'found', value: { owner: context.owner, ...found } }
      } catch {
        return { kind: 'unavailable' }
      }
    },
  }
  return Object.freeze(reader)
}
