import { randomUUID } from 'node:crypto'
import { assetsPublicationCommand } from '@omne-harness/assets-local'
import { canonicalText } from '@omne-harness/authorization'
import {
  GovernanceDefinitionIdentitySchema,
  type GovernanceContributionRef,
  type GovernanceDefinitionSource,
  type GovernanceScope,
} from '@omne-harness/governance-contract'
import type {
  GovernanceAdmissionGrant,
  GovernanceCollectionMember,
} from '@omne-harness/governance-local'
import { standingPrincipalRef, type ActingForTenantPrincipal } from '@omne-harness/identity'
import { access } from '@omne-harness/legal-identity'
import {
  SettingsProjectionBindingSchema,
  type createStandaloneSettingsOwner,
} from '@omne-harness/settings-local'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import { canonicalDigest } from '@omne-harness/tool'
import type { CategoryGateTemplate } from '../../entry/category-gates.ts'
import type { PermissionDeclaration } from '../../entry/permission-declarations.ts'
import {
  GOVERNED_PARTICIPANT,
  governedCategoryCapabilitiesSchema,
  type GovernedCategoryCapability,
} from './governed-capabilities.ts'
import type { GovernedCapture } from './governed-capture.ts'
import { readProjection, type ProjectionRead } from './projection-read.ts'
import {
  adoptMembers,
  type GovernanceService,
  type ToolInstallationResult,
} from './tool-installation.ts'
import { installOrganizationSource } from './tool-installation-source.ts'

export const MAX_SCOPE_LEASES = 128

type ContributeOwners = Extract<GovernanceAdmissionGrant, { action: 'contribute' }>['owners']

export type CategoryCapabilitiesOptions = Readonly<{
  templates: readonly CategoryGateTemplate[]
  scope: GovernanceScope
  domain: DomainRef
  storage: Pick<SqlStorage, 'read'>
  read: ProjectionRead | undefined
  capture: GovernedCapture
  principal: ActingForTenantPrincipal
  organizationId: string
  organizationTargets: ReturnType<typeof createStandaloneSettingsOwner>
  declare(declaration: PermissionDeclaration): () => void
  warn(message: string): void
}>

type Opened = Readonly<{
  epoch: string
  service: GovernanceService
  tools: readonly GovernanceCollectionMember[]
}>
type Leased = Readonly<{
  capability: GovernedCategoryCapability
  contribution: GovernanceContributionRef
}>
export type RefusedCapability = Readonly<{
  category: string
  name: string
  reason: 'lease-budget' | 'registration'
}>

const keyOf = (capability: GovernedCategoryCapability) =>
  canonicalText(capability.declaration.reference)

const whoOf = (options: CategoryCapabilitiesOptions) =>
  access(options.principal, options.principal.tenant)

// What the tenant holds now, as the storage participant derives it in one projection read.
async function heldBy(
  options: CategoryCapabilitiesOptions,
): Promise<readonly GovernedCategoryCapability[] | undefined> {
  if (options.read === undefined) return undefined
  const capture = SettingsProjectionBindingSchema.parse({
    domain: {
      scope: { kind: 'tenant', tenant: options.scope.tenantRef },
      transactionDomain: options.domain.transactionDomain,
    },
    principalRef: standingPrincipalRef(options.principal),
    captureId: randomUUID(),
    request: {
      deploymentRef: options.scope.deploymentId,
      mode: 'management',
      targets: [],
      selectionRef: null,
    },
  })
  const read = await readProjection(options.storage, options.domain, options.read, [
    assetsPublicationCommand(capture, options.capture()),
    { participant: GOVERNED_PARTICIPANT, facts: {} },
  ])
  if (read.kind !== 'completed') return undefined
  const parsed = governedCategoryCapabilitiesSchema.safeParse(read.response)
  return parsed.success ? parsed.data : undefined
}

// The enabled ones whose template is the one the assembly names for the category, in a fixed order.
function namedBy(
  templates: ReadonlyMap<string, CategoryGateTemplate>,
  all: readonly GovernedCategoryCapability[],
) {
  return all
    .filter(capability => {
      const template = templates.get(capability.template.category)
      return (
        capability.enabled &&
        template !== undefined &&
        canonicalText(template) === canonicalText(capability.template)
      )
    })
    .toSorted((left, right) =>
      left.declaration.reference.definitionId.localeCompare(
        right.declaration.reference.definitionId,
      ),
    )
}

// A registration after a withdrawal is a new operation, so `after` counts the withdrawals so far.
async function registered(
  options: CategoryCapabilitiesOptions,
  { epoch, service }: Opened,
  capability: GovernedCategoryCapability,
  after: number,
): Promise<Leased | undefined> {
  const [definition] = capability.declaration.settings
  if (definition === undefined) return undefined
  const source = await installOrganizationSource({
    owner: options.organizationTargets,
    organizationId: options.organizationId,
    definition,
    ownerRef: capability.template.ownerId,
  })
  if (source.kind !== 'ready') return undefined
  const command = {
    scope: options.scope,
    contributorId: capability.template.ownerId,
    generation: epoch,
    declaration: capability.declaration,
  }
  const result = await service.contribute(whoOf(options), {
    ...command,
    operationId: canonicalDigest({ command, after }),
  })
  return result.kind === 'registered' && result.state === 'active'
    ? { capability, contribution: result.contribution }
    : undefined
}

