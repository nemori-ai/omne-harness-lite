import { isOk, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { createHash, randomUUID } from 'node:crypto'
import { officialCatalog, officialCatalogRevision } from '@omne-harness-lite/pi-ai-transport'
import {
  createCallContainerPresence,
  createSessionRunHistory,
  createSettlementCoordinator,
  type SessionDriverIdentitySource,
} from '@omne-harness-lite/session-runtime-local'
import { createModalityProjection } from '@omne-harness-lite/model-message-projection'
import { inspectContextLogEntry } from '@omne-harness-lite/runtime-context-local'
import { createRunnerTaskOwner } from '@omne-harness-lite/loop-extension-runner-local'
import { emptyAuthorizationContext } from '@omne-harness-lite/tool-admission'
import type { AccessOperation } from '@omne-harness-lite/session-tenancy'
import { startFileSessionDriverRoot, type FileSessionDriverOptions } from './session-file-root.ts'
import { createSessionContextReadGrant } from './session-context-access.ts'
import { contextSeedFromDefinition } from './session-seed.ts'
import { officialSessionDefinition } from './session-factory-assets.ts'
import { createSessionRunAssets } from './session-run-assets.ts'
import { createSessionRunRunner } from './session-run-runner.ts'
import { createSessionModelTaskOwner } from './session-model-task-owner.ts'
import {
  productionSessionModel,
  sessionClock,
  sessionModelHistory,
  sessionModelRecovery,
  sessionModelContention,
  sessionModelScheduler,
} from './session-production-model.ts'
import type { SessionRuntimeRootOptions } from './session-runtime-root-types.ts'

export interface ProductionSessionHostOptions {
  readonly home: string
  readonly binding: FileSessionDriverOptions['binding']
  readonly source: FileSessionDriverOptions['source']
  readonly governance: FileSessionDriverOptions['governance']
  readonly routeName: string
  readonly keyFile: string
  readonly diagnostic: FileSessionDriverOptions['diagnostic']
}
const coordinatedOperations: readonly AccessOperation[] = [
  'context.read',
  'run.advance',
  'session.log.coordinate',
]
function identities(): SessionDriverIdentitySource {
  const id = (kind: string, ...parts: unknown[]) =>
    kind + ':' + createHash('sha256').update(JSON.stringify(parts)).digest('hex')
  const invocation = (...parts: unknown[]) => ({
    prepareKey: id('prepare', parts),
    originalPosition: id('origin', parts),
    resultKey: id('result', parts),
    adoptionKey: id('adopt', parts),
  })
  return {
    run: (...parts) => ({ startKey: id('start', parts), attemptKey: id('attempt', parts) }),
    model: (...parts) => {
      const key = parseOpaqueIdentifier(id('creation', parts), 'CreationKey')
      if (!isOk(key)) throw new Error('Generated CreationKey rejected')
      return { ...invocation(...parts), call: id('call', parts), creationKey: key.ok }
    },
    tool: invocation,
    modelContent: {
      response: randomUUID,
      message() {
        const value = parseOpaqueIdentifier(randomUUID(), 'MessageId')
        if (!isOk(value)) throw new Error('Generated MessageId rejected')
        return value.ok
      },
    },
  }
}
function contextAccess(
  options: ProductionSessionHostOptions,
): SessionRuntimeRootOptions['contextAccess'] {
  return ingress => {
    const original = createSessionContextReadGrant(
      ingress,
      options.source,
      options.binding.tenant,
      {
        consumers: ['model', 'tool', 'coordinator'],
        policy: { maxBindings: 64, maxContextKeys: 64 },
      },
    )
    return {
      ...original,
      operations: coordinatedOperations,
      authority: {
        check(identity, operation) {
          return coordinatedOperations.includes(operation)
            ? original.authority.check(identity, 'context.read')
            : Promise.resolve({ kind: 'rejected', reason: 'notAuthorized' })
        },
      },
    }
  }
}

/** Application-owned policies and public providers for the default Session host. */
export async function startProductionSessionHost(options: ProductionSessionHostOptions) {
  const tenant = options.binding.tenant
  const nativeModel = productionSessionModel(
    {
      governance: options.governance,
      source: options.source,
      tenant,
      keyFile: options.keyFile,
      diagnostics: { record: options.diagnostic },
      onDiagnosticFailure: () => {
        throw new Error('model directory diagnostic failed')
      },
      replicaDiagnostics: {
        record: options.diagnostic,
        sinkFailure: () => {
          throw new Error('credential replica diagnostic failed')
        },
      },
    },
    officialCatalog.map(entry => entry.definition.modelId),
    options.diagnostic,
  )
  let presence: ReturnType<typeof createCallContainerPresence> | undefined
  const sources = nativeModel.sources
  return startFileSessionDriverRoot({
    home: options.home,
    binding: options.binding,
    source: options.source,
    governance: options.governance,
    inputSource: {
      storeKey: 'cli-official-inputs',
      deployedOfficial: [],
      diagnostics: options.diagnostic,
      onDiagnosticFailure: () => {
        throw new Error('Session input diagnostic failed')
      },
      monotonicNow: process.hrtime.bigint,
    },
    contextSeed: contextSeedFromDefinition,
    creation: {
      definition: officialSessionDefinition,
      executionType: 'terminal',
      mode: 'never',
      collaboration: 'co-work',
    },
    runtimePolicy: {
      maxSessions: 16,
      maxRecordBytes: 1_048_576,
      maxInFlight: 16,
      maxSteps: 256,
      state: { maxPendingPerSession: 16, maxBatchSize: 16, maxRecordBytes: 1_048_576 },
      receipts: { maxRecords: 256, maxRecordBytes: 1_048_576 },
    },
    admissionPolicy: { maxLogins: 16, maxTickets: 256, maxRecordBytes: 65_536 },
    logOperationLimit: 256,
    contextAccess: contextAccess(options),
    initialRouteName: options.routeName,
    nativeModel: {
      ...nativeModel,
      sources(calls, clock) {
        presence = createCallContainerPresence(calls)
        return sources(calls, clock)
      },
    },
    model: {
      maxInFlight: 16,
      maxRecords: 128,
      maxCaptures: 16,
      retainReferencesIn: async (_unit, _scope, pending) =>
        pending.reply.blocks.every(block => block.kind === 'text' || block.kind === 'thinking')
          ? 'retained'
          : 'unavailable',
    },
    maxHeld: 16,
    transport: {
      maxRequestBytes: 1_048_576,
      maxResponseBytes: 4_194_304,
      maxConnections: 8,
      maxInFlight: 8,
      requestTimeoutMs: 10_000,
      headersTimeoutMs: 5000,
      idleTimeoutMs: 5000,
      checkIntervalMs: 100,
      maxFailureRecords: 16,
      maxHeaderBytes: 8192,
    },
    diagnostic: options.diagnostic,
    configure: async (owners, pool, _work, files) => {
      const directory = pool.directory
      if (!directory || !presence) throw new Error('actual model sources unavailable')
      const actualPresence = presence
      const now = sessionClock(files.clock)
      return {
        policy: {
          scanLimit: 16,
          intervalMs: 20,
          maxTasks: 4,
          maxHeld: 16,
          maxFailures: 16,
          maxStepsPerPass: 16,
        },
        identities: identities(),
        model: {
          maxCallReads: 8,
          settlement: {
            create: binding =>
              createSettlementCoordinator({
                ...binding,
                settlementContention: sessionModelContention,
                settlementScheduler: sessionModelScheduler,
                diagnostic: options.diagnostic,
              }),
          },
        },
        tools: { acquire: async () => ({ unavailable: true }) },
        sources: {
          acquire: async (scope, journal) => {
            const assets = createSessionRunAssets({
              bootstrap: owners.bootstrap,
              journal,
              tenancy: owners.ingress.tenancy,
              initialFillRef: 'fill:' + journal.run,
              evaluation: { toolEnvironmentPermission: 'never-allow' },
              registry: {
                manifest: owners.manifest,
                deployedMeta: [],
                clock: files.clock,
                diagnostic: options.diagnostic,
                diagnosticFailure: () => {
                  throw new Error('asset diagnostic failed')
                },
                monotonicNow: process.hrtime.bigint,
                conflictPolicy: { maxRetries: 0 },
                maxInFlight: 8,
              },
            })
            const selection = createSessionModelTaskOwner('cli-session-selection')
            let runner: ReturnType<typeof createSessionRunRunner> | undefined
            let runnerTasks: ReturnType<typeof createRunnerTaskOwner> | undefined
            let access: Awaited<ReturnType<typeof owners.contextAccess.issuer.issue>> | undefined
            async function release() {
              await runner?.close()
              if (runnerTasks) {
                runnerTasks.closeAdmission()
                await runnerTasks.drain()
              }
              const stopped = await selection.close()
              if ('unavailable' in stopped) throw new Error('model selection resources retained')
              if (access?.kind === 'issued') owners.contextAccess.issuer.revoke(access.access)
              await assets.close()
            }
            try {
              const bound = await assets.ready
              const context = owners.bootstrap.context(scope)
              if ('unavailable' in bound || !context) {
                await release()
                return { unavailable: true }
              }
              access = await owners.contextAccess.issuer.issue({
                principal: options.source.accountId,
                principalKind: 'human',
                scope,
                consumer: 'coordinator',
                contextKeys: [],
                operations: coordinatedOperations,
              })
              if (access.kind !== 'issued') {
                await release()
                return { unavailable: true }
              }
              const toolAccess = access.access
              const admission = { grants: emptyAuthorizationContext(), runMode: 'never' as const }
              runnerTasks = createRunnerTaskOwner({
                ...scope,
                logGeneration: owners.log.backing.ownerGeneration,
              })
              runner = createSessionRunRunner({
                journal,
                assets: bound,
                manifest: owners.manifest,
                tenancy: owners.ingress.tenancy,
                backing: owners.log.backing,
                access: owners.contextAccess.operations,
                toolAccess: () => toolAccess,
                taskOwner: runnerTasks,
                admission,
                ports: {
                  readAskState: async () => ({ kind: 'unavailable' }),
                  openHandles: async () => ({ unavailable: true }),
                  verifyFailure: async () => ({ kind: 'unavailable' }),
                  judgeCapabilities: async () => ({ kind: 'unavailable' }),
                  now,
                  mintReminder: randomUUID,
                  fallbackNeedsProjection: async () => ({ unavailable: true }),
                  invokeCommand: async () => ({ kind: 'notStartedUnavailable' }),
                  commandPresence: async () => 'absent',
                },
                readMessagePrefix: async () => ({ unavailable: true }),
                subjectForCandidate: () => ({ unavailable: true }),
                isActive: () => context.currentGeneration() !== null,
              })
              const actions = await runner.ready
              if ('unavailable' in actions) {
                await release()
                return { unavailable: true }
              }
              return {
                scope,
                run: journal.run,
                evaluation: bound.input,
                registry: bound.registry,
                context: await context.ready,
                contextGeneration: context.currentGeneration,
                toolAccess,
                actions: { runner: actions.runner, host: actions.host, admission },
                providers: {
                  ...directory,
                  tools: { lookup: async () => ({ failure: 'unavailable' }) },
                  sourceVersions: { cliDefinition: '2', catalog: String(officialCatalogRevision) },
                },
                selection: {
                  owner: selection,
                  concurrent: 8,
                  sessionTenancy: owners.ingress.tenancy,
                  catalog: directory.catalog,
                  projection: createModalityProjection(scope),
                  compatible: (profile, modalities) => {
                    const blocked = modalities.filter(
                      value => !profile.inputModalities.includes(value),
                    )
                    return blocked.length ? { blocked } : { ok: true }
                  },
                  now,
                  diagnostic: options.diagnostic,
                  onDiagnosticFailure: () => {
                    throw new Error('model selection diagnostic failed')
                  },
                },
                host: {
                  history: { ...sessionModelHistory, run: createSessionRunHistory(scope) },
                  recovery: sessionModelRecovery,
                  callPresence: actualPresence,
                },
                projection: {
                  rules: {
                    version: 'cli-session-v1',
                    external: null,
                    system: [],
                    pendingCardBlocks: null,
                    lastModelRequestPrefixLength: null,
                  },
                  options: {
                    factReaders: new Map([
                      [
                        'runtime-context',
                        (_value, entry) =>
                          'event' in inspectContextLogEntry(scope, entry) ? 'valid' : 'invalid',
                      ],
                    ]),
                  },
                },
                release,
              }
            } catch (error) {
              try {
                await release()
              } catch (cleanup) {
                throw new AggregateError([error, cleanup], 'Run startup and cleanup failed')
              }
              throw error
            }
          },
        },
      }
    },
  })
}
