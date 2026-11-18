import { refusal, type BodyContract, type CategoryContribution } from '@omne-harness/assets'
import { calendarEnvironmentSettings } from '@omne-harness/calendar-local'
import { scheduleAgentAuthoringSettings } from '@omne-harness/schedule-local'
import { canonicalText } from '@omne-harness/authorization'
import {
  settingsSourceIdentities,
  type SettingDefinitions,
  type SettingsTarget,
  type TenantSettingsAssetRef,
} from '@omne-harness/settings'
import type { createStandaloneSettingsOwner } from '@omne-harness/settings-local'
import { canonicalDigest } from '@omne-harness/tool'

/** Personal settings that domains declare, each on an independent target of every tenant. */
export const PREFERENCE_SETTINGS: readonly SettingDefinitions[] = [
  calendarEnvironmentSettings,
  scheduleAgentAuthoringSettings,
]
export const PREFERENCE_SETTINGS_CONFIGURATION = {
  destination: 'harness.governance.preference-settings',
  sourceRoute: 'harness.governance.preference-settings',
}
const OWNER = 'harness.preference-settings'
const PREFERENCE_CATEGORY = 'preference'

export function preferenceTarget(
  definition: Pick<SettingDefinitions, 'providerId' | 'definitionId'>,
  tenantRef: string,
): SettingsTarget {
  return {
    kind: 'independent',
    providerId: definition.providerId,
    definitionId: definition.definitionId,
    scopeRef: tenantRef,
  }
}

export function preferenceOf(target: SettingsTarget): SettingDefinitions | undefined {
  return PREFERENCE_SETTINGS.find(
    definition =>
      canonicalText(preferenceTarget(definition, target.scopeRef)) === canonicalText(target),
  )
}

const preferenceContract: BodyContract = {
  category: PREFERENCE_CATEGORY,
  schema: { kind: 'null' },
  judge: () => refusal('not-publishable'),
  deriveDeclarations: () => ({ entries: [] }),
  references: () => [],
}

export const preferenceCategory: CategoryContribution = {
  contract: preferenceContract,
  display: {
    title: '偏好',
    summary: '各领域声明的个人设置，每个租户一份；不是可以发布的资产。',
  },
}

export function preferenceAssetOf(target: SettingsTarget): TenantSettingsAssetRef | undefined {
  const definition = preferenceOf(target)
  return definition === undefined
    ? undefined
    : { category: PREFERENCE_CATEGORY, name: definition.providerId }
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

type Owner = ReturnType<typeof createStandaloneSettingsOwner>
type Installed = 'ready' | 'unavailable'

async function installOne(owner: Owner, tenantRef: string, definition: SettingDefinitions) {
  const target = preferenceTarget(definition, tenantRef)
  const observe = async (): Promise<Installed | undefined> => {
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

/** Opens the tenant's preference targets once; a remount reuses them and never rewrites values. */
export async function installPreferenceTargets(
  owner: Owner,
  tenantRef: string,
): Promise<Installed> {
  for (const definition of PREFERENCE_SETTINGS)
    if ((await installOne(owner, tenantRef, definition)) !== 'ready') return 'unavailable'
  return 'ready'
}

/** The reference the settings catalog gives a declaration: its version and the digest of its text. */
export function preferenceDefinitionRef(definition: SettingDefinitions) {
  return {
    providerId: definition.providerId,
    definitionId: definition.definitionId,
    version: definition.version,
    digest: canonicalDigest(definition).slice('sha256:'.length),
  }
}
