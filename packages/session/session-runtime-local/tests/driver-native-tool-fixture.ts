import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import type { CallId } from '@omne-harness-lite/content-blocks'
import { join } from 'node:path'
import { vi } from 'vitest'
import { unwrap, tenantIdEquals, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { createToolAdmission } from '@omne-harness-lite/tool-admission-local'
import type { ToolActionHistoryOperations } from '@omne-harness-lite/tool-admission'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import type { SessionLogBackingOperations } from '@omne-harness-lite/session-log'
import type {
  SessionAccess,
  SessionAccessOperations,
  SessionScope,
} from '@omne-harness-lite/session-tenancy'
import {
  createAssemblyManifestStore,
  assemblyManifestMigrations,
} from '@omne-harness-lite/assembly-manifest-store'
import {
  createOriginalIssueToolRuntime,
  createToolImplementationRegistry,
  createToolInvoker,
  createToolOriginalIssueVerifier,
  toolOriginalIssueMigrations,
} from '@omne-harness-lite/tool-execution-local'
import {
  openToolResultStorage,
  openToolResultCustodySource,
} from '@omne-harness-lite/tool-result-files'
import {
  createParameterJudge,
  isToolReturn,
  toolResultOf,
} from '@omne-harness-lite/tool-definition'
import type {
  ToolRuntimeOriginalIssueDependencies,
  ToolExecutor,
} from '@omne-harness-lite/tool-execution-runtime'
import { createRunnerTaskOwner } from '@omne-harness-lite/loop-extension-runner-local'
import type { LocalSessionIngress } from '../src/runtime-types.ts'
import type { BorrowedRunJournal } from '../src/run-journal-types.ts'
import type { SessionDriverToolFactory } from '../src/driver-types.ts'

/** Actual native runtime, admission decoder, manifest and file results; root authority and author are controlled. */
export async function driverNativeToolFixture(input: {
  readonly storage: AtomicStorage
  readonly root: string
  readonly ingress: LocalSessionIngress
  readonly backing: SessionLogBackingOperations
  readonly journal: BorrowedRunJournal
  readonly history: ToolActionHistoryOperations
  readonly call: CallId
  readonly execute?: ToolExecutor
}) {
  const scope = input.journal.scope,
    generation = input.backing.ownerGeneration
  for (const migration of [...toolOriginalIssueMigrations, ...assemblyManifestMigrations])
    await input.storage.write(tx => migration.migration.up(tx.db))
  const access = Object.freeze({}) as SessionAccess
  const recovery = Object.freeze({}) as ToolRuntimeOriginalIssueDependencies['recovery']
  const authorization: SessionAccessOperations = {
    authorize: async (candidate, target) =>
      candidate === access &&
      target.session === scope.session &&
      tenantIdEquals(target.tenant, scope.tenant)
        ? {
            kind: 'authorized',
            identity: {
              binding: 'controlled-tool-root',
              principal: scope.tenant.account,
              principalKind: 'human',
              scope,
              consumer: 'tool',
              contextKeys: [],
            },
          }
        : { kind: 'rejected', reason: 'notAuthorized' },
  }
  const prefix = async () => {
    const current = await input.journal.readPrefix()
    if ('failure' in current) throw new Error('actual Tool prefix unavailable')
    return { scope, ownerGeneration: generation, entries: current.entries, tail: current.tail }
  }
  const facts = input.history.inspect(await prefix(), input.call)
  if (facts.kind !== 'known') throw new Error('actual whole Tool action facts missing')
  const manifest = createAssemblyManifestStore(input.storage)
  const root = { category: 'agent_definition' as const, name: 'controlled-native-driver-root' }
  const filled = await manifest.append(scope.session, 0, {
    evaluation: { kind: 'given', ref: 'controlled-driver-after-action' },
    tables: {
      loop_extension: {
        filledAt: unwrap(instantFromRfc3339('2026-10-08T00:00:00Z')),
        composition: [],
      },
    },
    content: {
      evaluation: {
        root,
        assets: [
          {
            capability: root,
            asset: 'controlled-driver-root',
            version: 1,
            from: 'factory',
            replaced: [],
          },
        ],
        composition: [],
        values: [],
        filteredOut: [],
        unresolved: [],
      },
      compositionOrder: [],
      filledBy: { kind: 'assembly' },
    },
  })
  if ('failure' in filled) throw new Error('actual empty after-action manifest rejected')
  const files = await openToolResultStorage(
    { directory: join(input.root, 'driver-results'), storage: 'driver-results' },
    {
      authorization,
      backing: input.backing,
      history: input.history,
      recoveryAuthority: {
        authorizeRecovery: async candidate =>
          candidate === recovery ? 'authorized' : 'notAuthorized',
      },
    },
  )
  const admission = createToolAdmission({
    access: authorization,
    backing: input.backing,
    history: input.history,
    source: { read: async () => ({ kind: 'rejected', reason: 'passUnavailable' }) },
  })
  const registry = createToolImplementationRegistry()
  const author = vi.fn<ToolExecutor>(input.execute ?? (async () => 'actual driver native result'))
  const withdraws = facts.facts.adoption.tools.map(tool =>
    registry.register({
      capability: tool.capability,
      asset: tool.asset,
      version: tool.version,
      definition: tool.definition,
      executor: author,
    }),
  )
  const binding = { ...scope, logGeneration: generation }
  const taskOwner = createRunnerTaskOwner(binding)
  let native: ReturnType<typeof createOriginalIssueToolRuntime> | undefined
  let custody: Awaited<ReturnType<typeof openToolResultCustodySource>> | undefined
  const release = vi.fn(async () => {})
  const acquire: SessionDriverToolFactory['acquire'] = vi.fn(async originalIssue => {
    if (native) throw new Error('original driver pool acquired twice')
    native = createOriginalIssueToolRuntime(
      {
        frameQueueBytes: 4096,
        tailRetry: { attempts: 2, minDelayMs: 0, maxDelayMs: 0 },
        resultStorage: 'driver-results',
      },
      {
        originalIssue,
        tenant: scope.tenant,
        recoveryPageSize: 16,
        authorization,
        recovery,
        admission: () => admission,
        implementations: registry,
        context: {
          bind: async () => ({
            kind: 'bound',
            reader: {
              read: async () => ({ kind: 'values', values: [] }),
              snapshot: async () => ({ kind: 'rejected', reason: 'unavailable' }),
              changes: async () => ({ kind: 'rejected', reason: 'unavailable' }),
            },
          }),
        },
        environments: {
          recover: async () => [],
          recoverOwned: async () => ({ kind: 'recovered', values: [], failures: [] }),
          resolvePlacement: async () => ({ kind: 'notApplicable' }),
          acquire: async () => ({ kind: 'rejected', reason: 'unavailable' }),
        },
        results: files.operations,
        invoke: createToolInvoker({
          parameters: createParameterJudge(),
          judgeResult: value =>
            isToolReturn(value)
              ? {
                  kind: 'valid',
                  result:
                    typeof value === 'string'
                      ? value
                      : toolResultOf(
                          value,
                          unwrap(parseOpaqueIdentifier('driver-tool-result', 'BlockId')),
                        ),
                }
              : { kind: 'invalid' },
        }),
        clock: { now: async () => unwrap(instantFromRfc3339('2026-10-08T00:00:00Z')) },
      },
    )
    custody = await openToolResultCustodySource(
      { directory: join(input.root, 'driver-results'), storage: 'driver-results' },
      {
        storage: input.storage,
        log: originalIssue.log,
        access: originalIssue.access,
        original: createToolOriginalIssueVerifier(input.storage),
      },
    )
    return { tenant: scope.tenant, runtime: native, release }
  })
  return {
    factory: { acquire },
    access,
    author,
    release,
    files,
    prefix,
    get native() {
      return native
    },
    get custody() {
      return custody
    },
    async close() {
      await native?.close()
      await custody?.close()
      await admission.close()
      await files.close()
      for (const withdraw of withdraws) withdraw()
      taskOwner.closeAdmission()
      await taskOwner.drain()
      await manifest.close()
    },
  }
}
