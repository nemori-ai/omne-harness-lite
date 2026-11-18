import {
  settingsSourceIdentities,
  type IndependentTarget,
  type SettingDefinitions,
} from '@omne-harness/settings'
import type { createStandaloneSettingsOwner } from '@omne-harness/settings-local'
import { canonicalDigest } from '@omne-harness/tool'

export const INDEPENDENT_SETTINGS_CONFIGURATION = {
  destination: 'harness.governance.independent-settings',
  sourceRoute: 'harness.governance.independent-settings',
}
const OWNER = 'harness.independent-settings'

export type IndependentGroupState = 'ready' | 'unavailable'
type Owner = Pick<ReturnType<typeof createStandaloneSettingsOwner>, 'readTarget' | 'mutate'>

export function independentTarget(
  definition: Pick<SettingDefinitions, 'providerId' | 'definitionId'>,
  tenantRef: string,
): IndependentTarget {
  return {
    kind: 'independent',
    providerId: definition.providerId,
    definitionId: definition.definitionId,
    scopeRef: tenantRef,
  }
}

/** The reference the settings catalog gives a declaration: its version and the digest of its text. */
export function independentDefinitionRef(definition: SettingDefinitions) {
  return {
    providerId: definition.providerId,
    definitionId: definition.definitionId,
    version: definition.version,
    digest: canonicalDigest(definition).slice('sha256:'.length),
  }
}

function sourceLayout(tenantRef: string) {
  return [
    {
      sourceId: 'tenant',
      ownerRef: OWNER,
      scope: { kind: 'tenant' as const, subjectRef: tenantRef },
    },
  ]
}

async function provisionOne(
  owner: Owner,
  tenantRef: string,
  definition: SettingDefinitions,
): Promise<IndependentGroupState> {
  const target = independentTarget(definition, tenantRef)
  const observe = async (): Promise<IndependentGroupState | undefined> => {
    const current = await owner.readTarget(target)
    if (current.kind === 'not_found') return undefined
    if (current.kind === 'rejected' || current.retired) return 'unavailable'
    const same =
      canonicalDigest(settingsSourceIdentities(current.projection.sources)) ===
        canonicalDigest(sourceLayout(tenantRef)) &&
      canonicalDigest(current.projection.definition) === canonicalDigest(definition)
    return same ? 'ready' : 'unavailable'
  }
  const seen = await observe()
  if (seen !== undefined) return seen
  const command = {
    kind: 'provision' as const,
    expectedRevision: null,
    record: {
      publicationRef: null,
      target,
      definition,
      sources: sourceLayout(tenantRef),
      grants: [{ sourceId: 'tenant', actions: ['set' as const, 'clear' as const] }],
    },
  }
  const result = await owner.mutate({
    ...command,
    operationId: canonicalDigest({ owner: OWNER, command }),
  })
  if (result.kind === 'rejected' && result.reason !== 'revision_conflict') return 'unavailable'
  return (await observe()) ?? 'unavailable'
}

/** Opens a tenant's independent targets group by group; one opening per declaration is in flight. */
export function independentTargetsOf(owner: Owner, tenantRef: string) {
  const ready = new Set<string>()
  const opening = new Map<string, Promise<IndependentGroupState>>()
  const open = (identity: string, definition: SettingDefinitions) => {
    const known = opening.get(identity)
    if (known !== undefined) return known
    const started = provisionOne(owner, tenantRef, definition)
      .catch(() => 'unavailable' as const)
      .then(state => {
        opening.delete(identity)
        if (state === 'ready') ready.add(identity)
        return state
      })
    opening.set(identity, started)
    return started
  }
  return {
    async ensure(
      definitions: readonly SettingDefinitions[],
    ): Promise<ReadonlyMap<string, IndependentGroupState>> {
      const states = new Map<string, IndependentGroupState>()
      for (const definition of definitions) {
        const key = JSON.stringify([definition.providerId, definition.definitionId])
        const identity = JSON.stringify([key, canonicalDigest(definition)])
        states.set(key, ready.has(identity) ? 'ready' : await open(identity, definition))
      }
      return states
    },
  }
}
