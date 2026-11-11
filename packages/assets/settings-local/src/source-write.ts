import { z } from 'zod'
import type { DomainRef, FactCommandV2 } from '@omne-harness/sql-contract'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { operationBindingSchema } from './schema.ts'
import type { StandaloneMutation } from './standalone-schema.ts'
import { digest, equal, json } from './encoding.ts'
import { SOURCE_RETENTION_OWNER, SOURCE_SNAPSHOT_PARTICIPANT } from './source-retention-schema.ts'

export const SOURCE_WRITE_FACT = {
  key: 'settings.source-write-open',
  protocol: 'settings-source-write/1',
}
export const sourceWriteBindingSchema = z.strictObject({
  kind: z.literal('target'),
  operation: operationBindingSchema,
})
export const sourceWriteObservationSchema = z.strictObject({
  kind: z.literal('write'),
  binding: sourceWriteBindingSchema,
})
const sourceWriteOpenSchema = z.strictObject({
  kind: z.literal('open'),
  binding: sourceWriteBindingSchema,
})
export type SourceWriteBinding = z.infer<typeof sourceWriteBindingSchema>
export function sourceWriteCommands(binding: SourceWriteBinding): FactCommandV2[] {
  const facts = { kind: 'write', binding: json(binding) }
  return [
    { participant: SOURCE_SNAPSHOT_PARTICIPANT, facts },
    { participant: SOURCE_RETENTION_OWNER, facts },
  ]
}
export function sourceTargetWriteBinding(
  domain: DomainRef,
  command: StandaloneMutation,
): SourceWriteBinding {
  return {
    kind: 'target',
    operation: {
      domain,
      principalRef: 'capability/settings.targets',
      target: command.kind === 'provision' ? command.record.target : command.target,
      operationId: command.operationId,
      commandDigest: digest(command),
    },
  }
}
export function sourceWriteIsOpen(port: ParticipantPort, binding: SourceWriteBinding) {
  const fact = sourceWriteOpenSchema.safeParse(port.requireFact(SOURCE_WRITE_FACT))
  return fact.success && equal(fact.data.binding, binding)
}
