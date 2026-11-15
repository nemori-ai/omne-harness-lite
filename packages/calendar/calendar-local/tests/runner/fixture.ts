import { vi } from 'vitest'
import { calendarCallContextSchema } from '@omne-harness/calendar-contract'
import type { CalendarSupplyApplication } from '@omne-harness/calendar'

export const context = calendarCallContextSchema.parse({
  principalRef: 'trusted-test-maintainer',
  owner: { kind: 'system', systemScopeRef: 'test-system' },
  actor: { kind: 'system', actorRef: 'test-host' },
  authContextRef: 'test-authority',
  requestId: 'first',
  originatingSessionRef: null,
})
export function application() {
  return {
    probe: vi.fn<CalendarSupplyApplication['probe']>(),
    refresh: vi
      .fn<CalendarSupplyApplication['refresh']>()
      .mockResolvedValue({ kind: 'ok', value: { kind: 'unknown', operationRef: 'original-run' } }),
    importSeed: vi
      .fn<CalendarSupplyApplication['importSeed']>()
      .mockResolvedValue({ kind: 'ok', value: { releaseRef: 'release', results: [] } }),
    queryPublication: vi.fn<CalendarSupplyApplication['queryPublication']>(),
    health: vi.fn<CalendarSupplyApplication['health']>(),
    initialize: vi
      .fn<CalendarSupplyApplication['initialize']>()
      .mockResolvedValue({ kind: 'ok', value: [] }),
    recover: vi.fn<CalendarSupplyApplication['recover']>().mockResolvedValue({
      kind: 'ok',
      value: [{ kind: 'ok', value: { kind: 'unknown', operationRef: 'original-run' } }],
    }),
    runDue: vi
      .fn<CalendarSupplyApplication['runDue']>()
      .mockResolvedValue({ kind: 'ok', value: [] }),
    deliverReactions: vi
      .fn<CalendarSupplyApplication['deliverReactions']>()
      .mockResolvedValue({ kind: 'ok', value: [] }),
    stop: vi
      .fn<CalendarSupplyApplication['stop']>()
      .mockReturnValue({ kind: 'admissionStopped', durableRuns: 'retained' }),
  } satisfies CalendarSupplyApplication
}
