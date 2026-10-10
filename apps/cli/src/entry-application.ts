import type { ActionReport } from '@omne-harness-lite/governance-client-operations'
import { exitStatus } from '@omne-harness-lite/governance-client-operations'
import type { AddCenterOutcome } from './center-add.ts'
import type { TenantCreateEntryOutcome } from './tenant-create-entry.ts'
import type { LoginEntryOutcome } from './login-entry.ts'
import type { TenantMembershipOutcome } from './tenant-membership-command.ts'
import type { Diagnostic } from './diagnostic.ts'
import { InputFailure } from './diagnostic.ts'
import {
  EntryUsageFailure,
  parseEntryCommand,
  type EntryCommand,
  type GovernanceAction,
} from './entry-command.ts'
import { StateLayoutFailure } from './state-layout.ts'
import { CliCatalogFailure } from './catalog.ts'
import type { SessionMessageOutcome } from './session-message-client.ts'
import type { SessionCreationBlocked } from './session-creation-client.ts'
import type { SelectionBlocked } from './selected-tenant-work.ts'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'

export type ExecutableEntry = Exclude<EntryCommand, { readonly kind: 'help' | 'version' }>
export type EntryOutcome =
  | AddCenterOutcome
  | TenantCreateEntryOutcome
  | LoginEntryOutcome
  | TenantMembershipOutcome
  | SessionMessageOutcome
  | SessionCreationBlocked
  | SelectionBlocked
  | { readonly kind: 'session-detached'; readonly session: string }
  | { readonly kind: 'not-ready'; readonly reason: 'capability-not-installed' }
  | { readonly kind: 'governance-result'; readonly report: ActionReport }
export interface EntryExecution {
  readonly outcome: EntryOutcome
  readonly diagnostics: readonly Diagnostic[]
}
export interface EntryReport extends EntryExecution {
  readonly format: 'omne-cli/1'
  readonly action: GovernanceAction | 'session' | 'message'
}
/** Private application dependencies. No CLI option supplies these functions. */
export interface EntryRuntime {
  readonly signal: AbortSignal
  readonly isTTY: boolean
  readonly version: () => Promise<string>
  readonly execute: (command: ExecutableEntry) => Promise<EntryExecution>
  readonly stdout: (text: string) => Promise<void>
  readonly stderr: (text: string) => Promise<void>
}
const help = `Usage: omne [--home <path>] [--session <session-id>]
       omne --message-file <path> --json [--session <session-id>]
       omne center add <endpoint> --name <name> <trust-option> [--json]
       omne tenant create --name <name> [--json]
       omne tenant add --invitation <invitation-id> [--json]
       omne tenant switch <tenant-reference> [--json]
       omne login|register --login-identifier <id> --credential-file <path> [--center <name>] [--json]
       omne logout [--json]
       omne logins list|revoke [--handle <handle>] [--json]
       omne credential change --current-credential-file <path> --new-credential-file <path> [--json]
Trust options: --system-ca, --ca-file <path>, or --spki <sha256>.
Credentials require protected files. Non-terminal governance commands require --json.
`
class EntryOutputFailure extends Error {}
async function writeOutput(runtime: EntryRuntime, text: string): Promise<void> {
  try {
    await runtime.stdout(text)
  } catch {
    throw new EntryOutputFailure()
  }
}

