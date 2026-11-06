import type { z } from 'zod'
import { decideSettingsRebase, type SettingsRebase } from '@omne-harness/settings'
import type { guardFactSchema, stateRecordSchema } from './schema.ts'
import { canRetainSettingsSource, matchesSettingsSources } from './source-layout.ts'

type StoredState = z.infer<typeof stateRecordSchema>
type NextSources = Pick<z.infer<typeof guardFactSchema>, 'definition' | 'definitionRef' | 'sources'>

export function decideStoredSettingsRebase(
  command: SettingsRebase,
  current: StoredState,
  next: NextSources,
): ReturnType<typeof decideSettingsRebase> {
  const decision = decideSettingsRebase({
    command,
    state: current.state,
    previousDefinition: current.definitionRef,
    nextDefinition: next.definitionRef,
    definition: next.definition,
    sourceIds: next.sources.map(source => source.sourceId),
  })
  if (decision.kind === 'rejected') return decision
  if (
    command.assignments.some(
      assignment =>
        assignment.disposition === 'retain' &&
        !canRetainSettingsSource(current.sourceLayout, next.sources, assignment.sourceId),
    )
  )
    return { kind: 'rejected', reason: 'incompatible' }
  if (matchesSettingsSources(current.sourceLayout, next.sources) || decision.kind === 'changed')
    return decision
  if (decision.state.revision >= Number.MAX_SAFE_INTEGER - 1)
    return { kind: 'rejected', reason: 'limit_exceeded' }
  return { kind: 'changed', state: { ...decision.state, revision: decision.state.revision + 1 } }
}
