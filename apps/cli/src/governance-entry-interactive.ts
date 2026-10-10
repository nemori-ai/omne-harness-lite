import { createHash } from 'node:crypto'
import type { CliCatalog } from './catalog.ts'
import type { CenterProfile } from './center-preparation.ts'
import type { EntryExecution } from './entry-application.ts'
import { InputFailure } from './diagnostic.ts'
import { createClientAssembly } from './assembly.ts'
import type { PreparedFactory } from './prepared-client-work.ts'
import { PreparedPresentationGroup } from './prepared-presentation.ts'
import { createGovernanceChoices, type ChoicePolicy } from './governance-choices.ts'
import { usingGovernanceDialog, type TerminalFactory } from './governance-dialog.ts'
import {
  completeGovernanceInput,
  type GovernanceCommand,
  type GovernanceDialog,
} from './governance-input.ts'

export interface GovernanceInteraction {
  readonly terminal: TerminalFactory
  readonly choicePolicy: ChoicePolicy
}
type Execute = (
  command: GovernanceCommand,
  signal: AbortSignal,
  confirm: (profile: CenterProfile) => Promise<boolean>,
  factory: PreparedFactory,
) => Promise<EntryExecution>

export async function executeInteractiveGovernance(
  command: GovernanceCommand,
  home: string,
  catalog: CliCatalog,
  signal: AbortSignal,
  inputs: GovernanceInteraction | undefined,
  execute: Execute,
  baseFactory: PreparedFactory = createClientAssembly,
): Promise<EntryExecution> {
  if (!inputs) throw new InputFailure('tty-unsupported')
  const presentation = new PreparedPresentationGroup()
  const factory: PreparedFactory = Object.assign(
    (options: Parameters<PreparedFactory>[0]) => baseFactory(options),
    { presentation },
  )
  return usingGovernanceDialog(
    signal,
    inputs.terminal,
    async (dialog, stopped) => {
      const selection = await catalog.readSelection()
      const selected = selection.selected
      dialog.identity(
        selected
          ? [
              `Center: ${selected.centerId}`,
              `Account: ${selected.tenant.account}`,
              `Organization: ${selected.tenant.organization}`,
            ]
          : ['Center: unselected', 'Account: unselected', 'Organization: unselected'],
      )
      const choices = createGovernanceChoices(home, catalog, stopped, inputs.choicePolicy, factory)
      const complete = await completeGovernanceInput(command, dialog, choices, stopped)
      if (!complete)
        return { outcome: { kind: 'blocked', reason: 'input-cancelled' }, diagnostics: [] }
      return execute(complete, stopped, profile => confirmObservedCenter(dialog, profile), factory)
    },
    presentation,
  )
}

export function confirmObservedCenter(
  dialog: GovernanceDialog,
  profile: CenterProfile,
): Promise<boolean> {
  const trust = profile.center.trust
  const fingerprint =
    trust.mode === 'spki'
      ? `SPKI SHA-256: ${trust.sha256}`
      : trust.certificateAuthorities === undefined
        ? 'Trust: system certificate authorities'
        : `CA SHA-256: ${createHash('sha256').update(trust.certificateAuthorities).digest('hex')}`
  return dialog.show('Confirm center', [
    `Name: ${profile.name}`,
    `Endpoint: ${profile.center.endpoint}`,
    `Center: ${profile.center.centerId}`,
    fingerprint,
  ])
}
