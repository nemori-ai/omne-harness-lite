import { expect, it } from 'vitest'
import * as local from '@omne-harness/calendar-local'

it('exports independent storage factory and build-fixed materials', () => {
  expect(local).toHaveProperty('createCalendarSqlPersistence', expect.any(Function))
  expect(local).toHaveProperty('calendarSqlMaterials', expect.any(Function))
})
