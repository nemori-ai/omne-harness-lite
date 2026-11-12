import type { z } from 'zod'
import { decideScheduleManagement, type ManagementCommit } from '@omne-harness/schedule'
import type { FactCommandV2, StorageScope } from '@omne-harness/sql-contract'
import { commandDigest } from './encoding.ts'
import {
  guardRequirementSchema,
  bindingSchema,
  guardFactSchema,
  rejectionSchema,
} from './schema.ts'

export type ScheduleManagementGuardBinding = z.infer<typeof bindingSchema>
export type ScheduleManagementGuardRequirement = z.infer<typeof guardRequirementSchema>
export type ScheduleManagementGuardFact = z.infer<typeof guardFactSchema>
export type ScheduleManagementGuardRejection = z.infer<typeof rejectionSchema>
export type ScheduleManagementSqlGuards = Readonly<{
  participant: string
  command(requirement: ScheduleManagementGuardRequirement): FactCommandV2
}>
export function scheduleManagementGuardBinding(
  scope: StorageScope,
  command: ManagementCommit,
): ScheduleManagementGuardBinding {
  return bindingSchema.parse({
    scope,
    operation: command.input.operation,
    commandDigest: commandDigest(command),
    command,
  })
}
export function scheduleManagementGuardRequirement(
  scope: StorageScope,
  command: ManagementCommit,
): ScheduleManagementGuardRequirement {
  const decision = decideScheduleManagement(command.input)
  if (decision.kind === 'rejected')
    throw new Error('A guard requirement needs a prepared management decision')
  return guardRequirementSchema.parse({
    binding: scheduleManagementGuardBinding(scope, command),
    quotaEffect: decision.quota,
    resultingHolding: command.input.quotaObservation.resultingHolding,
  })
}
export {
  guardRequirementSchema as ScheduleManagementGuardRequirementSchema,
  guardFactSchema as ScheduleManagementGuardFactSchema,
  rejectionSchema as ScheduleManagementGuardRejectionSchema,
}
