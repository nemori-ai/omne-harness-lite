import { z } from 'zod'
import { SettingsRebaseSchema } from '@omne-harness/settings'
import { bindingSchema, guardFactSchema, type OperationBinding } from './schema.ts'
import type { SettingsProjectionBinding } from './projection.ts'
import { digest } from './encoding.ts'
export const RebaseBindingSchema = bindingSchema
  .omit({ command: true })
  .extend({ command: SettingsRebaseSchema })
export const RebaseGuardSchema = guardFactSchema
  .omit({ binding: true })
  .extend({ binding: RebaseBindingSchema })
export type RebaseBinding = z.infer<typeof RebaseBindingSchema>
export function rebaseDigest(command: z.infer<typeof SettingsRebaseSchema>): string {
  const { requestId: _requestId, ...semantic } = command
  return digest(semantic)
}
export function rebaseOperation(binding: RebaseBinding): OperationBinding {
  return {
    domain: binding.domain,
    principalRef: binding.principalRef,
    target: binding.command.target,
    operationId: binding.command.operationId,
    commandDigest: binding.commandDigest,
  }
}
export function projectionForRebase(binding: RebaseBinding): SettingsProjectionBinding {
  return {
    domain: binding.domain,
    principalRef: binding.principalRef,
    captureId: binding.command.operationId,
    request: {
      deploymentRef: 'settings-rebase',
      mode: 'management',
      targets: [binding.command.target],
      selectionRef: null,
    },
  }
}
