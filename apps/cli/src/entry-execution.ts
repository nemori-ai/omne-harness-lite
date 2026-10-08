import type { CatalogPolicy } from './catalog.ts'
import { openCliCatalog, type OwnedCliCatalog } from './catalog-open.ts'
import { addCenter } from './center-add.ts'
import type { CenterProfile } from './center-preparation.ts'
import { runTenantCreateEntry } from './tenant-create-entry.ts'
import { resolveStateHome, type HomeInput } from './state-layout.ts'
import { readInputFile } from './input.ts'
import { InputFailure } from './diagnostic.ts'
import type { LocalRecord } from '@omne-harness-lite/client-local-state'
import type { EntryExecution, ExecutableEntry } from './entry-application.ts'
import type { EntryCommand } from './entry-command.ts'
import { runLoginEntry } from './login-entry.ts'
import { runSelectedGovernanceEntry } from './selected-governance-entry.ts'
import type { PreparedFactory } from './prepared-client-work.ts'
import {
  executeInteractiveGovernance,
  type GovernanceInteraction,
} from './governance-entry-interactive.ts'

type GovernanceEntry = Extract<EntryCommand, { kind: 'governance' }>
export interface EntryExecutionOptions {
  readonly home: HomeInput
  readonly signal: AbortSignal
  readonly catalogPolicy: CatalogPolicy
  readonly originalId: () => string
  readonly confirmCenter: (profile: CenterProfile) => Promise<boolean>
  readonly interactive?: GovernanceInteraction
  readonly preparedFactory?: PreparedFactory
  readonly session?: (command: Exclude<ExecutableEntry, GovernanceEntry>) => Promise<EntryExecution>
}
/** The application fixes construction. Parsed command values never supply a provider. */
export async function executeEntry(
  command: ExecutableEntry,
  options: EntryExecutionOptions,
): Promise<EntryExecution> {
  if (command.kind !== 'governance') {
    if (options.session) return options.session(command)
    return notReady()
  }
  if (options.signal.aborted) throw new InputFailure('input-cancelled')
  const home = resolveStateHome({
    ...options.home,
    ...(command.home === null ? {} : { explicitHome: command.home }),
  })
  const owned = await openCliCatalog(home, options.catalogPolicy)
  return usingCatalog(owned, () =>
    command.interactive
      ? executeInteractiveGovernance(
          command,
          home,
          owned.catalog,
          options.signal,
          options.interactive,
          (completed, signal, confirmCenter, preparedFactory) =>
            executeGovernance(completed, home, owned, {
              ...options,
              signal,
              confirmCenter,
              preparedFactory,
            }),
          options.preparedFactory,
        )
      : executeGovernance(command, home, owned, options),
  )
}
async function executeGovernance(
  command: GovernanceEntry,
  home: string,
  owned: OwnedCliCatalog,
  options: EntryExecutionOptions,
): Promise<EntryExecution> {
  if (command.action === 'login' || command.action === 'register')
    return runLoginEntry(
      {
        home,
        action: command.action,
        centerName: typeof command.values.center === 'string' ? command.values.center : null,
        loginIdentifier: requiredString(command, 'login-identifier'),
        credentialFile: requiredString(command, 'credential-file'),
        operationId: options.originalId(),
      },
      owned.catalog,
      options.signal,
      options.preparedFactory,
    )
  if (command.action === 'tenant.create')
    return runTenantCreateEntry(
      {
        home,
        name: requiredString(command, 'name'),
        creationKey: options.originalId(),
      },
      owned.catalog,
      options.signal,
      options.preparedFactory,
    )
  if (command.action !== 'center.add')
    return runSelectedGovernanceEntry(
      command,
      home,
      owned.catalog,
      options.signal,
      options.originalId(),
      options.preparedFactory,
    )
  const trust = await centerTrust(command, options.signal)
  const outcome = await addCenter(
    owned.catalog,
    {
      name: requiredString(command, 'name'),
      endpoint: requiredString(command, 'endpoint'),
      trust,
    },
    { signal: options.signal },
    command.json ? async () => true : options.confirmCenter,
  )
  return { outcome, diagnostics: [] }
}
function notReady(): EntryExecution {
  return { outcome: { kind: 'not-ready', reason: 'capability-not-installed' }, diagnostics: [] }
}
function requiredString(command: GovernanceEntry, key: string): string {
  const value = command.values[key]
  if (typeof value !== 'string') throw new InputFailure('tty-unsupported')
  return value
}
async function centerTrust(
  command: GovernanceEntry,
  signal: AbortSignal,
): Promise<LocalRecord['center']['trust']> {
  if (command.values['system-ca'] === true) return { mode: 'ca' }
  if (typeof command.values.spki === 'string') return { mode: 'spki', sha256: command.values.spki }
  return {
    mode: 'ca',
    certificateAuthorities: await readInputFile(
      requiredString(command, 'ca-file'),
      1024 * 1024,
      false,
      signal,
    ),
  }
}
async function usingCatalog(
  owned: OwnedCliCatalog,
  work: () => Promise<EntryExecution>,
): Promise<EntryExecution> {
  let result: EntryExecution
  try {
    result = await work()
  } catch (error) {
    try {
      await owned.close()
    } catch (close) {
      throw new AggregateError([error, close], 'entry work and catalog close failed')
    }
    throw error
  }
  try {
    await owned.close()
  } catch {
    return { ...result, diagnostics: [...result.diagnostics, 'internal-defect'] }
  }
  return result
}
