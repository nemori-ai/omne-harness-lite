import { expect, it } from 'vitest'
import { defineSettings, evaluateSettings } from '@omne-harness/settings'
import { scheduleAgentAuthoringSettings } from '../src/index.ts'

it('declares how agent schedule changes are consented, taking effect by default', () => {
  expect(defineSettings(scheduleAgentAuthoringSettings).kind).toBe('defined')
  const evaluated = evaluateSettings({ definition: scheduleAgentAuthoringSettings, sources: [] })
  if (!('entries' in evaluated)) throw new Error(evaluated.kind)
  expect(evaluated.entries).toMatchObject([
    { itemId: 'agentScheduleConsent', value: { kind: 'value', value: 'auto' }, source: 'default' },
  ])
  const item = scheduleAgentAuthoringSettings.items[0]
  expect(item?.valueSchema['enum']).toEqual(['auto', 'draft'])
  expect(item?.presentation.enumLabels?.map(label => label.title)).toEqual(['自动生效', '先存草稿'])
})
