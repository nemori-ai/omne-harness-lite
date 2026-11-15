import { expect, it } from 'vitest'
import * as schedule from '@omne-harness/schedule'

it('exports independent management decisions and application construction', () => {
  expect(schedule).toHaveProperty('decideScheduleManagement', expect.any(Function))
  expect(schedule).toHaveProperty('createScheduleManagementApplication', expect.any(Function))
})
