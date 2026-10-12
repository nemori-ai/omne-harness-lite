import type { CliCatalog } from './catalog.ts'
import type { CenterProfile } from './center-preparation.ts'
import type { ActionReport } from '@omne-harness-lite/governance-client-operations'
import type { TenantAuthOutcome } from './tenant-auth.ts'
import type { TenantBinding } from './state-layout.ts'
import { type Diagnostic } from './diagnostic.ts'
import { type PreparedFactory } from './prepared-client-work.ts'
import { usingPreparedClient } from './prepared-client-work.ts'
import type { PreparedClientAssembly } from './client-assembly.ts'
import { ClientAssemblyStateFailure, ClientAssemblyStopped } from './client-assembly.ts'
import { join } from 'node:path'
import { prepareStateDirectory, StateLayoutFailure } from './state-layout.ts'
import { readInputFile } from './input.ts'
import { exitStatus } from '@omne-harness-lite/governance-client-operations'
import { readNewSessionIdentity } from './session-preparation.ts'
import { prepareTenantAuth } from './tenant-auth.ts'
import { usingGovernanceUse } from './governance-use-work.ts'
import { ClientStateOpenFailure } from '@omne-harness-lite/client-local-state-sqlite'
import type { CatalogSnapshot } from './catalog.ts'

export interface LoginEntryInput {
  readonly home: string
  readonly action: 'login' | 'register'
  readonly centerName: string | null
  readonly loginIdentifier: string
  readonly credentialFile: string
  readonly operationId: string
}
export type LoginEntryOutcome =
  | { readonly kind: 'unconfirmed'; readonly operationId: string }
  | { readonly kind: 'governance-result'; readonly report: ActionReport }
  | {
      readonly kind: 'logged-in'
      readonly report: ActionReport
      readonly binding: TenantBinding
      readonly auth: TenantAuthOutcome
      readonly selection: 'selected' | 'conflict' | 'unconfirmed' | 'not-requested'
    }
  | { readonly kind: 'blocked'; readonly reason: string; readonly report?: ActionReport }
export interface LoginEntryResult {
  readonly outcome: LoginEntryOutcome
  readonly diagnostics: readonly Diagnostic[]
}

/** The catalog is borrowed. The private preparation assembly belongs to this action. */
export async function runLoginEntry(
  input: LoginEntryInput,
  catalog: CliCatalog,
  signal: AbortSignal,
  factory?: PreparedFactory,
): Promise<LoginEntryResult> {
  const captured = { ...input }
  if (signal.aborted) return blockedResult('input-cancelled')
  const selection = await catalog.readSelection()
  const profile = loginCenter(await catalog.listCenters(), selection.selected, captured.centerName)
  if (!profile) return blockedResult('center-required')
  const directory = join(captured.home, 'run', 'login', profile.center.centerId, 'auth')
  await prepareStateDirectory(captured.home, directory)
  return usingPreparedClient(
    { directory },
    signal,
    async assembly => {
      try {
        return await loginInAssembly(captured, catalog, selection, profile, assembly, signal)
      } catch (error) {
        if (error instanceof ClientAssemblyStopped && signal.aborted)
          return { kind: 'blocked', reason: 'input-cancelled' }
        if (error instanceof ClientAssemblyStateFailure)
          return { kind: 'blocked', reason: error.reason }
        throw error
      }
    },
    factory,
  )
}

const blockedResult = (reason: string): LoginEntryResult => ({
  outcome: { kind: 'blocked', reason },
  diagnostics: [],
})

async function loginInAssembly(
  input: LoginEntryInput,
  catalog: CliCatalog,
  selection: CatalogSnapshot,
  profile: CenterProfile,
  assembly: PreparedClientAssembly,
  signal: AbortSignal,
): Promise<LoginEntryOutcome> {
  const client = await assembly.ready
  const seed = await prepareLoginState(assembly, profile, input.operationId)
  if (seed !== undefined) return seed
  const configured = await client.runAction({
    action: 'configure',
    endpoint: profile.center.endpoint,
    trust: profile.center.trust,
  })
  if (configured.admission.reason === 'center-mismatch')
    return { kind: 'blocked', reason: 'center-mismatch', report: configured }
  if (exitStatus(configured) !== 0 || configured.local.status !== 'installed')
    return { kind: 'governance-result', report: configured }
  // Fresh public health must match the saved identity before opening a secret file.
  if (configured.origin.centerId !== profile.center.centerId)
    return { kind: 'blocked', reason: 'center-mismatch', report: configured }
  const report = await credentialAction(input, client, signal)
  if (
    input.action === 'register' ||
    exitStatus(report) !== 0 ||
    report.local.status !== 'installed'
  )
    return { kind: 'governance-result', report }
  return observeInstalledLogin(input, catalog, selection, profile, assembly, report)
}

