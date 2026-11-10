import {
  decideSettingsChange,
  defineSettings,
  settingsSourceIdentities,
} from '@omne-harness/settings'
import { businessRefusalSchema, type CommitMaterial } from './commit-current.ts'
import { businessOutcomeSchema } from './finalization-schema.ts'
import { decideStoredSettingsRebase } from './rebase-decision.ts'
import { matchesSettingsSources } from './source-layout.ts'
import type { readStateRecord } from './records.ts'
import type { readSettingsIntent } from './intent-records.ts'
import { digest, equal } from './encoding.ts'

type Root = Extract<ReturnType<typeof readSettingsIntent>, { kind: 'found' }>
type Record = ReturnType<typeof readStateRecord>

function validateMaterial(root: Root, current: Record, material: CommitMaterial) {
  const { basis, definition, grants } = material
  const defined = defineSettings(definition)
  if (
    defined.kind !== 'defined' ||
    digest(defined.definition) !== basis.definitionRef.digest ||
    definition.providerId !== basis.definitionRef.providerId ||
    definition.definitionId !== basis.definitionRef.definitionId ||
    definition.version !== basis.definitionRef.version ||
    !equal(basis.target, root.identity.operation.target) ||
    basis.valueRevision !== (current?.state.revision ?? 0) ||
    grants.some(grant => !basis.sources.some(source => source.sourceId === grant.sourceId))
  )
    throw new Error('Invalid current Settings business material')
}

function changeDecision(root: Root, current: Record, material: CommitMaterial) {
  if (root.intent.kind !== 'change') throw new Error('Settings change command required')
  const { command } = root.intent
  if (current && command.expectedRevision !== current.state.revision)
    return { kind: 'rejected' as const, reason: 'revision_conflict' as const }
  if (current && !equal(current.definitionRef, material.basis.definitionRef))
    return { kind: 'rejected' as const, reason: 'definition_changed' as const }
  if (current && !matchesSettingsSources(current.sourceLayout, material.basis.sources))
    return { kind: 'abort-attempt' as const }
  if (material.definition.items.find(item => item.id === command.itemId)?.sensitivity === 'secret')
    return { kind: 'rejected' as const, reason: 'unsupported' as const }
  return decideSettingsChange({
    command,
    state: current?.state ?? {
      revision: 0,
      sources: material.basis.sources.map(source => ({ id: source.sourceId, values: [] })),
    },
    definition: material.definition,
    definitionRef: material.basis.definitionRef,
    grants: material.grants,
  })
}

export function decidePreparedSettingsMutation(
  root: Root,
  current: Record,
  material: CommitMaterial,
) {
  validateMaterial(root, current, material)
  const decision =
    root.intent.kind === 'change'
      ? changeDecision(root, current, material)
      : current
        ? decideStoredSettingsRebase(root.intent.command, current, {
            definition: material.definition,
            definitionRef: material.basis.definitionRef,
            sources: material.basis.sources,
          })
        : { kind: 'abort-attempt' as const }
  if (decision.kind === 'abort-attempt') return decision
  if (decision.kind === 'rejected') {
    const reason = businessRefusalSchema.safeParse(decision.reason)
    return reason.success ? { kind: 'abort-root' as const, reason: reason.data } : decision
  }
  return businessOutcomeSchema.parse({
    kind: 'apply',
    result: {
      kind: 'committed',
      operationId: root.identity.operation.operationId,
      revision: decision.state.revision,
      changed: decision.kind === 'changed',
    },
    record: {
      scope: root.identity.domain.scope,
      target: root.identity.operation.target,
      definitionRef: material.basis.definitionRef,
      state: decision.state,
      sourceLayout: { kind: 'bound', sources: settingsSourceIdentities(material.basis.sources) },
    },
  })
}
