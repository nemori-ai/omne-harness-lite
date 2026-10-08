import type { CliCatalog } from './catalog.ts'
import { createClientAssembly } from './assembly.ts'
import {
  assemblyCloseDiagnostics,
  ClientAssemblyStopped,
  ClientAssemblyStateFailure,
  type ClientAssemblyOptions,
  type PreparedClientAssembly,
} from './client-assembly.ts'
import type { Diagnostic } from './diagnostic.ts'
import {
  checkExistingTenantAuth,
  resolveStateHome,
  StateLayoutFailure,
  type TenantBinding,
} from './state-layout.ts'
import { isOk, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { parseOrganizationName } from '@omne-harness-lite/organization-governance'
import {
  runTenantCreateCommand,
  type TenantCreateCommandInput,
  type TenantCreateCommandOutcome,
} from './tenant-create-command.ts'

export type TenantCreateEntryInput = Omit<TenantCreateCommandInput, 'loginScope'>
export type TenantCreateEntryOutcome =
  | TenantCreateCommandOutcome
  | {
      readonly kind: 'blocked'
      readonly reason: 'not-selected' | 'input-cancelled' | StateLayoutFailure['reason']
    }
export interface TenantCreateEntryResult {
  readonly outcome: TenantCreateEntryOutcome
  readonly diagnostics: readonly Diagnostic[]
}
type PreparedFactory = (options: ClientAssemblyOptions) => PreparedClientAssembly

/** The catalog is borrowed. This entry owns only the selected tenant's assembly. */
export async function runTenantCreateEntry(
  input: TenantCreateEntryInput,
  catalog: CliCatalog,
  signal: AbortSignal,
  factory: PreparedFactory = createClientAssembly,
): Promise<TenantCreateEntryResult> {
  const prepared = await prepareSelection(input, catalog, signal)
  if (prepared.kind === 'blocked') return blocked(prepared.reason)
  return runInAssembly(prepared, catalog, signal, factory)
}

type Block = Extract<TenantCreateEntryOutcome, { kind: 'blocked' }>
interface PreparedSelection {
  readonly kind: 'ready'
  readonly input: TenantCreateEntryInput
  readonly selected: TenantBinding
  readonly directory: string
}
async function prepareSelection(
  input: TenantCreateEntryInput,
  catalog: CliCatalog,
  signal: AbortSignal,
): Promise<PreparedSelection | Block> {
  const name = parseOrganizationName(input.name),
    key = parseOpaqueIdentifier(input.creationKey, 'CreationKey')
  if (!isOk(name) || !isOk(key)) return { kind: 'blocked', reason: 'invalid-input' }
  if (signal.aborted) return { kind: 'blocked', reason: 'input-cancelled' }
  try {
    const home = resolveStateHome({ explicitHome: input.home, osHome: input.home })
    const selected = (await catalog.readSelection()).selected
    if (selected === null) return { kind: 'blocked', reason: 'not-selected' }
    const directory = (await checkExistingTenantAuth(home, selected)).auth
    return {
      kind: 'ready',
      input: { home, name: name.ok, creationKey: key.ok },
      selected,
      directory,
    }
  } catch (error) {
    if (error instanceof StateLayoutFailure) return { kind: 'blocked', reason: error.reason }
    throw error
  }
}
async function createInAssembly(
  prepared: PreparedSelection,
  catalog: CliCatalog,
  assembly: PreparedClientAssembly,
): Promise<TenantCreateEntryOutcome> {
  const client = await assembly.ready,
    source = await assembly.borrowState()
  const read = await source.read()
  if (read.kind !== 'read') return { kind: 'blocked', reason: 'local-unavailable' }
  if (read.snapshot.value?.login === undefined) return { kind: 'blocked', reason: 'not-logged-in' }
  if (
    !matchesSelection(
      read.snapshot.value.center.centerId,
      read.snapshot.value.login.accountId,
      prepared.selected,
    )
  )
    return { kind: 'blocked', reason: 'identity-mismatch' }
  return runTenantCreateCommand(
    {
      ...prepared.input,
      loginScope: {
        centerId: prepared.selected.centerId,
        accountId: prepared.selected.tenant.account,
      },
    },
    { client, source, catalog },
  )
}
function expectedFailure(error: unknown, signal: AbortSignal): Block | undefined {
  if (error instanceof ClientAssemblyStopped && signal.aborted)
    return { kind: 'blocked', reason: 'input-cancelled' }
  if (error instanceof ClientAssemblyStateFailure)
    return { kind: 'blocked', reason: stateBlock(error) }
  return undefined
}
async function runInAssembly(
  prepared: PreparedSelection,
  catalog: CliCatalog,
  signal: AbortSignal,
  factory: PreparedFactory,
): Promise<TenantCreateEntryResult> {
  if (signal.aborted) return blocked('input-cancelled')
  const assembly = factory({ directory: prepared.directory })
  const stop = () => assembly.requestStop()
  signal.addEventListener('abort', stop)
  if (signal.aborted) stop()
  let outcome: TenantCreateEntryOutcome | undefined,
    failure: unknown,
    failed = false
  let cleanup: Awaited<ReturnType<typeof stopAssembly>>
  try {
    outcome = await createInAssembly(prepared, catalog, assembly)
  } catch (error) {
    outcome = expectedFailure(error, signal)
    if (outcome === undefined) {
      failed = true
      failure = error
    }
  } finally {
    cleanup = await stopAssembly(assembly)
    signal.removeEventListener('abort', stop)
  }
  if (failed) {
    if (cleanup.failures.length)
      throw new AggregateError(
        [failure, ...cleanup.failures],
        'tenant entry work and cleanup failed',
      )
    throw failure
  }
  return { outcome: outcome!, diagnostics: cleanup.diagnostics }
}

function matchesSelection(
  centerId: string,
  accountId: string | undefined,
  binding: TenantBinding,
): boolean {
  return centerId === binding.centerId && accountId === binding.tenant.account
}
function blocked(
  reason: Extract<TenantCreateEntryOutcome, { kind: 'blocked' }>['reason'],
): TenantCreateEntryResult {
  return { outcome: { kind: 'blocked', reason }, diagnostics: [] }
}
function stateBlock(
  error: ClientAssemblyStateFailure,
): 'local-unavailable' | 'invalid-record' | 'unsupported-format' | 'invalid-input' {
  if (error.reason === 'unavailable') return 'local-unavailable'
  if (error.reason === 'invalid-record' || error.reason === 'unsupported-format')
    return error.reason
  return 'invalid-input'
}
async function stopAssembly(
  assembly: PreparedClientAssembly,
): Promise<{ diagnostics: Diagnostic[]; failures: unknown[] }> {
  const diagnostics: Diagnostic[] = [],
    failures: unknown[] = []
  assembly.requestStop()
  try {
    await assembly.clientStopped
  } catch (error) {
    // No quiescence proof: keep the CLS presentation gate closed.
    return { diagnostics: ['client-close-failed'], failures: [error] }
  }
  assembly.releasePresentation()
  try {
    const report = await assembly.closed
    diagnostics.push(...assemblyCloseDiagnostics(report))
    if (diagnostics.length) failures.push(new Error('tenant entry assembly cleanup failed'))
  } catch (error) {
    diagnostics.push('internal-defect')
    failures.push(error)
  }
  return { diagnostics, failures }
}