async function prepareLoginState(
  assembly: PreparedClientAssembly,
  profile: CenterProfile,
  operationId: string,
): Promise<LoginEntryOutcome | undefined> {
  const source = await assembly.borrowState(),
    before = await source.read()
  if (before.kind !== 'read') return { kind: 'blocked', reason: before.reason }
  if (before.snapshot.value !== null) {
    return before.snapshot.value.center.centerId === profile.center.centerId
      ? undefined
      : { kind: 'blocked', reason: 'center-mismatch' }
  }
  const result = await source.compareAndReplace(
    before.snapshot.token,
    { center: profile.center, cache: [] },
    operationId,
  )
  if (result.kind === 'installed') return undefined
  if (result.kind === 'unconfirmed') return { kind: 'unconfirmed', operationId }
  return {
    kind: 'blocked',
    reason: result.kind === 'conflict' ? 'selection-changed' : result.reason,
  }
}

async function credentialAction(
  input: LoginEntryInput,
  client: import('@omne-harness-lite/governance-client-operations').GovernanceClientOperations,
  signal: AbortSignal,
): Promise<ActionReport> {
  return client.runPrepared(
    { action: input.action, payload: { loginIdentifier: input.loginIdentifier } },
    async (_preview, currentSignal) => {
      if (signal.aborted || currentSignal.aborted) return { kind: 'cancelled' }
      const credential = await readInputFile(input.credentialFile, 1024 * 1024, true, currentSignal)
      if (signal.aborted) return { kind: 'cancelled' }
      return { kind: 'continue', secrets: { credential } }
    },
  )
}

async function observeInstalledLogin(
  input: LoginEntryInput,
  catalog: CliCatalog,
  selection: CatalogSnapshot,
  profile: CenterProfile,
  assembly: PreparedClientAssembly,
  report: ActionReport,
): Promise<LoginEntryOutcome> {
  const opened = await (await assembly.ready).openUse()
  if (opened.kind === 'blocked') return { ...opened, report }
  return usingGovernanceUse(opened.use, async use => {
    const observation = await readNewSessionIdentity(use)
    if (observation.kind === 'blocked') return { ...observation, report }
    if (observation.identity.centerId !== profile.center.centerId)
      return { kind: 'blocked', reason: 'center-mismatch', report }
    return installLogin(input, catalog, selection, assembly, report, observation.identity)
  })
}

async function installLogin(
  input: LoginEntryInput,
  catalog: CliCatalog,
  selection: CatalogSnapshot,
  assembly: PreparedClientAssembly,
  report: ActionReport,
  identity: import('./session-preparation.ts').SessionIdentityObservation,
): Promise<LoginEntryOutcome> {
  let auth: TenantAuthOutcome
  try {
    auth = await prepareTenantAuth(
      input.home,
      await assembly.borrowState(),
      identity,
      input.operationId,
      'replace-same-account',
    )
  } catch (error) {
    if (error instanceof StateLayoutFailure || error instanceof ClientStateOpenFailure)
      return { kind: 'blocked', reason: error.reason, report }
    throw error
  }
  const binding: TenantBinding = {
    formatVersion: 1,
    centerId: identity.centerId,
    tenant: identity.tenant,
  }
  const ready = auth.login.kind === 'installed' || auth.login.kind === 'already-installed'
  return {
    kind: 'logged-in',
    report,
    binding,
    auth,
    selection: ready
      ? await catalog.selectTenant(selection, binding, input.operationId)
      : 'not-requested',
  }
}

export function loginCenter(
  profiles: readonly CenterProfile[],
  selected: TenantBinding | null,
  name: string | null,
): CenterProfile | undefined {
  const candidates =
    name !== null
      ? profiles.filter(profile => profile.name === name)
      : selected !== null
        ? profiles.filter(profile => profile.center.centerId === selected.centerId)
        : profiles
  return candidates.length === 1 ? candidates[0] : undefined
}
