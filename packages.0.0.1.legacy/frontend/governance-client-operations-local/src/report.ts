import { randomUUID } from 'node:crypto'
import type { LocalRecord } from '@omne-harness-lite/client-local-state'
import type { GovernanceOutcome } from '@omne-harness-lite/governance-center-entry-https-json'
import type {
  ActionIntent,
  ActionReport,
  AdmissionReason,
  Origin,
  DefectStage,
  PublicExchange,
} from '@omne-harness-lite/governance-client-operations'
import { AI15, AI16, AR8, READ_OPERATIONS } from './routes.ts'
import { freeze, object, validReport } from './validation.ts'

export type ReportFrame = { -readonly [K in keyof ActionReport]: ActionReport[K] }
export function origin(record: LocalRecord | null): Origin {
  return {
    centerId: record?.center.centerId ?? null,
    accountId: record?.login?.accountId ?? null,
    loginStateHandle: record?.login?.handle ?? null,
  }
}
export function reportFrame(action: ActionIntent | undefined): ReportFrame {
  const operation =
    action?.action === 'invoke'
      ? action.operation
      : action?.action === 'login'
        ? AI15
        : action?.action === 'register'
          ? AR8
          : action?.action === 'logout'
            ? AI16
            : null
  return {
    format: 'governance-client/1',
    actionId: randomUUID(),
    action: action?.action ?? 'invalid',
    operation,
    origin: origin(null),
    admission: { status: 'admitted' },
    remote: { status: 'not-attempted', stage: 'none', sendAttempted: false },
    local: { status: 'not-requested' },
    view: { source: 'none' },
    use: 'ended',
  }
}
export function block(frame: ReportFrame, reason: AdmissionReason): void {
  frame.admission = { status: 'blocked', reason }
}
export function defect(frame: ReportFrame, stage: DefectStage): void {
  frame.defect = { stage, code: 'internal-defect' }
  frame.view = { source: 'none' }
}
export function finish(frame: ReportFrame): ActionReport {
  if (!validReport(frame)) {
    // A presentation defect must not erase an already validated remote success
    // or an uncertain local commit. Retain facts only if the whole DTO validates.
    const safe = {
      ...frame,
      view: { source: 'none' as const },
      defect: { stage: 'output' as const, code: 'internal-defect' as const },
    }
    if (!validReport(safe))
      throw new Error('governance-client-operations: output projection defect')
    return freeze(safe)
  }
  return freeze(frame)
}
export function publicExchange(
  operation: string,
  reply: GovernanceOutcome & { kind: 'reply' },
): PublicExchange {
  if (operation === AI15 && 'result' in reply.reply) {
    const value = reply.reply.result
    if (!object(value) || typeof value['loginStateHandle'] !== 'string')
      throw new Error('invalid login result')
    return { operation, reply: { result: { loginStateHandle: value['loginStateHandle'] } } }
  }
  return { operation, reply: reply.reply }
}

export function observeOutcome(
  frame: ReportFrame,
  operation: string,
  outcome: GovernanceOutcome,
  stage: 'identity' | 'operation',
): void {
  const sendAttempted = stage === 'operation' && outcome.sendAttempted
  if (outcome.kind === 'reply') {
    const reply = publicExchange(operation, outcome)
    const status =
      'result' in reply.reply
        ? 'success'
        : operation === AR8 && reply.reply.failure === 'interrupted'
          ? 'unknown'
          : 'rejected'
    frame.remote = { status, stage, sendAttempted, reply }
  } else if (outcome.kind === 'entry-answer') {
    const status =
      outcome.answer === 'unavailable'
        ? stage === 'operation' && !READ_OPERATIONS.has(operation)
          ? 'unknown'
          : 'unavailable'
        : 'rejected'
    frame.remote = { status, stage, sendAttempted, answer: outcome.answer }
  } else {
    const status =
      stage === 'operation' && sendAttempted && !READ_OPERATIONS.has(operation)
        ? 'unknown'
        : 'unavailable'
    frame.remote = { status, stage, sendAttempted, transportFailure: outcome.reason }
  }
}
export function canUseCopy(frame: ReportFrame): boolean {
  return (
    frame.remote.status === 'unavailable' &&
    frame.remote.transportFailure !== 'trust' &&
    frame.remote.transportFailure !== 'cancelled'
  )
}
