import { z } from 'zod'
import { canonicalText } from '@omne-harness/authorization'
import { canonicalDigest } from '@omne-harness/tool'
import { tenantCodec, organizationCodec } from '@omne-harness/legal-identity'
import {
  SettingsTargetSchema,
  type SettingsBasis,
  type SettingsReadPort,
} from '@omne-harness/settings'
import { SettingsSourceReferenceSchema } from '@omne-harness/settings-local/preparation'
import type { GovernanceDefinitionBundle, GovernanceScope } from '@omne-harness/governance-contract'
import { projectPermissionSettings, type PermissionDefinition } from '@omne-harness/permissions'

export const sessionPermissionMappedSourceSchema = z.strictObject({
  kind: z.literal('mapped'),
  target: SettingsTargetSchema,
  source: SettingsSourceReferenceSchema,
})
export type SessionPermissionMappedSource = z.infer<typeof sessionPermissionMappedSourceSchema>
export type SessionPermissionSettingsReader = (
  request: Parameters<SettingsReadPort<unknown>['read']>[1],
) => ReturnType<SettingsReadPort<unknown>['read']>
export type SessionPermissionSettingsInput = Readonly<{
  scope: GovernanceScope
  declaration: GovernanceDefinitionBundle
  permission: PermissionDefinition
}>
export type SessionPermissionSettingsResolver = (
  input: SessionPermissionSettingsInput,
) => Promise<SessionPermissionMappedSource | undefined>
function mappedDefinition(input: SessionPermissionSettingsInput) {
  const projected = projectPermissionSettings(input.permission)
  if (projected.kind !== 'projected') return undefined
  const expected = projected.definition
  const candidates = input.declaration.settings.filter(
    value =>
      value.providerId === expected.providerId &&
      value.definitionId === expected.definitionId &&
      value.version === expected.version,
  )
  if (candidates.length !== 1) return undefined
  const definition = candidates[0]!
  const complete =
    expected.items.every(
      item =>
        canonicalText(definition.items.find(value => value.id === item.id)) === canonicalText(item),
    ) &&
    expected.groups.every(
      group =>
        canonicalText(definition.groups.find(value => value.id === group.id)) ===
        canonicalText(group),
    )
  return complete ? definition : undefined
}

function uniqueMappedTarget(
  basis: SettingsBasis,
  definition: GovernanceDefinitionBundle['settings'][number],
  tenantRef: string,
) {
  const expected = {
    providerId: definition.providerId,
    definitionId: definition.definitionId,
    version: definition.version,
    digest: canonicalDigest(definition).slice(7),
  }
  const candidates = basis.views.filter(
    view =>
      view.target.scopeRef === tenantRef &&
      canonicalText(view.definitionRef) === canonicalText(expected) &&
      canonicalText(view.definition) === canonicalText(definition),
  )
  return candidates.length === 1 ? candidates[0]?.target : undefined
}

export function createSessionPermissionSettingsResolver(options: {
  read: SessionPermissionSettingsReader
  organizationSource(input: {
    organizationId: string
    definition: GovernanceDefinitionBundle['settings'][number]
    target: SessionPermissionMappedSource['target']
  }): Promise<z.infer<typeof SettingsSourceReferenceSchema> | undefined>
}): SessionPermissionSettingsResolver {
  return async raw => {
    const input = structuredClone(raw)
    const definition = mappedDefinition(input)
    const tenant = tenantCodec.parse(input.scope.tenantRef)
    if (definition === undefined || !tenant.ok) return undefined
    const organization = organizationCodec.encode(tenant.value.organization)
    if (!organization.ok) return undefined
    try {
      const basis = await options.read({
        deploymentRef: input.scope.deploymentId,
        mode: 'management',
        targets: [],
        selectionRef: null,
      })
      if ('kind' in basis || basis.completeness !== 'complete') return undefined
      const selected = uniqueMappedTarget(basis, definition, input.scope.tenantRef)
      if (selected === undefined) return undefined
      const target = structuredClone(selected)
      const source = await options.organizationSource({
        organizationId: organization.value,
        definition,
        target,
      })
      if (source === undefined) return undefined
      return sessionPermissionMappedSourceSchema.parse({ kind: 'mapped', target, source })
    } catch {
      return undefined
    }
  }
}
