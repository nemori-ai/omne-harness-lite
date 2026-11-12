import { expect, it } from 'vitest'
import * as schedule from '@omne-harness/schedule'

it('exports the read-only ScheduleQueries application factory', () => {
  expect(schedule).toHaveProperty('createScheduleQueryApplication', expect.any(Function))
})
