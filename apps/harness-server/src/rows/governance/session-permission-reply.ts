import type { GovernanceExternalWriteOutcome } from '@omne-harness/governance-local'
import { canonicalText } from '@omne-harness/authorization'
import { tenantCodec } from '@omne-harness/legal-identity'
import { commandDigest, type SessionCommand } from '@omne-harness/session-contract'
import {
  decodeSessionReply,
  SESSION_PARTICIPANT,
  type SessionParticipation,
} from '@omne-harness/session-storage-sql/participants'
import type { QueryResultV2, ReceiptV2 } from '@omne-harness/sql-contract'

type Terminal = Extract<GovernanceExternalWriteOutcome, { kind: 'terminal' }>
const failed = (diagnostic: string): SessionParticipation => ({ kind: 'failed', diagnostic })

function sameOriginal(terminal: Terminal, receipt: ReceiptV2, command: SessionCommand): boolean {
  const tenant = tenantCodec.encode(command.input.tenant)
  return (
    tenant.ok &&
    terminal.binding.ref.scope.tenantRef === tenant.value &&
    terminal.binding.ref.operationId === command.input.operation &&
    terminal.sqlIdentity.scope.kind === 'tenant' &&
    terminal.sqlIdentity.scope.tenant === tenant.value &&
    canonicalText(receipt.identity) === canonicalText(terminal.sqlIdentity)
  )
}

function originalReply(receipt: ReceiptV2, command: SessionCommand): SessionParticipation {
  if (receipt.kind === 'rolled_back') {
    const stop = receipt.responses.at(-1)
    if (stop?.participant !== SESSION_PARTICIPANT || stop.reply.kind === 'participated')
      return failed('The protected transaction stopped outside Session')
    return decodeSessionReply(stop.reply)
  }
  const response = receipt.responses.find(item => item.participant === SESSION_PARTICIPANT)
  if (response === undefined) return failed('The original transaction has no Session response')
  const reply = decodeSessionReply(response.reply)
  if (reply.kind !== 'participated' || reply.digest !== commandDigest(command))
    return failed('The original Session response does not match the command')
  return reply
}

export function sessionPermissionReply(
  terminal: Terminal,
  receipt: QueryResultV2,
  command: SessionCommand,
): SessionParticipation {
  if (receipt.kind !== 'committed' && receipt.kind !== 'rolled_back')
    return failed('The original Session transaction receipt is unavailable')
  if (!sameOriginal(terminal, receipt, command))
    return failed('The original Session transaction identity does not match')
  if ((terminal.outcome === 'committed') !== (receipt.kind === 'committed'))
    return failed('Governance and the original Session transaction disagree')
  try {
    return originalReply(receipt, command)
  } catch {
    return failed('The original Session response cannot be decoded')
  }
}
