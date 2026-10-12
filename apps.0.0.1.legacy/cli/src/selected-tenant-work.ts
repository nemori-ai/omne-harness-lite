import type { CliCatalog, CatalogSnapshot } from './catalog.ts'
import type { ClientLocalState } from '@omne-harness-lite/client-local-state'
import type { GovernanceClientOperations } from '@omne-harness-lite/governance-client-operations'
import { checkExistingTenantAuth, StateLayoutFailure, type TenantBinding } from './state-layout.ts'
import { ClientAssemblyStateFailure, ClientAssemblyStopped } from './client-assembly.ts'
import { usingPreparedClient, type PreparedFactory } from './prepared-client-work.ts'
import type { Diagnostic } from './diagnostic.ts'

export interface SelectedTenantPorts {
  readonly home: string
  readonly catalog: CliCatalog
  readonly selection: CatalogSnapshot & { readonly selected: TenantBinding }
  readonly client: GovernanceClientOperations
  readonly source: ClientLocalState
}
export interface SelectionBlocked {
  readonly kind: 'blocked'
  readonly reason: string
  readonly report?: import('@omne-harness-lite/governance-client-operations').ActionReport
}

/** Borrow the root catalog. Own the selected tenant's actual client assembly. */
export async function usingSelectedTenant<T>(
  home: string,
  catalog: CliCatalog,
  signal: AbortSignal,
  work: (ports: SelectedTenantPorts) => Promise<T>,
  factory?: PreparedFactory,
): Promise<{ outcome: T | SelectionBlocked; diagnostics: readonly Diagnostic[] }> {
  if (signal.aborted) return blocked('input-cancelled')
  const selection = await catalog.readSelection()
  const selected = selection.selected
  if (selected === null) return blocked('not-selected')
  let directory: string
  try {
    directory = (await checkExistingTenantAuth(home, selected)).auth
  } catch (error) {
    if (error instanceof StateLayoutFailure) return blocked(error.reason)
    throw error
  }
  return usingPreparedClient(
    { directory },
    signal,
    async assembly => {
      try {
        const ports = await selectedPorts(home, catalog, { ...selection, selected }, assembly)
        if ('kind' in ports) return ports
        return work(ports)
      } catch (error) {
        if (error instanceof ClientAssemblyStateFailure)
          return { kind: 'blocked', reason: error.reason } as const
        if (error instanceof ClientAssemblyStopped && signal.aborted)
          return { kind: 'blocked', reason: 'input-cancelled' } as const
        throw error
      }
    },
    factory,
  )
}
async function selectedPorts(
  home: string,
  catalog: CliCatalog,
  selection: CatalogSnapshot & { readonly selected: TenantBinding },
  assembly: import('./client-assembly.ts').PreparedClientAssembly,
): Promise<SelectedTenantPorts | SelectionBlocked> {
  const client = await assembly.ready,
    source = await assembly.borrowState()
  const read = await source.read()
  if (read.kind !== 'read') return { kind: 'blocked', reason: read.reason }
  if (read.snapshot.value?.login === undefined) return { kind: 'blocked', reason: 'not-logged-in' }
  if (
    read.snapshot.value.center.centerId !== selection.selected.centerId ||
    read.snapshot.value.login.accountId !== selection.selected.tenant.account
  )
    return { kind: 'blocked', reason: 'identity-mismatch' }
  return { home, catalog, selection, client, source }
}
const blocked = (reason: string) => ({
  outcome: { kind: 'blocked', reason } as const,
  diagnostics: [],
})
