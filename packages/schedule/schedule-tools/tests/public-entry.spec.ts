import { expect, it } from 'vitest'
import * as tools from '@omne-harness/schedule-tools'
it('publishes the schedule author, trusted environment and fixed-result reader', () => {
  expect(tools).toHaveProperty('createScheduleToolModule', expect.any(Function))
  expect(tools).toHaveProperty('createScheduleToolEnvironment', expect.any(Function))
  expect(tools).toHaveProperty('createScheduleToolDetails', expect.any(Function))
})
