import { settingsSourceIdentities, type SettingDefinitions } from '@omne-harness/settings'
import type {
  createStandaloneSettingsOwner,
  SettingsTargetProjection,
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
  ownerRef: string
}>

type Observed =
  | ToolSourceInstallation
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'outdated'; projection: SettingsTargetProjection }>

function sourceLayout({ organizationId, ownerRef }: Installation) {
  return [
    {
      sourceId: 'organization',
      ownerRef,
      scope: { kind: 'organization' as const, subjectRef: organizationId },
    },
  ]
}

function observe(
  current: StandaloneTargetReadResult,
  input: Installation,
  source: ReturnType<typeof organizationSettingsSource>,
): Observed {
  if (current.kind === 'rejected') return { kind: 'unavailable' }
  if (current.kind === 'not_found') return { kind: 'absent' }
  if (current.retired || !current.projection.enabled) return { kind: 'inactive', source }
  const { projection } = current
  if (
    canonicalDigest(settingsSourceIdentities(projection.sources)) !==
      canonicalDigest(sourceLayout(input)) ||
    projection.definition.providerId !== input.definition.providerId ||
    projection.definition.definitionId !== input.definition.definitionId
  )
    return { kind: 'unavailable' }
  return canonicalDigest(projection.definition) === canonicalDigest(input.definition)
    ? { kind: 'ready', source }
    : { kind: 'outdated', projection }
}

export function installToolOrganizationSource(
  input: Omit<Installation, 'ownerRef'>,
): Promise<ToolSourceInstallation> {
  return installOrganizationSource({ ...input, ownerRef: TOOL_GOVERNANCE_OWNER })
}

export async function installOrganizationSource(
  input: Installation,
): Promise<ToolSourceInstallation> {
  const source = organizationSettingsSource(input)
  const observed = observe(await input.owner.readTarget(source.target), input, source)
  if (observed.kind !== 'absent' && observed.kind !== 'outdated') return observed
  const record = {
    publicationRef: null,
    target: source.target,
    definition: input.definition,
    sources: sourceLayout(input),
    grants:
      observed.kind === 'outdated'
        ? observed.projection.grants
        : [
            {
              sourceId: 'organization',
              actions: ['set' as const, 'clear' as const, 'lock' as const, 'unlock' as const],
            },
          ],
  }
  const command = {
    kind: 'provision' as const,
    record,
    expectedRevision: observed.kind === 'outdated' ? observed.projection.ownerRevision : null,
  }
  const result = await input.owner.mutate({
    ...command,
    operationId: canonicalDigest({ owner: input.ownerRef, command }),
  })
  if (result.kind === 'rejected' && result.reason !== 'revision_conflict')
    return { kind: 'unavailable' }
  const settled = observe(await input.owner.readTarget(source.target), input, source)
  return settled.kind === 'absent' || settled.kind === 'outdated'
    ? { kind: 'unavailable' }
    : settled
}
