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
import { toolAssetPublication } from './tool-assets.ts'
import { installToolAsset } from './tool-installation-assets.ts'
import { installToolOrganizationSource } from './tool-installation-source.ts'
import {
  reconcileToolSettings,
  type GovernedToolSettings,
  type ReleaseSettingsMaintenance,
} from './tool-settings-rebase.ts'

type TrustedRelease = Extract<ToolRelease, { kind: 'trusted' }>
export type GovernanceService = GovernanceContributions<
  ActingForTenantPrincipal,
  ActingForTenantPrincipal,
  ActingForTenantPrincipal
>
type Options = Readonly<{
  principal: ActingForTenantPrincipal
  scope: GovernanceScope
  epoch: string
  release: TrustedRelease
  concurrency: number
  service: GovernanceService
  assets: AssetsLocal
  organizationTargets: ReturnType<typeof createStandaloneSettingsOwner>
  releaseSettings: ReleaseSettingsMaintenance
  warn(message: string): void
  /** Adopts the whole collection of the scope; absent, the release tools are the whole collection. */
  adoptCollection?(tools: readonly GovernanceCollectionMember[]): Promise<ToolInstallationResult>
}>
export type ToolInstallationResult =
  | Readonly<{ kind: 'installed' }>
  | Readonly<{
      kind: 'unavailable'
      phase: 'identity' | 'catalog' | 'assets' | 'source' | 'contribute' | 'adopt'
    }>

export function toolInstallationGrants(
  input: Pick<Options, 'principal' | 'scope' | 'release'> & {
    owners?: Extract<GovernanceAdmissionGrant, { action: 'contribute' }>['owners']
  },
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
        ...(input.owners ?? []),
      ],
    },
    { ...grant, action: 'adopt' },
    { ...grant, action: 'withdraw' },
    { ...grant, action: 'catalog-management' },
  ]
}

type Adopting = Pick<Options, 'principal' | 'scope' | 'epoch' | 'service'>

async function catalog(input: Adopting) {
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

export async function adoptMembers(
  input: Adopting,
  members: readonly GovernanceCollectionMember[],
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
      complete: [...members],
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
  | {
      kind: 'member'
      member: GovernanceCollectionMember
      settings: GovernedToolSettings | undefined
    }
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
    settings:
      definition === undefined || asset.kind === 'inactive'
        ? undefined
        : {
            name: entry.asset.name,
            assetRef: toolAssetPublication(entry).assetRef,
            target: asset.target,
          },
  }
}

async function settleAll<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const settled: PromiseSettledResult<R>[] = []
  const pending = items.entries()
  async function worker() {
    for (const [index, item] of pending) {
      const [result] = await Promise.allSettled([run(item)])
      settled[index] = result
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  const rejected = settled.find(result => result.status === 'rejected')
  if (rejected !== undefined) throw rejected.reason
  return settled.flatMap(result => (result.status === 'fulfilled' ? [result.value] : []))
}

export async function installToolGovernance(input: Options): Promise<ToolInstallationResult> {
  const organization = organizationCodec.encode(input.principal.tenant.organization)
  if (!organization.ok) return { kind: 'unavailable', phase: 'identity' }
  const installed = await settleAll(input.release.manifest.entries, input.concurrency, entry =>
    installEntry(input, entry, organization.value),
  )
  const members: GovernanceCollectionMember[] = []
  const governed: GovernedToolSettings[] = []
  for (const result of installed) {
    if (result.kind !== 'member') return result
    members.push(result.member)
    if (result.settings !== undefined) governed.push(result.settings)
  }
  const reconciliation = { ...input, tenantRef: input.scope.tenantRef }
  await settleAll(governed, input.concurrency, tool => reconcileToolSettings(reconciliation, tool))
  return (input.adoptCollection ?? (tools => adoptMembers(input, tools)))(members)
}
