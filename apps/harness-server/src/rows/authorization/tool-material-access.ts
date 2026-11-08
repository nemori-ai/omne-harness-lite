import { noArguments, type SystemActionAuthorization } from '@omne-harness/authorization'
import { tenantCodec, type Access } from '@omne-harness/legal-identity'
import type { AccessVerdict, ToolAccessGuard } from '@omne-harness/tool'
import { decodeToolCallId, type ToolCallId } from '@omne-harness/tool-contract'
import { classify } from './principals.ts'

export type ToolMaterialMaintenanceAccess = ToolAccessGuard<unknown> &
  Readonly<{
    qualifyScan(input: Access<unknown>): Promise<AccessVerdict>
  }>

export function createToolMaterialMaintenanceAccess(
  readAuthorization: () => SystemActionAuthorization | undefined,
): ToolMaterialMaintenanceAccess {
  const check = async (input: Access<unknown>, call: ToolCallId | null): Promise<AccessVerdict> => {
    try {
      const who = classify(input.principal)
      const tenant = tenantCodec.encode(input.tenant)
      if (who?.column !== 'system' || !tenant.ok)
        return { kind: 'denied', reason: 'system-principal-and-tenant-required' }
      const authorization = readAuthorization()
      if (authorization === undefined)
        return {
          kind: 'unavailable',
          diagnostic: 'material maintenance authorization is unavailable',
        }
      const answer = await authorization.check({
        principal: who.principal,
        scope: 'system',
        operation: { owner: 'tool', name: call === null ? 'scan-materials' : 'maintain-materials' },
        target: {
          kind: 'tenant',
          tenant: input.tenant,
          resource: {
            owner: 'tool',
            kind: call === null ? 'tenant' : 'call',
            key: call ?? tenant.value,
          },
        },
        arguments: noArguments(),
      })
      switch (answer.kind) {
        case 'allowed':
          return { kind: 'allowed' }
        case 'denied':
          return { kind: 'denied', reason: answer.reason }
        default:
          return {
            kind: 'unavailable',
            diagnostic: 'material maintenance authorization is unavailable',
          }
      }
    } catch {
      return { kind: 'unavailable', diagnostic: 'material maintenance authorization failed' }
    }
  }
  return Object.freeze({
    async qualify(
      input: Parameters<ToolAccessGuard<unknown>['qualify']>[0],
    ): Promise<AccessVerdict> {
      if (input.action !== 'maintain-materials')
        return { kind: 'denied', reason: 'material-maintenance-only' }
      const call = decodeToolCallId(input.call)
      if ('failure' in call) return { kind: 'denied', reason: 'valid-call-required' }
      return check(input, call.ok)
    },
    qualifyScan: (input: Access<unknown>) => check(input, null),
  })
}
