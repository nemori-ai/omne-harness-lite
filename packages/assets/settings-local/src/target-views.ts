import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import {
  SettingsOwnerProjectionSchema,
  settingsAssetsProjectionFact,
  settingsStandaloneProjectionFact,
  type SettingsProjectionBinding,
} from './projection.ts'
import { equal } from './encoding.ts'
/** The views of both target owners for one projection binding; a target has one owner. */
export function targetViews(port: ParticipantPort, binding: SettingsProjectionBinding) {
  const sources = [settingsStandaloneProjectionFact, settingsAssetsProjectionFact].map(key =>
    SettingsOwnerProjectionSchema.parse(port.requireFact(key)),
  )
  if (sources.some(source => !equal(source.binding, binding)))
    throw new Error('Settings projection binding mismatch')
  const views = sources.flatMap(source => source.views)
  const keys = views.map(view => JSON.stringify(view.target))
  if (new Set(keys).size !== keys.length) throw new Error('Settings target has multiple owners')
  if (views.length > 128) throw new Error('Settings projection limit exceeded')
  return views
}
