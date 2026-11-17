import { describe, expect, it } from 'vitest'
import {
  agentScheduleConsentItem,
  scheduleAgentAuthoringSettings,
} from '@omne-harness/schedule-local'
import type { PreferenceSettingsService } from '../../../src/rows/governance/preference-settings-service.ts'
import { readConsentMode } from '../../../src/rows/schedule/consent-setting.ts'

const value = (v: unknown) => ({
  id: 'tenant',
  values: [{ itemId: agentScheduleConsentItem, value: { kind: 'value', value: v }, locked: false }],
})
const view = (sources: unknown[], definition: unknown = scheduleAgentAuthoringSettings) => ({
  definition,
  state: { sources, revision: '7' },
})

/** A preference service that answers one read with the given basis. */
function preferences(basis: unknown) {
  const asked: unknown[] = []
  const service = {
    bindingOf: (tenant: string, definition: unknown) => ({ request: { tenant, definition } }),
    read: async (tenant: string, request: unknown) => {
      asked.push([tenant, request])
      if (basis instanceof Error) throw basis
      return basis
    },
  } as unknown as PreferenceSettingsService
  return { service, asked }
}

describe("readConsentMode: the owner's agent-authoring setting at the moment of a decision", () => {
  it('reads automatic by default, with the revision of the setting as the consent generation', async () => {
    const p = preferences({ views: [view([])], completeness: 'complete' })
    expect(await readConsentMode(p.service, 'tenant/a')).toEqual({ kind: 'auto', generation: 7 })
    expect(p.asked).toEqual([
      ['tenant/a', { tenant: 'tenant/a', definition: scheduleAgentAuthoringSettings }],
    ])
  })

  it.each([
    ['auto', { kind: 'auto', generation: 7 }],
    ['draft', { kind: 'draft' }],
  ])('reads the value %s the owner set', async (set, mode) => {
    const p = preferences({ views: [view([value(set)])], completeness: 'complete' })
    expect(await readConsentMode(p.service, 'tenant/a')).toEqual(mode)
  })

  it.each([
    ['no answer', undefined],
    ['a refusal', { kind: 'rejected', reason: 'unavailable' }],
    ['a partial read', { views: [view([])], completeness: 'partial' }],
    ['no view', { views: [], completeness: 'complete' }],
    ['two views', { views: [view([]), view([])], completeness: 'complete' }],
    [
      'a value outside the declaration',
      { views: [view([value('later')])], completeness: 'complete' },
    ],
    [
      'a declaration the evaluator refuses',
      { views: [view([], { items: 'x' })], completeness: 'complete' },
    ],
    [
      'a declaration without the item',
      {
        views: [view([], { ...scheduleAgentAuthoringSettings, items: [] })],
        completeness: 'complete',
      },
    ],
  ])('cannot read the setting from %s', async (_, basis) => {
    expect(await readConsentMode(preferences(basis).service, 'tenant/a')).toEqual({
      kind: 'unreadable',
    })
  })
})
