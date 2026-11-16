import { canonicalText } from '@omne-harness/authorization'
import type { GovernanceScope } from '@omne-harness/governance-contract'
import { organizationCodec, tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  evaluatePermission,
  judgePermissionAssignment,
  readPermissionSettingsSource,
  type PermissionDefinition,
  type PermissionEvaluation,
  type PermissionRule,
  type PermissionScope,
  type PermissionSource,
} from '@omne-harness/permissions'
import type {
  PermissionItemView,
  SettingsTargetView,
  TenantSettingsPermissions,
} from '@omne-harness/settings'
import { readSettingsSource } from '@omne-harness/settings-local'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { canonicalDigest } from '@omne-harness/tool'
import type { ToolRelease } from '../../entry/tool-release.ts'
import type { ToolReleaseEntry } from '../../entry/tool-release-manifest.ts'
import { organizationPermissionSource } from './organization-permission-source.ts'
import { organizationSettingsSource } from './organization-settings.ts'
import { mappedDefinition } from './session-permission-settings.ts'
import { toolAssetTarget } from './tool-installation-assets.ts'

export const TOOL_PERMISSION_APPLIES_AT = '对之后的每一次工具调用生效，已经启动的不受影响'

type Mapped = Readonly<{ entry: ToolReleaseEntry; permission: PermissionDefinition }>

export type TenantSettingsPermissionOptions = Readonly<{
  scope: Pick<GovernanceScope, 'deploymentId' | 'logicalServiceId'>
  storage: Pick<SqlStorage, 'read'>
  release(): ToolRelease | undefined
}>

function ownRule(view: SettingsTargetView, itemId: string): PermissionRule | null {
  const sources = view.sources.filter(source => source.scope.kind === 'tenant')
  if (sources.length !== 1) return null
  const assignment = view.state.sources
    .find(source => source.id === sources[0]!.sourceId)
    ?.values.find(value => value.itemId === itemId)
  if (assignment?.value.kind !== 'value') return null
  const value = assignment.value.value
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const pick = Reflect.get(value, 'pick')
  const allowedSet = Reflect.get(value, 'allowedSet')
  return {
    pick: typeof pick === 'string' ? pick : null,
    allowedSet:
      Array.isArray(allowedSet) && allowedSet.every(item => typeof item === 'string')
        ? allowedSet
        : null,
  }
}

