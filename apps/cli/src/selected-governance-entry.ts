import type { EntryCommand } from './entry-command.ts'
import type { CliCatalog } from './catalog.ts'
import { usingSelectedTenant } from './selected-tenant-work.ts'
import { usingGovernanceUse } from './governance-use-work.ts'
import { runTenantMembershipCommand } from './tenant-membership-command.ts'
import { parseTenantReference } from './tenant-reference.ts'
import { readInputFile } from './input.ts'
import { InputFailure } from './diagnostic.ts'
import type { GovernanceUse } from '@omne-harness-lite/governance-client-operations'
import type { EntryExecution } from './entry-application.ts'
import type { PreparedFactory } from './prepared-client-work.ts'

type Command = Extract<EntryCommand, { kind: 'governance' }>
export async function runSelectedGovernanceEntry(
  command: Command,
  home: string,
  catalog: CliCatalog,
  signal: AbortSignal,
  operationId: string,
  factory?: PreparedFactory,
): Promise<EntryExecution> {
  const target =
    command.action === 'tenant.switch'
      ? parseTenantReference(required(command, 'tenant'))
      : undefined
  return usingSelectedTenant(
    home,
    catalog,
    signal,
    async ports => {
      const opened = await ports.client.openUse()
      if (opened.kind === 'blocked') return opened
      return usingGovernanceUse(opened.use, async use => {
        if (command.action === 'tenant.switch') {
          return runTenantMembershipCommand(
            { action: 'switch', target: target!, operationId },
            ports,
            use,
          )
        }
        if (command.action === 'tenant.add') {
          return runTenantMembershipCommand(
            { action: 'add', invitation: required(command, 'invitation'), operationId },
            ports,
            use,
          )
        }
        return accountAction(command, use, signal)
      })
    },
    factory,
  )
}
function required(command: Command, field: string): string {
  const value = command.values[field]
  if (typeof value !== 'string') throw new InputFailure('tty-unsupported')
  return value
}
async function accountAction(
  command: Command,
  use: GovernanceUse,
  signal: AbortSignal,
): Promise<Extract<EntryExecution['outcome'], { kind: 'governance-result' }>> {
  if (command.action === 'logout')
    return { kind: 'governance-result', report: await use.run({ action: 'logout' }) }
  if (command.action === 'credential.change') {
    const report = await use.runPrepared(
      { action: 'invoke', operation: 'capability.account-identity/v3#S-50', payload: {} },
      async (_preview, current) => {
        if (signal.aborted || current.aborted) return { kind: 'cancelled' }
        const currentCredential = await readInputFile(
          required(command, 'current-credential-file'),
          1024 * 1024,
          true,
          current,
        )
        const newCredential = await readInputFile(
          required(command, 'new-credential-file'),
          1024 * 1024,
          true,
          current,
        )
        if (signal.aborted) return { kind: 'cancelled' }
        return { kind: 'continue', secrets: { currentCredential, newCredential } }
      },
    )
    return { kind: 'governance-result', report }
  }
  const operation =
    command.action === 'logins.list'
      ? 'capability.account-identity/v3#S-37'
      : 'capability.account-identity/v3#S-16'
  const payload =
    command.action === 'logins.list' ? {} : { loginStateHandle: required(command, 'handle') }
  return {
    kind: 'governance-result',
    report: await use.run({
      action: 'invoke',
      operation,
      payload,
      ...(command.action === 'logins.list' ? { readMode: 'refresh' } : {}),
    }),
  }
}
