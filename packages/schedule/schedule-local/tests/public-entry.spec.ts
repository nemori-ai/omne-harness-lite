import { expect, it } from 'vitest'

it('exports the management storage factory and its static materials', async () => {
  const root = (await import('@omne-harness/schedule-local')) as Record<string, unknown>
  expect(typeof root['createScheduleManagementSqlBackend']).toBe('function')
  expect(typeof root['scheduleManagementSqlMaterials']).toBe('function')
})