const refusal = (
  capability: GovernedCategoryCapability,
  reason: RefusedCapability['reason'],
): RefusedCapability => ({
  category: capability.publication.reference.category,
  name: capability.publication.reference.name,
  reason,
})

function definitionsOf(
  desired: () => readonly GovernedCategoryCapability[],
): GovernanceDefinitionSource {
  return {
    async resolve(identity) {
      const parsed = GovernanceDefinitionIdentitySchema.safeParse(identity)
      if (!parsed.success) return { kind: 'unavailable' }
      const found = desired().find(({ declaration: { reference } }) => {
        return (
          reference.ownerId === parsed.data.ownerId &&
          reference.definitionId === parsed.data.definitionId &&
          reference.version === parsed.data.version
        )
      })
      return found === undefined
        ? { kind: 'unavailable' }
        : { kind: 'definition', declaration: structuredClone(found.declaration) }
    },
  }
}

export function createCategoryCapabilities(options: CategoryCapabilitiesOptions) {
  const templates = new Map(options.templates.map(template => [template.category, template]))
  let desired: readonly GovernedCategoryCapability[] = []
  const leased = new Map<string, Leased>()
  const adopted = new Set<string>()
  const released = new Map<string, number>()
  let refused: readonly RefusedCapability[] = []
  let declared: (() => void)[] = []
  let opened: Opened | undefined
  let running: Promise<void> = Promise.resolve()
  let again = false
  let closed = false

  const register = (current: Opened, capability: GovernedCategoryCapability) =>
    registered(options, current, capability, released.get(keyOf(capability)) ?? 0)

  async function release({ service }: Opened, lease: Leased): Promise<boolean> {
    const command = { contribution: lease.contribution }
    const result = await service.withdraw(whoOf(options), {
      ...command,
      operationId: canonicalDigest({ withdraw: command }),
    })
    if (result.kind !== 'released' && result.kind !== 'already-released') return false
    const key = keyOf(lease.capability)
    released.set(key, (released.get(key) ?? 0) + 1)
    return true
  }

  function publish() {
    for (const withdraw of declared) withdraw()
    declared = [...leased].flatMap(([key, { capability }]) =>
      !adopted.has(key) || capability.target.kind !== 'asset'
        ? []
        : [
            options.declare({
              asset: {
                category: capability.publication.reference.category,
                name: capability.publication.reference.name,
              },
              definition: null,
              governance: {
                declaration: capability.declaration,
                interpretations: capability.interpretations,
              },
              holdingRef: capability.target.holdingRef,
              tenantRef: options.scope.tenantRef,
            }),
          ],
    )
  }

  function adoptLeased(current: Opened, wanted: ReadonlySet<string>) {
    const members = [...leased].map(
      ([key, { capability, contribution }]): GovernanceCollectionMember => ({
        contribution,
        definition: capability.declaration.reference,
        selectedTargets: wanted.has(key) ? [capability.target] : [],
      }),
    )
    return adoptMembers({ ...current, scope: options.scope, principal: options.principal }, [
      ...current.tools,
      ...members,
    ])
  }

  async function reconcile(current: Opened): Promise<ToolInstallationResult> {
    const read = await heldBy(options)
    if (read === undefined) {
      options.warn('the held capabilities of gated categories could not be read')
      return adoptLeased(current, new Set(desired.map(keyOf)))
    }
    const wanted = namedBy(templates, read)
    const budget = Math.max(0, MAX_SCOPE_LEASES - current.tools.length)
    const within = wanted.slice(0, budget)
    const over = wanted.slice(budget).map(capability => refusal(capability, 'lease-budget'))
    desired = within
    const keys = new Set(within.map(keyOf))
    for (const [key, lease] of leased) {
      if (keys.has(key)) continue
      adopted.delete(key)
      if (await release(current, lease)) leased.delete(key)
    }
    publish()
    for (const capability of within) {
      const key = keyOf(capability)
      if (leased.has(key)) continue
      const lease = await register(current, capability)
      if (lease === undefined) over.push(refusal(capability, 'registration'))
      else leased.set(key, lease)
    }
    refused = over
    const result = await adoptLeased(current, keys)
    if (result.kind === 'installed') {
      for (const key of leased.keys()) if (keys.has(key)) adopted.add(key)
      publish()
    }
    return result
  }

  function schedule() {
    if (opened === undefined || closed) return
    again = true
    running = running.then(async () => {
      if (!again || opened === undefined || closed) return
      again = false
      try {
        const result = await reconcile(opened)
        if (result.kind !== 'installed')
          options.warn(`gated capabilities were not adopted: ${result.phase}`)
      } catch {
        options.warn('the reconciliation of gated capabilities threw')
      }
    })
  }

  return {
    definitions: definitionsOf(() => desired),
    owners(): ContributeOwners {
      return options.templates.map(template => ({
        ownerId: template.ownerId,
        enforcementBindings: desired
          .filter(capability => capability.template.ownerId === template.ownerId)
          .flatMap(capability => capability.declaration.enforcementBindings),
      }))
    },
    refused: () => refused,
    async open(current: Opened): Promise<ToolInstallationResult> {
      opened = current
      const first = running.then(() => reconcile(current))
      running = first.then(
        () => undefined,
        () => undefined,
      )
      return first
    },
    changed: schedule,
    settled: () => running,
    close() {
      closed = true
      for (const withdraw of declared) withdraw()
      declared = []
    },
  }
}

export type CategoryCapabilities = ReturnType<typeof createCategoryCapabilities>
