import { randomUUID } from 'node:crypto'
import type {
  ActionReport,
  ActionPreview,
  AdmissionReason,
} from '@omne-harness-lite/governance-client-operations'
import type { Command } from './parser.ts'
export function json(value: unknown): string {
  return JSON.stringify(value).replace(
    /[\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,
    c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  )
}
export function previewText(preview: ActionPreview): string {
  return `Operation preview: ${json(preview)}\n${preview.intent.action === 'invoke' && preview.intent.operation === 'capability.account-identity/v3#S-50' ? 'Changing the credential invalidates all existing logins.\n' : ''}`
}
export function reportText(report: ActionReport, machine: boolean): string {
  return `${machine ? '' : 'Governance result: '}${json(report)}\n`
}
export function unopened(
  command: Command | undefined,
  reason: AdmissionReason,
  defect = false,
): ActionReport {
  const operation =
    command?.operation ??
    (command?.action === 'register'
      ? 'composition.account-registration/v2#S-8'
      : command?.action === 'login'
        ? 'capability.account-identity/v3#S-15'
        : command?.action === 'logout'
          ? 'capability.account-identity/v3#S-16'
          : null)
  return {
    format: 'governance-client/1',
    actionId: randomUUID(),
    action: command?.action ?? 'invalid',
    operation,
    origin: { centerId: null, accountId: null, loginStateHandle: null },
    admission: { status: 'blocked', reason },
    remote: { status: 'not-attempted', stage: 'none', sendAttempted: false },
    local: { status: 'not-requested' },
    view: { source: 'none' },
    use: 'ended',
    ...(defect ? { defect: { stage: 'input', code: 'internal-defect' } } : {}),
  }
}
