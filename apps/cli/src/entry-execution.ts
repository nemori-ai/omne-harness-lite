import type { CatalogPolicy } from './catalog.ts'
import { openCliCatalog, type OwnedCliCatalog } from './catalog-open.ts'
import { createClientAssembly } from './assembly.ts'
import { addCenter } from './center-add.ts'
import type { CenterProfile } from './center-preparation.ts'
import { runTenantCreateEntry } from './tenant-create-entry.ts'
import { resolveStateHome, type HomeInput } from './state-layout.ts'
import { readInputFile } from './input.ts'
import { InputFailure } from './diagnostic.ts'
import type { LocalRecord } from '@omne-harness-lite/client-local-state'
import type { EntryExecution, ExecutableEntry } from './entry-application.ts'
import type { EntryCommand } from './entry-command.ts'
import { runSessionMessageEntry } from './session-message-entry.ts'
import type { SessionMessagePolicy } from './session-message-client.ts'
import { runLoginEntry } from './login-entry.ts'
import { runSelectedGovernanceEntry } from './selected-governance-entry.ts'
import type { PreparedFactory } from './prepared-client-work.ts'
import {
  executeInteractiveGovernance,
  confirmObservedCenter,
  type GovernanceInteraction,
} from './governance-entry-interactive.ts'
import { usingGovernanceDialog } from './governance-dialog.ts'
import { PreparedPresentationGroup } from './prepared-presentation.ts'
import { createGovernanceChoices } from './governance-choices.ts'
import { runDefaultSessionEntry, type DefaultSessionOptions } from './session-default-entry.ts'
import { prepareSessionModel, type SessionModelSetupResult } from './session-model-setup.ts'
import { usingSelectedTenant } from './selected-tenant-work.ts'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'

type GovernanceEntry = Extract<EntryCommand, { kind: 'governance' }>
export interface EntryExecutionOptions {
  readonly home: HomeInput
  readonly signal: AbortSignal
  readonly catalogPolicy: CatalogPolicy
  readonly originalId: () => string
  readonly confirmCenter: (profile: CenterProfile) => Promise<boolean>
  readonly interactive?: GovernanceInteraction
  readonly preparedFactory?: PreparedFactory
  readonly modelSetupPolicy?: { readonly maxCredentialBytes: number; readonly maxChoices: number }
  readonly enterSession?: (
    command: Extract<EntryCommand, { kind: 'session' }>,
    ready: Parameters<DefaultSessionOptions['enter']>[0],
    model?: Extract<SessionModelSetupResult, { kind: 'configured' }>,
  ) => Promise<EntryExecution>
  readonly sessionPolicy?: SessionMessagePolicy
  readonly maxMessageBytes?: number
}
/** The application fixes construction. Parsed command values never supply a provider. */
export async function executeEntry(
  command: ExecutableEntry,
  options: EntryExecutionOptions,
): Promise<EntryExecution> {
  if (command.kind === 'message') {
    if (!options.sessionPolicy || options.maxMessageBytes === undefined) return notReady()
  }
  if (options.signal.aborted) throw new InputFailure('input-cancelled')
  const home = resolveStateHome({
    ...options.home,
    ...(command.home === null ? {} : { explicitHome: command.home }),
  })
  const owned = await openCliCatalog(home, options.catalogPolicy)
  if (command.kind === 'session')
    return usingCatalog(owned, () => executeSessionPreparation(command, home, owned, options))
  if (command.kind !== 'governance')
    return usingCatalog(owned, () =>
      runSessionMessageEntry({
        command,
        home,
        catalog: owned.catalog,
        signal: options.signal,
        originalId: options.originalId,
        policy: options.sessionPolicy!,
        maxMessageBytes: options.maxMessageBytes!,
        ...(options.preparedFactory ? { preparedFactory: options.preparedFactory } : {}),
      }),
    )
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

async function executeSessionPreparation(
  command: Extract<EntryCommand, { kind: 'session' }>,
  home: string,
  owned: OwnedCliCatalog,
  options: EntryExecutionOptions,
): Promise<EntryExecution> {
  const interactive = options.interactive
  if (!interactive) throw new InputFailure('tty-unsupported')
  const presentation = new PreparedPresentationGroup()
  const baseFactory = options.preparedFactory ?? createClientAssembly
  const factory: PreparedFactory = Object.assign(
    (input: Parameters<PreparedFactory>[0]) => baseFactory(input),
    { presentation },
  )
  return usingGovernanceDialog(
    options.signal,
    interactive.terminal,
    (dialog, signal) =>
      runDefaultSessionEntry({
        home,
        catalog: owned.catalog,
        signal,
        dialog,
        preparedFactory: factory,
        choices: createGovernanceChoices(
          home,
          owned.catalog,
          signal,
          interactive.choicePolicy,
          factory,
        ),
        execute: completed =>
          executeGovernance(completed, home, owned, {
            ...options,
            signal,
            preparedFactory: factory,
            confirmCenter: profile => confirmObservedCenter(dialog, profile),
          }),
        enter: async ready => {
          if (!options.modelSetupPolicy) return options.enterSession?.(command, ready) ?? notReady()
          const prepared = await usingSelectedTenant(
            home,
            owned.catalog,
            signal,
            async ports => {
              const binding = ports.selection.selected
              if (
                binding.centerId !== ready.binding.centerId ||
                !tenantIdEquals(binding.tenant, ready.binding.tenant)
              )
                return { kind: 'blocked', reason: 'identity-mismatch' } as const
              return prepareSessionModel({
                home,
                binding,
                governance: ports.client,
                source: {
                  centerId: ready.identity.centerId,
                  accountId: ready.identity.accountId,
                  loginStateHandle: ready.identity.loginStateHandle,
                },
                dialog,
                signal,
                originalId: options.originalId,
                ...options.modelSetupPolicy!,
              })
            },
            factory,
          )
          if (prepared.outcome.kind !== 'configured')
            return { outcome: prepared.outcome, diagnostics: prepared.diagnostics }
          if (prepared.diagnostics.length)
            return {
              outcome: { kind: 'blocked', reason: 'preparation-close-failed' },
              diagnostics: prepared.diagnostics,
            }
          return options.enterSession?.(command, ready, prepared.outcome) ?? notReady()
        },
      }),
    presentation,
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
