import { expect, test } from 'vitest'
import * as local from '@omne-harness/schedule-local'

test('exports the SQL management factory and static materials', () => {
  expect(local).toHaveProperty('createScheduleManagementSqlBackend', expect.any(Function))
  expect(local).toHaveProperty('scheduleManagementSqlMaterials', expect.any(Function))
})
