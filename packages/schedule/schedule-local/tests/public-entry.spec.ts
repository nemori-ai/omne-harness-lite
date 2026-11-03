import { expect, it } from 'vitest'

it('exports calculation and management storage factories', async () => {
  const root = (await import('@omne-harness/schedule-local')) as Record<string, unknown>
  expect(typeof root['createScheduleCalculationWorker']).toBe('function')
  expect(typeof root['createScheduleManagementSqlBackend']).toBe('function')
  expect(typeof root['scheduleManagementSqlMaterials']).toBe('function')
})
