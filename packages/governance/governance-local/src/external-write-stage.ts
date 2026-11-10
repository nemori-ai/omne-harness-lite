import { z } from 'zod'
import type { CommitRequestV2 } from '@omne-harness/sql-contract'
import {
  businessRequestSchema,
  METADATA_PLANNER,
  MUTATION_PLANNER,
  ADOPTION_PLANNER,
  CAPTURE_PLANNER,
} from './activation-schema.ts'
import { PERMISSION_SNAPSHOT } from './permission-capture-schema.ts'
import type { OperationBinding, OperationRecord } from './operation-schema.ts'
import { GovernanceExternalWriteExecutionSchema } from './external-write-protocol.ts'
import { GOVERNANCE_OWNER } from './migration.ts'
import { digest, equal } from './encoding.ts'

export const EXTERNAL_WRITE_BASIS = 'governance.external-write-basis'
export const EXTERNAL_WRITE_TERMINAL = 'governance.external-write-terminal'
export const externalWriteExecutionSchema = GovernanceExternalWriteExecutionSchema
export type ExternalWriteExecution = z.infer<typeof externalWriteExecutionSchema>

const governanceParticipants = new Set([
  EXTERNAL_WRITE_BASIS,
  EXTERNAL_WRITE_TERMINAL,
  GOVERNANCE_OWNER,
  METADATA_PLANNER,
  MUTATION_PLANNER,
  ADOPTION_PLANNER,
  CAPTURE_PLANNER,
  PERMISSION_SNAPSHOT.participant,
])

function externalCommands(raw: unknown, requestDigest: string) {
  const authority = externalWriteExecutionSchema.parse(raw)
  const commands = new Map(authority.commands.map(command => [command.participant, command.facts]))
  if (
    authority.requestDigest !== requestDigest ||
    commands.size !== authority.commands.length ||
    !commands.has(authority.writer) ||
    authority.commands.some(command => governanceParticipants.has(command.participant))
  )
    throw new Error('External write execution binding mismatch')
  return commands
}

/** Preserves a trusted execution plan; it does not interpret or authorize the external command. */
export function validateExternalWriteStage(
  binding: OperationBinding,
  record: OperationRecord,
  envelope: CommitRequestV2,
) {
  const commands = new Map(envelope.commands.map(command => [command.participant, command.facts]))
  const request = businessRequestSchema.parse(commands.get(EXTERNAL_WRITE_BASIS)?.request)
  if (
    record.request.owner !== 'internal.external-write' ||
    !equal(request.binding, binding) ||
    !equal(request.execution, record.execution) ||
    request.execution.combinationVersion !== envelope.combinationVersion ||
    request.execution.manifestDigest !== envelope.manifestDigest
  )
    throw new Error('External write apply envelope mismatch')
  const expected = new Map<string, unknown>(
    externalCommands(request.execution.authority, binding.requestDigest),
  )
  expected.set(EXTERNAL_WRITE_BASIS, { request })
  expected.set(EXTERNAL_WRITE_TERMINAL, { request })
  expected.set(GOVERNANCE_OWNER, { requestDigest: digest(request) })
  if (commands.size !== expected.size)
    throw new Error('External write coordination commands mismatch')
  for (const [participant, facts] of expected)
    if (!equal(commands.get(participant), facts))
      throw new Error('External write owner or coordination command mismatch')
}
