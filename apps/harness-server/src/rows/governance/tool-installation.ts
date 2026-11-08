import { standingPrincipalRef, type ActingForTenantPrincipal } from '@omne-harness/identity'
import { access, organizationCodec } from '@omne-harness/legal-identity'
import type { AssetsLocal } from '@omne-harness/assets-local'
import type { createStandaloneSettingsOwner } from '@omne-harness/settings-local'
import type {
  GovernanceCatalogPage,
  GovernanceContributions,
  GovernanceScope,
} from '@omne-harness/governance-contract'
import {
  createGovernanceCollection,
  type GovernanceAdmissionGrant,
  type GovernanceCollectionMember,
} from '@omne-harness/governance-local'
import { canonicalDigest } from '@omne-harness/tool'
import type { ToolRelease } from '../../entry/tool-release.ts'
import { TOOL_GOVERNANCE_OWNER } from '../../entry/tool-permission-release.ts'
import { installToolAsset } from './tool-installation-assets.ts'
import { installToolOrganizationSource } from './tool-installation-source.ts'

type TrustedRelease = Extract<ToolRelease, { kind: 'trusted' }>
type Service = GovernanceContributions<
  ActingForTenantPrincipal,
  ActingForTenantPrincipal,
  ActingForTenantPrincipal
>
type Options = Readonly<{
  principal: ActingForTenantPrincipal
  scope: GovernanceScope
  epoch: string
  release: TrustedRelease
  service: Service
  assets: AssetsLocal
  organizationTargets: ReturnType<typeof createStandaloneSettingsOwner>
}>
export type ToolInstallationResult =
  | Readonly<{ kind: 'installed' }>
  | Readonly<{
      kind: 'unavailable'
      phase: 'identity' | 'catalog' | 'assets' | 'source' | 'contribute' | 'adopt'
    }>

export function toolInstallationGrants(
  input: Pick<Options, 'principal' | 'scope' | 'release'>,
): readonly GovernanceAdmissionGrant[] {
  const grant = {
    principalRef: standingPrincipalRef(input.principal),
    scope: input.scope,
    required: [],
  }
  return [
    {
      ...grant,
      action: 'contribute',
      owners: [
        {
          ownerId: TOOL_GOVERNANCE_OWNER,
          enforcementBindings: input.release.manifest.entries.flatMap(
            entry => entry.governance.declaration.enforcementBindings,
          ),
        },
      ],
    },
    { ...grant, action: 'adopt' },
    { ...grant, action: 'catalog-management' },
  ]
}

async function catalog(input: Options) {
  const result = await input.service.readCatalog(access(input.principal, input.principal.tenant), {
    scope: input.scope,
    mode: 'management',
    targets: [],
    cursor: null,
    limit: 100,
  })
  return result.kind === 'page' && result.completeness === 'complete' && result.nextCursor === null
    ? result
    : undefined
}

function matchesContributions(
  page: GovernanceCatalogPage,
  members: readonly GovernanceCollectionMember[],
): boolean {
  const actual = page.items
    .flatMap(item =>
      item.contributions.map(value =>
        canonicalDigest([value.contribution, item.declaration.reference, value.state]),
      ),
    )
    .sort()
  const expected = members
    .map(member => canonicalDigest([member.contribution, member.definition, 'active']))
    .sort()
  return canonicalDigest(actual) === canonicalDigest(expected)
}

function alreadySelected(
  page: GovernanceCatalogPage,
  members: readonly GovernanceCollectionMember[],
): boolean {
  const definitions = members.map(member => canonicalDigest(member.definition)).sort()
  if (
    canonicalDigest(definitions) !==
    canonicalDigest(page.snapshot.selectedDefinitions.map(canonicalDigest).sort())
  )
    return false
  return members.every(member => {
    const item = page.items.find(
      item => canonicalDigest(item.declaration.reference) === canonicalDigest(member.definition),
    )
    return (
      item !== undefined &&
      canonicalDigest(item.selectedTargets) === canonicalDigest(member.selectedTargets) &&
      (member.selectedTargets.length === 0 || item.availability === 'available')
    )
  })
}

async function adopt(
  input: Options,
  members: GovernanceCollectionMember[],
): Promise<ToolInstallationResult> {
  const current = await catalog(input)
  if (current === undefined || !matchesContributions(current, members))
    return { kind: 'unavailable', phase: 'catalog' }
  if (alreadySelected(current, members)) return { kind: 'installed' }
  const command = {
    scope: input.scope,
    expectedAdoptionRevision: current.snapshot.adoptionRevision,
    expectedDeclarationRevision: current.snapshot.declarationRevision,
    collection: createGovernanceCollection({
      scope: input.scope,
      declarationRevision: current.snapshot.declarationRevision,
      complete: members,
    }),
    complete: members.map(({ contribution, selectedTargets }) => ({
      contribution,
      selectedTargets: [...selectedTargets],
    })),
  }
  const result = await input.service.adopt(access(input.principal, input.principal.tenant), {
    ...command,
    operationId: canonicalDigest({ epoch: input.epoch, command }),
  })
  return result.kind === 'adopted' ? { kind: 'installed' } : { kind: 'unavailable', phase: 'adopt' }
}

async function installEntry(
  input: Options,
  entry: TrustedRelease['manifest']['entries'][number],
  organizationId: string,
): Promise<
  | { kind: 'member'; member: GovernanceCollectionMember }
  | Extract<ToolInstallationResult, { kind: 'unavailable' }>
> {
  const asset = await installToolAsset({
    owner: input.assets,
    tenantRef: input.scope.tenantRef,
    entry,
  })
  if (asset.kind === 'unavailable') return { kind: 'unavailable', phase: 'assets' }
  const declaration = entry.governance.declaration
  const configurable = declaration.permissions.some(permission => permission.settings !== null)
  const definition = declaration.settings[0]
  let sourceReady = false
  if (definition === undefined) {
    if (configurable || declaration.settings.length !== 0)
      return { kind: 'unavailable', phase: 'source' }
  } else {
    if (declaration.settings.length !== 1) return { kind: 'unavailable', phase: 'source' }
    const source = await installToolOrganizationSource({
      owner: input.organizationTargets,
      organizationId,
      definition,
    })
    if (source.kind === 'unavailable') return { kind: 'unavailable', phase: 'source' }
    sourceReady = source.kind === 'ready'
  }
  const command = {
    scope: input.scope,
    contributorId: TOOL_GOVERNANCE_OWNER,
    generation: input.epoch,
    declaration,
  }
  const result = await input.service.contribute(access(input.principal, input.principal.tenant), {
    ...command,
    operationId: canonicalDigest(command),
  })
  if (result.kind !== 'registered' || result.state !== 'active')
    return { kind: 'unavailable', phase: 'contribute' }
  return {
    kind: 'member',
    member: {
      contribution: result.contribution,
      definition: declaration.reference,
      selectedTargets: asset.kind === 'ready' && sourceReady ? [asset.target] : [],
    },
  }
}

export async function installToolGovernance(input: Options): Promise<ToolInstallationResult> {
  const organization = organizationCodec.encode(input.principal.tenant.organization)
  if (!organization.ok) return { kind: 'unavailable', phase: 'identity' }
  if ((await catalog(input)) === undefined) return { kind: 'unavailable', phase: 'catalog' }
  const members: GovernanceCollectionMember[] = []
  for (const entry of input.release.manifest.entries) {
    const result = await installEntry(input, entry, organization.value)
    if (result.kind !== 'member') return result
    members.push(result.member)
  }
  return adopt(input, members)
}
