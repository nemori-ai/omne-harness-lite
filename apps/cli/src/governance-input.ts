import type { EntryCommand } from './entry-command.ts'
import type { CenterProfile } from './center-preparation.ts'
import type { Dialog } from './tui/dialog.ts'
import type { TenantBinding } from './state-layout.ts'
import { InputFailure } from './diagnostic.ts'
import { validFieldText } from './tui/forms.ts'

export type GovernanceCommand = Extract<EntryCommand, { kind: 'governance' }>
export type GovernanceDialog = Pick<Dialog, 'text' | 'choose' | 'show' | 'identity'>
export interface TenantChoice {
  readonly binding: TenantBinding
  readonly reference: string
  readonly label: string
}
export interface InvitationChoice {
  readonly id: string
  readonly label: string
}
/** Choice readings do not grant authority. The actual command revalidates its target. */
export interface GovernanceChoices {
  centers(): Promise<readonly CenterProfile[]>
  tenants(): Promise<readonly TenantChoice[]>
  invitations(): Promise<readonly InvitationChoice[]>
}
export async function completeGovernanceInput(
  command: GovernanceCommand,
  dialog: GovernanceDialog,
  choices: GovernanceChoices,
  signal: AbortSignal,
): Promise<GovernanceCommand | undefined> {
  if (!command.interactive) return command
  if (signal.aborted) return undefined
  const values = { ...command.values }
  const complete = await actionInput(command.action, values, dialog, choices)
  if (!complete || signal.aborted) return undefined
  if (
    command.action !== 'center.add' &&
    !(await dialog.show('Confirm action', [command.action, ...displayValues(values)]))
  )
    return undefined
  if (signal.aborted) return undefined
  return { ...command, values }
}

const fields: Partial<Record<GovernanceCommand['action'], readonly [string, string][]>> = {
  'center.add': [
    ['endpoint', 'Center HTTPS endpoint'],
    ['name', 'Center name'],
  ],
  'tenant.create': [['name', 'Organization name']],
  login: [
    ['login-identifier', 'Login identifier'],
    ['credential-file', 'Credential file path'],
  ],
  register: [
    ['login-identifier', 'Login identifier'],
    ['credential-file', 'Credential file path'],
  ],
  'logins.revoke': [['handle', 'Login handle to revoke']],
  'credential.change': [
    ['current-credential-file', 'Current credential file path'],
    ['new-credential-file', 'New credential file path'],
  ],
}
async function actionInput(
  action: GovernanceCommand['action'],
  values: Record<string, string | boolean>,
  dialog: GovernanceDialog,
  choices: GovernanceChoices,
): Promise<boolean> {
  if (!(await prepareLoginCenter(action, values, dialog, choices))) return false
  if (action === 'tenant.switch' && !('tenant' in values))
    return pickTenant(values, dialog, choices)
  if (action === 'tenant.add' && !('invitation' in values))
    return pickInvitation(values, dialog, choices)
  if (!(await collectFields(fields[action] ?? [], values, dialog))) return false
  return action !== 'center.add' || collectTrust(values, dialog)
}
async function prepareLoginCenter(
  action: GovernanceCommand['action'],
  values: Record<string, string | boolean>,
  dialog: GovernanceDialog,
  choices: GovernanceChoices,
): Promise<boolean> {
  if (action !== 'login' && action !== 'register') return true
  if ('center' in values) return true
  const profiles = await choices.centers()
  const selected = await pick(
    dialog,
    'Select center',
    profiles.map(p => `${p.name} / ${p.center.centerId} / ${p.center.endpoint}`),
  )
  if (selected === undefined) return false
  values.center = profiles[selected]!.name
  return true
}
async function collectFields(
  fields: readonly [string, string][],
  values: Record<string, string | boolean>,
  dialog: GovernanceDialog,
): Promise<boolean> {
  for (const [name, title] of fields) {
    if (name in values) continue
    const value = await dialog.text(
      title,
      name.includes('credential')
        ? ['Enter a protected file path. Do not enter the credential itself.']
        : [],
    )
    if (value === undefined) return false
    if (value.length === 0 || !validFieldText(value)) throw new InputFailure('invalid-options')
    values[name] = value
  }
  return true
}
async function pick(
  dialog: GovernanceDialog,
  title: string,
  labels: readonly string[],
): Promise<number | undefined> {
  if (labels.length === 0) {
    await dialog.show(title, ['No available candidates.'])
    return undefined
  }
  const index = await dialog.choose(title, labels)
  if (index !== undefined && (!Number.isSafeInteger(index) || index < 0 || index >= labels.length))
    throw new Error('invalid dialog choice')
  return index
}
async function pickTenant(
  values: Record<string, string | boolean>,
  dialog: GovernanceDialog,
  choices: GovernanceChoices,
): Promise<boolean> {
  const candidates = await choices.tenants()
  const index = await pick(
    dialog,
    'Select tenant',
    candidates.map(choice => choice.label),
  )
  if (index === undefined) return false
  values.tenant = candidates[index]!.reference
  return true
}
async function pickInvitation(
  values: Record<string, string | boolean>,
  dialog: GovernanceDialog,
  choices: GovernanceChoices,
): Promise<boolean> {
  const candidates = await choices.invitations()
  const index = await pick(
    dialog,
    'Select invitation',
    candidates.map(choice => choice.label),
  )
  if (index === undefined) return false
  values.invitation = candidates[index]!.id
  return true
}
async function collectTrust(
  values: Record<string, string | boolean>,
  dialog: GovernanceDialog,
): Promise<boolean> {
  if (['system-ca', 'ca-file', 'spki'].some(key => key in values)) return true
  const selected = await dialog.choose('Select center trust', [
    'System certificate authorities',
    'Certificate authority file',
    'Pinned SPKI SHA-256',
  ])
  if (selected === undefined) return false
  if (selected === 0) {
    values['system-ca'] = true
    return true
  }
  if (selected === 1)
    return collectFields([['ca-file', 'Certificate authority file path']], values, dialog)
  if (selected === 2) return collectFields([['spki', 'SPKI SHA-256']], values, dialog)
  throw new Error('invalid trust choice')
}
function displayValues(values: Readonly<Record<string, string | boolean>>): string[] {
  return Object.entries(values).map(([key, value]) => `${key}: ${String(value)}`)
}
