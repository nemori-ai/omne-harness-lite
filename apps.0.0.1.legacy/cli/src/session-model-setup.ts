import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import type { GovernanceClientOperations } from '@omne-harness-lite/governance-client-operations'
import type { AdmissionSource } from '@omne-harness-lite/session-runtime-local'
import type { SqlStorage } from '@omne-harness-lite/storage-sql'
import { openLeaseClock, type LeaseClock } from '@omne-harness-lite/clock-lease'
import { officialCatalog } from '@omne-harness-lite/pi-ai-transport'
import type { GovernanceDialog } from './governance-input.ts'
import { readInputFile } from './input.ts'
import { InputFailure } from './diagnostic.ts'
import {
  checkExistingTenantAuth,
  prepareStateDirectory,
  StateLayoutFailure,
  type TenantBinding,
} from './state-layout.ts'
import { checkedDirectory, checkPrivateFile, ioCode } from './state-layout-files.ts'
import { checkCatalogFiles } from './catalog-files.ts'
import {
  claimRuntimeFile,
  openRuntimeDatabase,
  sessionTenantMigrations,
} from './session-runtime-files.ts'
import { createSessionModelDirectory } from './session-model-directory.ts'
import { parseRunLoginBinding } from './session-preparation.ts'

export interface SessionModelSetupOptions {
  readonly home: string
  readonly binding: TenantBinding
  readonly source: AdmissionSource
  readonly governance: GovernanceClientOperations
  readonly dialog: GovernanceDialog
  readonly signal: AbortSignal
  readonly originalId: () => string
  readonly maxCredentialBytes: number
  readonly maxChoices: number
}
export type SessionModelSetupResult =
  | {
      readonly kind: 'configured'
      readonly routeName: string
      readonly keyFile: string
      readonly credentialPresent: boolean
    }
  | { readonly kind: 'blocked'; readonly reason: string; readonly credentialRef?: string }

type Directory = ReturnType<typeof createSessionModelDirectory>
class ModelSetupFiles {
  storage?: SqlStorage
  clock?: LeaseClock
  directory?: Directory
  async open(options: SessionModelSetupOptions): Promise<string> {
    const paths = await checkExistingTenantAuth(options.home, options.binding)
    for (const directory of [paths.data, paths.run, paths.credentials])
      await prepareStateDirectory(options.home, directory)
    const keyFile = join(paths.credentials, 'model-replica.key')
    await prepareReplicaKey(keyFile, paths.credentials)
    this.storage = await openRuntimeDatabase(paths.runtime, sessionTenantMigrations)
    const file = join(paths.run, 'clock.sqlite')
    const initialize = await claimRuntimeFile(file)
    await checkCatalogFiles(file)
    this.clock = await openLeaseClock({ file, ...(initialize ? { initialize: {} } : {}) })
    this.directory = createSessionModelDirectory(this.storage, this.clock, {
      governance: options.governance,
      source: options.source,
      tenant: options.binding.tenant,
      keyFile,
      diagnostics: { record() {} },
      onDiagnosticFailure() {
        throw new Error('model setup diagnostic failed')
      },
      replicaDiagnostics: {
        record() {},
        sinkFailure() {
          throw new Error('model replica diagnostic failed')
        },
      },
    })
    await this.directory.ready
    return keyFile
  }
  async close(): Promise<void> {
    await this.directory?.close()
    await this.clock?.close()
    await this.storage?.close()
  }
}

/** Prepare this tenant's local encryption key. Existing material is never replaced. */
async function prepareReplicaKey(path: string, directory: string): Promise<void> {
  let file,
    created = false
  try {
    try {
      file = await open(
        path,
        constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW,
        0o600,
      )
      created = true
    } catch (error) {
      if (ioCode(error) !== 'EEXIST') throw error
      file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    }
    await checkPrivateFile(file)
    if (created) {
      const key = randomBytes(32)
      try {
        await file.writeFile(key)
        await file.sync()
      } finally {
        key.fill(0)
      }
    }
    if ((await file.stat()).size !== 32) throw new StateLayoutFailure('unsafe-path')
  } finally {
    await file?.close()
  }
  const parent = await checkedDirectory(directory, true)
  try {
    await parent.sync()
  } finally {
    await parent.close()
  }
}

