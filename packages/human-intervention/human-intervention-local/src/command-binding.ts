import {
  HitlCommandSchemas,
  RecoveryCommandSchemas,
  type HitlMethod,
  type HitlCommands,
  type RecoveryMethod,
  type RecoveryWrites,
} from '@omne-harness/human-intervention'
import { digest } from './encoding.ts'

export function hitlCommandBinding<M extends HitlMethod>(method: M, input: HitlCommands[M]) {
  const command = HitlCommandSchemas[method].parse(input)
  return { operationRef: command.operation, inputDigest: digest({ method, command }) }
}
export function recoveryCommandBinding<M extends RecoveryMethod>(
  method: M,
  input: RecoveryWrites[M],
) {
  const command = RecoveryCommandSchemas[method].parse(input)
  const kind = method === 'bindReceiver' ? 'bind' : 'consume'
  return { operationRef: command.operation, inputDigest: digest({ kind, command }) }
}
