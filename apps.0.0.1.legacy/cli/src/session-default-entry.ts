import type { CliCatalog } from './catalog.ts'
import type { EntryExecution } from './entry-application.ts'
import { entryExitCode } from './entry-application.ts'
import {
  completeGovernanceInput,
  type GovernanceCommand,
  type GovernanceChoices,
  type GovernanceDialog,
} from './governance-input.ts'
import type { PreparedFactory } from './prepared-client-work.ts'
import {
  readSessionEntryPreparation,
  type SessionEntryPreparation,
} from './session-entry-preparation.ts'

export interface DefaultSessionOptions {
  readonly home: string
  readonly catalog: CliCatalog
  readonly signal: AbortSignal
  readonly dialog: GovernanceDialog
  readonly choices: GovernanceChoices
  readonly preparedFactory: PreparedFactory
  readonly execute: (command: GovernanceCommand) => Promise<EntryExecution>
  readonly enter: (
    ready: Extract<SessionEntryPreparation, { kind: 'ready' }>,
  ) => Promise<EntryExecution>
}

export async function runDefaultSessionEntry(
  options: DefaultSessionOptions,
): Promise<EntryExecution> {
  while (!options.signal.aborted) {
    const read = await readSessionEntryPreparation(options)
    const state = read.outcome
    if (read.diagnostics.length) {
      return {
        outcome: { kind: 'blocked', reason: 'preparation-close-failed' },
        diagnostics: read.diagnostics,
      }
    }
    if (state.kind === 'ready') {
      options.dialog.identity([
        `Center: ${state.binding.centerId}`,
        `Account: ${state.binding.tenant.account}`,
        `Organization: ${state.binding.tenant.organization}`,
      ])
      return options.enter(state)
    }
    if (state.kind === 'blocked') return { outcome: state, diagnostics: [] }
    const action = await preparationAction(state, options.dialog)
    if (action === undefined) break
    const command = await completeGovernanceInput(
      { kind: 'governance', action, home: null, json: false, interactive: true, values: {} },
      options.dialog,
      options.choices,
      options.signal,
    )
    if (!command) break
    const result = await options.execute(command)
    if (!preparationSucceeded(result, action)) return result
    if (
      action === 'register' &&
      !(await options.dialog.show('Account registered', ['Log in to start a session.']))
    )
      break
  }
  return { outcome: { kind: 'blocked', reason: 'input-cancelled' }, diagnostics: [] }
}

async function preparationAction(
  state: Extract<SessionEntryPreparation, { kind: 'center-required' | 'login-required' }>,
  dialog: GovernanceDialog,
): Promise<'center.add' | 'login' | 'register' | undefined> {
  if (state.kind === 'center-required') return 'center.add'
  const answer = await dialog.choose(
    state.reason === 'login-rejected' ? 'Login expired. Sign in again' : 'Sign in to continue',
    ['Log in', 'Register account'],
  )
  if (answer === undefined) return undefined
  if (answer === 0) return 'login'
  if (answer === 1) return 'register'
  throw new Error('invalid preparation action')
}

function preparationSucceeded(result: EntryExecution, action: string): boolean {
  if (entryExitCode(result) !== 0) return false
  const value = result.outcome
  if (action === 'center.add') return value.kind === 'saved' || value.kind === 'already-saved'
  if (action === 'login') return value.kind === 'logged-in' && value.selection === 'selected'
  return action === 'register' && value.kind === 'governance-result'
}
