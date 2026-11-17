import {
  agentScheduleConsentItem,
  scheduleAgentAuthoringSettings,
} from '@omne-harness/schedule-local'
import { evaluateSettings } from '@omne-harness/settings'
import type { PreferenceSettingsService } from '../governance/preference-settings-service.ts'
import type { ConsentMode } from './consent.ts'

/** The owner's agent-authoring setting now: automatic with the revision of its value, or draft. */
export async function readConsentMode(
  preferences: PreferenceSettingsService,
  tenantRef: string,
): Promise<ConsentMode> {
  const binding = preferences.bindingOf(tenantRef, scheduleAgentAuthoringSettings)
  const basis = await preferences.read(tenantRef, binding.request)
  if (basis === undefined || !('views' in basis) || basis.completeness !== 'complete')
    return { kind: 'unreadable' }
  const [view] = basis.views
  if (basis.views.length !== 1 || view === undefined) return { kind: 'unreadable' }
  const evaluated = evaluateSettings({ definition: view.definition, sources: view.state.sources })
  if (!('entries' in evaluated)) return { kind: 'unreadable' }
  const value = evaluated.entries.find(entry => entry.itemId === agentScheduleConsentItem)?.value
  if (value?.kind !== 'value') return { kind: 'unreadable' }
  if (value.value === 'draft') return { kind: 'draft' }
  return value.value === 'auto'
    ? { kind: 'auto', generation: Number(view.state.revision) }
    : { kind: 'unreadable' }
}