export function createTenantSettingsPermissions(
  options: TenantSettingsPermissionOptions,
): TenantSettingsPermissions {
  function mapped(view: SettingsTargetView, itemId: string): Mapped | undefined {
    const release = options.release()
    if (release?.kind !== 'trusted') return undefined
    const entries = release.manifest.entries.filter(
      entry =>
        canonicalText(toolAssetTarget(entry, view.target.scopeRef)) === canonicalText(view.target),
    )
    const entry = entries.length === 1 ? entries[0] : undefined
    if (entry === undefined) return undefined
    const permissions = entry.governance.declaration.permissions.filter(
      permission =>
        permission.settings !== null &&
        permission.settings.itemId === itemId &&
        permission.settings.providerId === view.definitionRef.providerId &&
        permission.settings.definitionId === view.definitionRef.definitionId &&
        permission.settings.version === view.definitionRef.version,
    )
    return permissions.length === 1 ? { entry, permission: permissions[0]! } : undefined
  }

  function scopeOf(tenant: TenantId, view: SettingsTargetView): PermissionScope | undefined {
    const tenantRef = tenantCodec.encode(tenant)
    const organization = organizationCodec.encode(tenant.organization)
    if (!tenantRef.ok || !organization.ok || tenantRef.value !== view.target.scopeRef)
      return undefined
    return {
      tenantId: tenantRef.value,
      targetId: canonicalText(view.target),
      organizationId: organization.value,
      sessionId: null,
      deploymentId: options.scope.deploymentId,
      logicalServiceId: options.scope.logicalServiceId,
    }
  }

  function tenantSource(
    view: SettingsTargetView,
    definition: PermissionDefinition,
    scope: PermissionScope,
  ): PermissionSource {
    const descriptors = view.sources.filter(
      source => source.scope.kind === 'tenant' && source.scope.subjectRef === scope.tenantId,
    )
    const descriptor = descriptors.length === 1 ? descriptors[0]! : undefined
    const source =
      descriptor === undefined
        ? undefined
        : view.state.sources.find(value => value.id === descriptor.sourceId)
    if (descriptor === undefined || source === undefined)
      return { kind: 'unavailable', sourceRef: 'settings.tenant' }
    const result = readPermissionSettingsSource({
      definition,
      scope,
      layer: 'tenant',
      sourceRef: canonicalDigest({ target: view.target, descriptor }),
      revision: canonicalDigest({
        definition: view.definitionRef,
        state: view.state.revision,
        descriptor,
      }),
      observation: { kind: 'available', definition: view.definition, descriptor, source },
    })
    return result.kind === 'invalid-input'
      ? { kind: 'unavailable', sourceRef: 'settings.tenant' }
      : result
  }

  async function material(
    tenant: TenantId,
    view: SettingsTargetView,
    found: Mapped,
  ): Promise<PermissionEvaluation | undefined> {
    const scope = scopeOf(tenant, view)
    const settings = mappedDefinition({
      declaration: found.entry.governance.declaration,
      permission: found.permission,
    })
    if (scope === undefined || settings === undefined || scope.organizationId === null)
      return undefined
    let organization: PermissionSource
    try {
      organization = organizationPermissionSource(
        await readSettingsSource(
          options.storage,
          organizationSettingsSource({
            organizationId: scope.organizationId,
            definition: settings,
          }),
        ),
        found.permission,
        scope,
      )
    } catch {
      organization = { kind: 'unavailable', sourceRef: 'settings.organization' }
    }
    return {
      scope,
      definition: found.permission.reference,
      capabilityId: found.permission.capabilityId,
      enforcementKey: found.permission.enforcementKey,
      declaration: { kind: 'available', definition: found.permission },
      sources: {
        organization,
        tenant: tenantSource(view, found.permission, scope),
        session: { kind: 'absent', revision: 'management-view' },
      },
      requiredConstraintIds: [],
      constraints: [],
      adoptionRevision: 'management-view',
      targetRevision: canonicalDigest({
        definition: view.definitionRef,
        state: view.state.revision,
      }),
    }
  }

  function layerOf(
    evaluation: PermissionEvaluation,
    value: string,
    selection: 'pick' | 'nearest',
  ): 'default' | 'organization' | 'tenant' {
    const rules = {
      default: found(evaluation)?.defaultRule,
      organization: ruleOf(evaluation.sources.organization),
      tenant: ruleOf(evaluation.sources.tenant),
    }
    const order = ['tenant', 'organization', 'default'] as const
    if (selection === 'pick') return order.find(layer => rules[layer]?.pick === value) ?? 'default'
    return order.find(layer => rules[layer]?.allowedSet != null) ?? 'default'
  }

  return {
    kindOf: ({ view, itemId }) => (mapped(view, itemId) === undefined ? 'ordinary' : 'permission'),

    async view({ tenant, view, itemId }) {
      const found = mapped(view, itemId)
      if (found === undefined) return 'unavailable'
      const evaluation = await material(tenant, view, found)
      if (evaluation === undefined) return 'unavailable'
      const result = evaluatePermission(evaluation)
      if (result.kind === 'unavailable' || result.kind === 'invalid-input') return 'unavailable'
      const definition = found.permission
      const locked = [definition.defaultRule, ...rulesOf(evaluation)].some(
        rule => rule.allowedSet !== null,
      )
      const bound = locked ? result.allowedSet : null
      const organization = ruleOf(evaluation.sources.organization)
      const prohibitedAbove =
        organization?.pick !== null &&
        organization?.pick !== undefined &&
        definition.values.some(value => value.id === organization.pick && !value.permitsOperation)
      const effective: PermissionItemView['effective'] =
        result.kind === 'effective'
          ? {
              kind: 'value',
              value: result.value,
              source: layerOf(evaluation, result.value, result.selection),
            }
          : result.reason === 'empty-bound'
            ? { kind: 'empty-bound' }
            : { kind: 'prohibited', by: prohibitedAbove ? 'organization' : 'tenant' }
      return {
        appliesAt: TOOL_PERMISSION_APPLIES_AT,
        choices: definition.values.map(value => ({
          value: value.id,
          label: value.title,
          description: value.description,
          permitsOperation: value.permitsOperation,
        })),
        default: definition.defaultRule.pick ?? definition.values[0]!.id,
        own: ownRule(view, itemId)?.pick ?? null,
        effective,
        bound: bound === null || bound === undefined ? null : [...bound],
        editable: prohibitedAbove ? { kind: 'no', reason: 'prohibited-above' } : { kind: 'yes' },
      }
    },

    compose({ view, itemId, pick }) {
      const found = mapped(view, itemId)
      if (found === undefined || !found.permission.values.some(value => value.id === pick))
        return { kind: 'invalid' }
      return {
        kind: 'value',
        value: { pick, allowedSet: ownRule(view, itemId)?.allowedSet ?? null },
      }
    },

    cleared({ view, itemId }) {
      const allowedSet = ownRule(view, itemId)?.allowedSet ?? null
      return allowedSet === null
        ? { kind: 'clear' }
        : { kind: 'value', value: { pick: null, allowedSet } }
    },

    async judge({ tenant, view, itemId, pick }) {
      const found = mapped(view, itemId)
      const evaluation = found === undefined ? undefined : await material(tenant, view, found)
      if (evaluation === undefined) return 'unavailable'
      const judged = judgePermissionAssignment({
        layer: 'tenant',
        rule: { pick, allowedSet: null },
        current: evaluation,
      })
      return judged.kind === 'valid'
        ? 'within'
        : judged.kind === 'denied'
          ? 'out-of-bound'
          : 'unavailable'
    },
  }
}

function found(evaluation: PermissionEvaluation) {
  return evaluation.declaration.kind === 'available' ? evaluation.declaration.definition : undefined
}
function ruleOf(source: PermissionSource): PermissionRule | undefined {
  return source.kind === 'available' ? source.rule : undefined
}
function rulesOf(evaluation: PermissionEvaluation): PermissionRule[] {
  return [evaluation.sources.organization, evaluation.sources.tenant, evaluation.sources.session]
    .map(ruleOf)
    .filter(rule => rule !== undefined)
}
