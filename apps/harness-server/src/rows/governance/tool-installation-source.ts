import { settingsSourceIdentities, type SettingDefinitions } from '@omne-harness/settings'
import type {
  createStandaloneSettingsOwner,
  StandaloneTargetReadResult,
} from '@omne-harness/settings-local'
import { canonicalDigest } from '@omne-harness/tool'
import { TOOL_GOVERNANCE_OWNER } from '../../entry/tool-permission-release.ts'
import { organizationSettingsSource } from './organization-settings.ts'

export type ToolSourceInstallation =
  | Readonly<{ kind: 'ready' | 'inactive'; source: ReturnType<typeof organizationSettingsSource> }>
  | Readonly<{ kind: 'unavailable' }>

type Installation = Readonly<{
  owner: ReturnType<typeof createStandaloneSettingsOwner>
  organizationId: string
  definition: SettingDefinitions
}>

function sourceLayout(organizationId: string) {
  return [
    {
      sourceId: 'organization',
      ownerRef: TOOL_GOVERNANCE_OWNER,
      scope: { kind: 'organization' as const, subjectRef: organizationId },
    },
  ]
}

function observe(
  current: StandaloneTargetReadResult,
  input: Installation,
  source: ReturnType<typeof organizationSettingsSource>,
): ToolSourceInstallation | undefined {
  if (current.kind === 'rejected') return { kind: 'unavailable' }
  if (current.kind === 'not_found') return undefined
  if (current.retired || !current.projection.enabled) return { kind: 'inactive', source }
  if (
    canonicalDigest(settingsSourceIdentities(current.projection.sources)) !==
    canonicalDigest(sourceLayout(input.organizationId))
  )
    return { kind: 'unavailable' }
  return canonicalDigest(current.projection.definition) === canonicalDigest(input.definition)
    ? { kind: 'ready', source }
    : { kind: 'unavailable' }
}

/** Reuses the organization target; remount never changes assignments or restores retired targets. */
export async function installToolOrganizationSource(
  input: Installation,
): Promise<ToolSourceInstallation> {
  const source = organizationSettingsSource(input)
  const current = await input.owner.readTarget(source.target)
  const observed = observe(current, input, source)
  if (observed !== undefined) return observed
  const record = {
    publicationRef: null,
    target: source.target,
    definition: input.definition,
    sources: sourceLayout(input.organizationId),
    grants: [
      {
        sourceId: 'organization',
        actions: ['set' as const, 'clear' as const, 'lock' as const, 'unlock' as const],
      },
    ],
  }
  const command = {
    kind: 'provision' as const,
    record,
    expectedRevision: null,
  }
  const result = await input.owner.mutate({
    ...command,
    operationId: canonicalDigest({ owner: TOOL_GOVERNANCE_OWNER, command }),
  })
  if (result.kind === 'rejected' && result.reason !== 'revision_conflict')
    return { kind: 'unavailable' }
  return (
    observe(await input.owner.readTarget(source.target), input, source) ?? { kind: 'unavailable' }
  )
}
