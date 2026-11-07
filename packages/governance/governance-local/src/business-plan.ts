import type { OperationRef } from './operation-schema.ts'
import type { ReadPort } from '@omne-harness/sql-contract/worker'
import { boundOperation } from './operation.ts'
import { businessRequestSchema } from './activation-schema.ts'

const modes = {
  contribute: 'mutation',
  withdraw: 'mutation',
  adopt: 'adoption',
  'internal.capture': 'capture',
} as const
export const businessMode = (owner: OperationRef['owner']) => modes[owner]

export function businessOriginal(
  port: ReadPort,
  raw: unknown,
  mode: 'mutation' | 'adoption' | 'capture',
) {
  const request = businessRequestSchema.parse(raw)
  if (businessMode(request.binding.ref.owner) !== mode)
    throw new Error('Governance request requires another planner')
  const original = boundOperation(port, request.binding)
  if (
    original.kind !== 'found' ||
    original.record.state === 'committed' ||
    original.record.state === 'aborted'
  )
    return { kind: 'observation' as const, request }
  return {
    kind: 'pending' as const,
    request,
    epoch: original.record.epoch,
    transactionDomain: original.record.sqlIdentity.transactionDomain,
  }
}
