import { canonicalText, effectiveArgumentsOf } from '@omne-harness/authorization'
import { organizationCodec, tenantCodec } from '@omne-harness/legal-identity'
import {
  PermissionBasisRequestSchema,
  type PermissionBasisRequest,
} from '@omne-harness/permissions'
import type { GovernanceScope } from '@omne-harness/governance-contract'
import type { ToolRelease } from '../../entry/tool-release.ts'
import {
  releasedToolPermission,
  type ToolPermissionAction,
} from '../authorization/current-tool-permission.ts'
import { toolAssetTarget } from './tool-installation-assets.ts'
import { sessionWorkOf } from '../tool-runtime/session-work.ts'
import { organizationSettingsSource } from './organization-settings.ts'
import {
  mappedDefinition,
  type SessionPermissionMappedSource,
} from './session-permission-settings.ts'

export type PermissionReadMapping = Readonly<{
  permission: PermissionBasisRequest
  target: SessionPermissionMappedSource['target']
  source: SessionPermissionMappedSource['source'] | null
}>
export type PermissionReadMappingOptions = Readonly<{
  scope: GovernanceScope
  release(): ToolRelease
}>

export function createPermissionReadMapping(options: PermissionReadMappingOptions) {
  const scope = structuredClone(options.scope)
  return async (input: ToolPermissionAction): Promise<PermissionReadMapping | undefined> => {
    try {
      const who = sessionWorkOf(input.principal, input.tenant)
      const tenant = tenantCodec.encode(input.tenant)
      const organization = organizationCodec.encode(input.tenant.organization)
      if (who === undefined || !tenant.ok || !organization.ok || tenant.value !== scope.tenantRef)
        return undefined
      const available = releasedToolPermission(options.release(), input)
      if (available === undefined) return undefined
      const released = structuredClone(available)
      const operation = { ...input.operation }
      const argumentsDigest = effectiveArgumentsOf(input.effectiveArguments).digest
      const target = toolAssetTarget(released.entry, tenant.value)
      let source: PermissionReadMapping['source'] = null
      if (released.interpretation.definition.settings !== null) {
        const settings = mappedDefinition({
          declaration: released.entry.governance.declaration,
          permission: released.interpretation.definition,
        })
        if (settings === undefined) return undefined
        source = organizationSettingsSource({
          organizationId: organization.value,
          definition: settings,
        })
      }
      const mapped = { target, source }
      const { binding, definition } = released.interpretation
      return {
        permission: PermissionBasisRequestSchema.parse({
          scope: {
            tenantId: tenant.value,
            organizationId: organization.value,
            sessionId: who.session,
            targetId: canonicalText(mapped.target),
            deploymentId: scope.deploymentId,
            logicalServiceId: scope.logicalServiceId,
          },
          operation,
          argumentsDigest,
          definition: definition.reference,
          implementationRef: binding.implementationRef,
          capabilityId: binding.capabilityId,
          enforcementKey: binding.enforcementKey,
        }),
        target: structuredClone(mapped.target),
        source: structuredClone(mapped.source),
      }
    } catch {
      return undefined
    }
  }
}
