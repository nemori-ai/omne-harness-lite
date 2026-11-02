// Assembly fixture of the session-side row tests. `loadTree` starts the given rows with the given
// entry objects under the trust table of the release (`serveProfile().visibility`), as
// `loadStorageTree` does for the storage rows, and hands out the root, the row states and the
// ordered shutdown. `storageRows` is the real storage, the authorization double and the real
// `session-storage` row that most session-side rows need below them. It does not import vitest.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { ScriptedSessionAccessCheck } from '@omne-harness/session-contract/testing'
import { cursorSigning } from '../../../src/entry/cursor-signing.ts'
import {
  principalIssuer,
  principalVerifier,
  sessionPrincipals,
} from '../../../src/entry/principals.ts'
import { sessionWorkPrincipals } from '../../../src/entry/session-work-principals.ts'
import { storageHost } from '../../../src/entry/storage-host.ts'
import { LifecycleRegistry, S0AssemblyLifecycleService } from '../../../src/lifecycle.ts'
import { disposeTree, startTree, type EntryObject, type RowSpec } from '../../../src/loader.ts'
import { serveProfile } from '../../../src/profile.ts'
import { sessionStorageRow } from '../../../src/rows/session-storage/index.ts'
import { storageRow } from '../../../src/rows/storage/index.ts'
import { monotonicClock, runShutdown, type ShutdownReport } from '../../../src/shutdown.ts'
import { createTrust } from '../../../src/trust.ts'
import type {
  EntryEnv,
  EntryObjectModule,
  LifecyclePhase,
  RowId,
  RowState,
  ServiceName,
} from '../../../src/types.ts'
import {
  accessPolicyRow,
  allowAll,
  declared,
  providerConfig,
  type AccessPolicy,
} from '../storage/fixtures/tree.ts'

export { declared }

/** The entry objects of the storage rows and of the principals, which every tree below needs. */
export const BASE_ENTRY_OBJECTS: readonly EntryObjectModule[] = [
  storageHost,
  cursorSigning,
  principalVerifier,
  principalIssuer,
  sessionPrincipals,
  sessionWorkPrincipals,
]

export type Base = Readonly<{ stateRoot: string; storageRoot: string; directoryFile: string }>

/** A fresh state and storage directory; `release` removes it. */
export function makeBase(): Base & Readonly<{ release(): void }> {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'rows-session-')))
  const stateRoot = dir
  const storageRoot = join(dir, 'storage')
  return {
    stateRoot,
    storageRoot,
    directoryFile: join(storageRoot, 'tenant-domains.json'),
    release: () => rmSync(dir, { recursive: true, force: true }),
  }
}

export type StorageRows = Readonly<{
  specs: readonly RowSpec[]
  check: ScriptedSessionAccessCheck<string>
}>

/** `storage`, the `authorization` contract double and `session-storage`, in load order. */
export function storageRows(base: Base, policy: AccessPolicy = allowAll): StorageRows {
  const access = accessPolicyRow(policy)
  return {
    check: access.check,
    specs: [
      declared(storageRow, providerConfig(base.storageRoot)),
      declared(access.plugin),
      declared(sessionStorageRow, {
        combinationVersion: 'session-composite/1',
        directoryFile: base.directoryFile,
        domainRule: 'organization-account/1',
      }),
    ],
  }
}

export type TreeOptions = Readonly<{
  base: Base
  rows: readonly RowSpec[]
  entryObjects?: readonly EntryObjectModule[]
  readinessTimeoutMs?: number
  /** Extra trusted names for a probe row of this test, on top of the table of the release. */
  visibility?: ReadonlyMap<RowId, readonly ServiceName[]>
}>

export type LoadedTree = Readonly<{
  root: Context
  allActive: boolean
  registry: LifecycleRegistry
  service<T>(name: ServiceName): T | undefined
  state(id: string): RowState
  shutdown(deadlineMs?: number): Promise<ShutdownReport>
  dispose(): Promise<void>
}>

export async function loadTree(options: TreeOptions): Promise<LoadedTree> {
  const profile = serveProfile()
  const root = new Context()
  const trust = createTrust(
    [...new Set([...profile.visibility.values()].flat())].map(name => ({
      id: name,
      names: [name],
    })),
    new Map([...profile.visibility, ...(options.visibility ?? [])]),
  )
  const expected = new Map<RowId, LifecyclePhase>()
  for (const spec of options.rows) {
    if (spec.manifest.phase !== null) expected.set(spec.row.id, spec.manifest.phase)
  }
  const registry = new LifecycleRegistry({ expected, clock: monotonicClock, requestStop: () => {} })
  await root.plugin(S0AssemblyLifecycleService, registry)
  const made = new Map<symbol, unknown>()
  const env: EntryEnv = {
    stateRoot: options.base.stateRoot,
    readTrusted: name => trust.contextForName(root, name),
    once: <T>(key: symbol, create: () => T): T => {
      if (!made.has(key)) made.set(key, create())
      return made.get(key) as T
    },
  }
  const entryObjects: EntryObject[] = (options.entryObjects ?? BASE_ENTRY_OBJECTS).map(module => ({
    name: module.name,
    implementation: module.implementation,
    registersFor: module.registersFor ?? [],
    install: scope => module.install(scope, env),
  }))
  const result = await startTree({
    root,
    trust,
    rows: options.rows,
    entryObjects,
    readinessTimeoutMs: options.readinessTimeoutMs ?? 10_000,
    barrier: () => {},
  })
  if (result.kind !== 'started') throw new Error(`tree did not start: ${result.kind}`)
  let disposed = false
  const dispose = async () => {
    if (disposed) return
    disposed = true
    await disposeTree(root, result.rows)
  }
  return {
    root,
    allActive: result.report.rows.every(row => row.state === 'ACTIVE'),
    registry,
    service: <T>(name: ServiceName): T | undefined => root.get(name) as T | undefined,
    state: id => {
      const found = result.report.rows.find(row => row.id === id)
      if (found === undefined) throw new Error(`no row ${id}`)
      return found
    },
    shutdown: (deadlineMs = 5000) =>
      runShutdown(registry, expected, deadlineMs, monotonicClock, { disposeRoot: dispose }),
    dispose,
  }
}