export async function prepareSessionModel(
  options: SessionModelSetupOptions,
): Promise<SessionModelSetupResult> {
  checkSetupInput(options)
  if (options.signal.aborted) return cancelled()
  const owner = new ModelSetupFiles()
  let failed = false,
    failure: unknown
  try {
    const keyFile = await owner.open(options)
    const directory = owner.directory!
    const route = await chooseModel(directory, options)
    if (typeof route !== 'string') return route
    const credentials = await prepareCredential(directory, options)
    if (credentials.kind === 'blocked') return credentials
    if (options.signal.aborted) return cancelled()
    return { kind: 'configured', routeName: route, keyFile, credentialPresent: credentials.present }
  } catch (error) {
    failed = true
    failure = error
    throw error
  } finally {
    try {
      await owner.close()
    } catch (close) {
      if (failed) throw new AggregateError([failure, close], 'model setup and close failed')
      throw close
    }
  }
}
function checkSetupInput(options: SessionModelSetupOptions): void {
  const source = parseRunLoginBinding(options.source)
  if (
    !source ||
    source.centerId !== options.binding.centerId ||
    source.accountId !== options.binding.tenant.account
  )
    throw new TypeError('model setup requires the fixed current identity')
  for (const limit of [options.maxCredentialBytes, options.maxChoices])
    if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError('invalid model setup limit')
}
async function chooseModel(
  directory: Directory,
  options: SessionModelSetupOptions,
): Promise<string | Extract<SessionModelSetupResult, { kind: 'blocked' }>> {
  const read = await directory.ready
  const rows = await read.catalog.listProfiles(options.binding.tenant)
  if ('failure' in rows) return { kind: 'blocked', reason: rows.failure }
  const choices = rows.filter(
    row =>
      row.profile.registration === 'listed' &&
      officialCatalog.some(entry => entry.definition.modelId === row.profile.routeName),
  )
  if (!choices.length || choices.length > options.maxChoices)
    return {
      kind: 'blocked',
      reason: choices.length ? 'model-choice-capacity' : 'no-registered-model',
    }
  const selected = await options.dialog.choose(
    'Select model',
    choices.map(row => row.profile.routeName),
  )
  if (selected === undefined || options.signal.aborted) return cancelled()
  const row = choices[selected]
  if (!Number.isSafeInteger(selected) || !row) throw new Error('invalid model choice')
  return row.profile.routeName
}
async function prepareCredential(
  directory: Directory,
  options: SessionModelSetupOptions,
): Promise<
  { kind: 'credential'; present: boolean } | Extract<SessionModelSetupResult, { kind: 'blocked' }>
> {
  const read = await directory.ready
  const current = await read.credentials.value(options.binding.tenant, 'official')
  if ('value' in current) {
    current.value.fill(0)
    return { kind: 'credential', present: true }
  }
  if (current.failure !== 'credentialUnavailable')
    return { kind: 'blocked', reason: current.failure }
  const selected = await options.dialog.choose('Model credential is missing', [
    'Provide a protected credential file',
    'Continue without a credential',
  ])
  if (selected === undefined || options.signal.aborted) return cancelled()
  if (selected === 1) return { kind: 'credential', present: false }
  if (selected !== 0) throw new Error('invalid credential choice')
  return publishCredentialFile(directory, options)
}
async function publishCredentialFile(
  directory: Directory,
  options: SessionModelSetupOptions,
): Promise<
  { kind: 'credential'; present: true } | Extract<SessionModelSetupResult, { kind: 'blocked' }>
> {
  const path = await options.dialog.text('OpenRouter credential file', [
    'Enter a protected file path. Do not enter the credential itself.',
  ])
  if (path === undefined || options.signal.aborted) return cancelled()
  if (
    !(await options.dialog.show('Store model credential', [
      'Save this credential for the current tenant on this machine.',
    ]))
  )
    return cancelled()
  if (options.signal.aborted) return cancelled()
  const text = await readInputFile(path, options.maxCredentialBytes, true, options.signal)
  if (!text.length) throw new InputFailure('secret-source')
  const body = Buffer.from(text, 'utf8')
  try {
    const result = await directory.publishCredential({ credentialRef: options.originalId(), body })
    return result.kind === 'stored'
      ? { kind: 'credential', present: true }
      : {
          kind: 'blocked',
          reason: `model-credential-${result.kind}`,
          credentialRef: result.credentialRef,
        }
  } finally {
    body.fill(0)
  }
}
function cancelled(): Extract<SessionModelSetupResult, { kind: 'blocked' }> {
  return { kind: 'blocked', reason: 'input-cancelled' }
}
