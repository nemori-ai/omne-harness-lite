import type { CliCatalog } from './catalog.ts'
import { isOk, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { parseOrganizationName } from '@omne-harness-lite/organization-governance'
import { resolveStateHome } from './state-layout.ts'
import {
  runTenantCreateCommand,
  type TenantCreateCommandInput,
  type TenantCreateCommandOutcome,
} from './tenant-create-command.ts'
import { usingSelectedTenant, type SelectionBlocked } from './selected-tenant-work.ts'
import type { PreparedFactory } from './prepared-client-work.ts'
import type { Diagnostic } from './diagnostic.ts'

export type TenantCreateEntryInput = Omit<TenantCreateCommandInput, 'loginScope'>
export type TenantCreateEntryOutcome = TenantCreateCommandOutcome | SelectionBlocked
export interface TenantCreateEntryResult {
  readonly outcome: TenantCreateEntryOutcome
  readonly diagnostics: readonly Diagnostic[]
}

/** The catalog is borrowed. This entry owns only the selected tenant's assembly. */
export async function runTenantCreateEntry(
  input: TenantCreateEntryInput,
  catalog: CliCatalog,
  signal: AbortSignal,
  factory?: PreparedFactory,
): Promise<TenantCreateEntryResult> {
  const name = parseOrganizationName(input.name),
    key = parseOpaqueIdentifier(input.creationKey, 'CreationKey')
  if (!isOk(name) || !isOk(key))
    return { outcome: { kind: 'blocked', reason: 'invalid-input' }, diagnostics: [] }
  const captured = {
    home: resolveStateHome({ explicitHome: input.home, osHome: input.home }),
    name: name.ok,
    creationKey: key.ok,
  }
  return usingSelectedTenant(
    captured.home,
    catalog,
    signal,
    ports =>
      runTenantCreateCommand(
        {
          ...captured,
          loginScope: {
            centerId: ports.selection.selected.centerId,
            accountId: ports.selection.selected.tenant.account,
          },
        },
        ports,
      ),
    factory,
  )
}
