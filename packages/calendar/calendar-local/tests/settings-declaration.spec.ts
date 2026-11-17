import { expect, it } from 'vitest'
import { shippedCalendarSupplyPolicies } from '@omne-harness/calendar'
import { defineSettings, evaluateSettings } from '@omne-harness/settings'
import { calendarEnvironmentSettings } from '../src/index.ts'

it('declares the time zone and the calendar with the local defaults', () => {
  const defined = defineSettings(calendarEnvironmentSettings)
  expect(defined.kind).toBe('defined')
  const evaluated = evaluateSettings({ definition: calendarEnvironmentSettings, sources: [] })
  if (!('entries' in evaluated)) throw new Error(evaluated.kind)
  expect(
    Object.fromEntries(evaluated.entries.map(entry => [entry.itemId, [entry.value, entry.source]])),
  ).toEqual({
    timezone: [{ kind: 'value', value: 'Asia/Shanghai' }, 'default'],
    calendar: [{ kind: 'value', value: 'cn-legal-holidays' }, 'default'],
  })
})

it('offers exactly the shipped calendars, each with a label', () => {
  const item = calendarEnvironmentSettings.items.find(value => value.id === 'calendar')
  const ids = shippedCalendarSupplyPolicies.map(policy => policy.calendarId)
  expect(item?.valueSchema['enum']).toEqual(ids)
  expect(item?.presentation.enumLabels?.map(label => label.value)).toEqual(ids)
  expect(item?.presentation.enumLabels?.every(label => label.title !== label.value)).toBe(true)
})
