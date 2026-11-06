import { ScheduleCallContextSchema } from '@omne-harness/schedule-contract'
import { openSettingsComposition } from '../../../../calendar/calendar-local/tests/settings-composition-world.ts'
import { seededWorld } from './seeded-world.ts'

export async function settingsWorld(
  values: { timezone: string; calendar: string | null } = {
    timezone: 'Asia/Shanghai',
    calendar: 'cn-legal-holidays',
  },
) {
  const settings = await openSettingsComposition()
  try {
    for (const [itemId, value, expectedRevision] of [
      ['timezone', values.timezone, 0],
      ['calendar', values.calendar, 1],
    ] as const) {
      const changed = await settings.change(itemId, { kind: 'set', value }, expectedRevision)
      if (changed.kind !== 'committed') throw new Error(JSON.stringify(changed))
    }
    const world = await seededWorld('cn-legal-holidays', {
      context: ScheduleCallContextSchema.parse(settings.context),
      environment: settings.environment,
    })
    let closed: Promise<void> | undefined
    return {
      ...world,
      settings,
      evidenceScope: {
        ...world.evidenceScope,
        real: [
          ...world.evidenceScope.real,
          'Identity SQL with issued principal and current membership',
          'Settings catalog and qualified SQL commands',
          'Calendar Settings environment and Schedule environment bridge',
        ],
        fixtures: [
          'domain access, consent, quota and basis SQL guard',
          'empty execution history',
          'fixed clock and trusted deployment declaration',
        ],
      },
      close() {
        return (closed ??= (async () => {
          const results = await Promise.allSettled([world.close(), settings.close()])
          const failures = results.filter(result => result.status === 'rejected')
          if (failures.length)
            throw new AggregateError(
              failures.map(result => result.reason),
              'Settings/Schedule cleanup failed',
            )
        })())
      },
    }
  } catch (error) {
    await settings.close()
    throw error
  }
}
