import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { bindingSchema, type OperationBinding } from './operation-schema.ts'
import { boundOperation, sealOperation, conflict } from './operation.ts'
import { readScope } from './scope.ts'
import { releaseContribution } from './contribution.ts'
import { digest } from './encoding.ts'

export function retireContribution(port: ParticipantPort, raw: OperationBinding) {
  const binding = bindingSchema.parse(raw)
  const original = boundOperation(port, binding)
  if (original.kind !== 'found') return original
  if (original.record.request.owner !== 'contribute') return conflict()
  const found = sealOperation(port, binding)
  if (found.kind !== 'found') return found
  const retired = { kind: 'retired' as const, binding, epoch: found.record.epoch }
  if (found.record.state === 'aborted') return retired
  const current = readScope(port, binding.ref.scope)
  if (!current) throw new Error('Missing contribution scope')
  if (current.epoch !== found.record.epoch || current.state !== 'open') return retired
  const command = original.record.request.command
  const result = releaseContribution(port, binding, found.record.epoch, {
    operationId: binding.ref.operationId,
    contribution: {
      scope: command.scope,
      contributorId: command.contributorId,
      generation: command.generation,
      registrationId: 'lease/' + digest(binding.ref),
    },
  })
  return result.kind === 'released' || result.kind === 'already-released' ? retired : result
}