export async function runEntryCli(args: readonly string[], runtime: EntryRuntime): Promise<number> {
  try {
    const command = parseEntryCommand(args, runtime.isTTY)
    if (command.kind === 'help' || command.kind === 'version') {
      await writeOutput(runtime, command.kind === 'help' ? help : await runtime.version())
      return 0
    }
    const result = await runtime.execute(command)
    const report: EntryReport = {
      format: 'omne-cli/1',
      action: command.kind === 'governance' ? command.action : command.kind,
      ...result,
    }
    await writeOutput(runtime, formatEntryReport(report, command))
    return entryExitCode(result)
  } catch (error) {
    const failure = entryFailure(error)
    try {
      await runtime.stderr(`omne: ${failure.code}\n`)
    } catch {
      return 70
    }
    return failure.exit
  }
}
function formatEntryReport(report: EntryReport, command: ExecutableEntry): string {
  if (report.outcome.kind === 'session-detached')
    return `Detached. Resume with omne --session ${report.outcome.session}\n`
  if (command.kind === 'session') return formatSessionReport(report.outcome)
  if (report.outcome.kind === 'session-message' || report.outcome.kind === 'session-creation')
    return writeJsonLossless(report) + '\n'
  const json = command.kind === 'message' || (command.kind === 'governance' && command.json)
  return JSON.stringify(report, null, json ? undefined : 2) + '\n'
}
function entryFailure(error: unknown): { code: string; exit: number } {
  if (error instanceof EntryOutputFailure) return { code: 'output-failed', exit: 70 }
  if (error instanceof EntryUsageFailure) return { code: error.reason, exit: 2 }
  if (error instanceof InputFailure) return { code: error.code, exit: 2 }
  if (error instanceof StateLayoutFailure || error instanceof CliCatalogFailure)
    return { code: error.reason, exit: 3 }
  return { code: 'internal-defect', exit: 70 }
}
export function entryExitCode(result: EntryExecution): number {
  if (result.diagnostics.length) return 70
  const outcome = result.outcome
  if (outcome.kind === 'session-message') return sessionMessageExit(outcome)
  if (outcome.kind === 'session-creation') return outcome.status === 'unconfirmed' ? 4 : 3
  if (outcome.kind === 'created') return createdExit(outcome)
  if (outcome.kind === 'unresolved') return exitStatus(outcome.result.report)
  if (outcome.kind === 'governance-result') return governanceExit(outcome.report)
  if (outcome.kind === 'logged-in') return loginExit(outcome)
  if (outcome.kind === 'tenant-prepared') return membershipExit(outcome)
  return fixedExit[outcome.kind]
}
function sessionMessageExit(outcome: SessionMessageOutcome): number {
  if (outcome.status === 'completed') return 0
  if (outcome.status === 'unconfirmed' || outcome.status === 'accepted') return 4
  return 3
}
function governanceExit(report: ActionReport): number {
  const clearsLogin =
    report.operation === 'capability.account-identity/v3#S-16' ||
    report.operation === 'capability.account-identity/v3#S-50'
  if (
    clearsLogin &&
    report.admission.status === 'admitted' &&
    report.remote.status === 'success' &&
    report.local.status === 'installed' &&
    report.defect === undefined
  )
    return 0
  return exitStatus(report)
}
function loginExit(outcome: Extract<LoginEntryOutcome, { kind: 'logged-in' }>): number {
  if (outcome.auth.login.kind === 'unconfirmed' || outcome.selection === 'unconfirmed') return 4
  if (outcome.auth.login.kind === 'blocked' || outcome.selection !== 'selected') return 3
  return 0
}
function membershipExit(
  outcome: Extract<TenantMembershipOutcome, { kind: 'tenant-prepared' }>,
): number {
  const remote = exitStatus(outcome.report)
  if (remote !== 0) return remote
  if (outcome.auth.login.kind === 'unconfirmed' || outcome.selection === 'unconfirmed') return 4
  if (outcome.auth.login.kind === 'blocked') return 3
  return outcome.selection === 'unchanged' || outcome.selection === 'selected' ? 0 : 3
}
const fixedExit = {
  saved: 0,
  'already-saved': 0,
  unconfirmed: 4,
  pending: 4,
  blocked: 2,
  conflict: 2,
  cancelled: 2,
  'invalid-input': 2,
  'entry-answer': 3,
  unavailable: 3,
  'not-ready': 3,
  'session-detached': 0,
} as const
function createdExit(outcome: Extract<TenantCreateEntryOutcome, { kind: 'created' }>): number {
  if ('kind' in outcome.auth) return 3
  switch (outcome.auth.login.kind) {
    case 'installed':
    case 'already-installed':
      return 0
    case 'unconfirmed':
      return 4
    case 'blocked':
      return 3
  }
}

function formatSessionReport(outcome: EntryOutcome): string {
  if (outcome.kind === 'session-message') {
    const status =
      outcome.status === 'accepted'
        ? 'Input was accepted. Work continues in the host.'
        : outcome.status === 'unconfirmed'
          ? 'Input status is unconfirmed. Do not submit it again.'
          : `Input ended with status ${outcome.status}.`
    return `${status}\nSession: ${outcome.request.session}\nOperation: ${outcome.request.operationKey}\n`
  }
  if (outcome.kind === 'session-creation')
    return `Session creation ${outcome.status}: ${outcome.reason}\n${
      outcome.operation ? `Operation: ${outcome.operation.operationKey}\n` : ''
    }`
  if ('reason' in outcome) return `Session unavailable: ${outcome.reason}\n`
  return `Session unavailable: ${outcome.kind}\n`
}
