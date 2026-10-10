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
import { inspectRunnerConclusion } from '@omne-harness-lite/loop-extension-runner'
import { toolJournalFormat } from '@omne-harness-lite/tool-execution-runtime'
import { SHELL_CONTEXT_KEY } from '@omne-harness-lite/meta-shell'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { tenantPaths } from './state-layout.ts'
import { join } from 'node:path'
import { createProductionSessionTools } from './session-production-tools.ts'
import { registerSessionWorkspace } from './session-workspace-source.ts'
import {
  emptyAuthorizationContext,
  OFFICIAL_ADMISSION_NAME,
} from '@omne-harness-lite/tool-admission'
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
  'tool.submit',
  'tool.read',
  'tool.stop',
  'tool.answer',
  'environment.describe',
  'environment.acquire',
  'result.read',
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
    tool: (...parts) => ({
      ...invocation(...parts),
      originalPosition: toolJournalFormat + '/' + JSON.stringify(['execution_intended', parts[4]]),
    }),
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
  const tools = createProductionSessionTools(
    tenant,
    join(tenantPaths(options.home, options.binding).data, 'tool-results'),
  )
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
    tools: tools.options,
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
        pending.reply.blocks.every(
          block => block.kind === 'text' || block.kind === 'thinking' || block.kind === 'tool_call',
        )
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
      await tools.open(owners, files)
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
        tools: tools.factory,
        sources: {
          acquire: async (scope, journal) => {
            const assets = createSessionRunAssets({
              bootstrap: owners.bootstrap,
              journal,
              tenancy: owners.ingress.tenancy,
              initialFillRef: 'fill:' + journal.run,
              evaluation: { toolEnvironmentPermission: 'always-allow' },
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
            let workspace: Awaited<ReturnType<typeof registerSessionWorkspace>> | undefined
            let unregisterToolRun: (() => void) | undefined
            async function release() {
              await runner?.close()
              unregisterToolRun?.()
              await workspace?.dispose()
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
                consumer: 'tool',
                contextKeys: [SHELL_CONTEXT_KEY],
                operations: coordinatedOperations,
              })
              if (access.kind !== 'issued') {
                await release()
                return { unavailable: true }
              }
              const toolAccess = access.access
              const runtimeContext = await context.ready
              workspace = await registerSessionWorkspace(runtimeContext, journal)
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
                  openHandles: async piece => {
                    if (piece.definition.name !== OFFICIAL_ADMISSION_NAME)
                      return { unavailable: true }
                    const log = parseOpaqueIdentifier(randomUUID(), 'LogHandle')
                    const environment = parseOpaqueIdentifier(randomUUID(), 'EnvironmentHandle')
                    if (!isOk(log) || !isOk(environment))
                      throw new Error('invalid original Run handle')
                    return { log: log.ok, environment: environment.ok, release() {} }
                  },
                  verifyFailure: async () => ({ kind: 'unavailable' }),
                  judgeCapabilities: async (_input, output) =>
                    output.kind === 'observed' ? { kind: 'accepted' } : { kind: 'unavailable' },
                  now,
                  mintReminder: randomUUID,
                  fallbackNeedsProjection: async () => ({ unavailable: true }),
                  invokeCommand: async () => ({ kind: 'notStartedUnavailable' }),
                  commandPresence: async () => 'absent',
                },
                readMessagePrefix: async () => ({ unavailable: true }),
                subjectForCandidate: (request, entry, action) => {
                  const payload = copyJsonValue(entry.payload)
                  if ('failed' in payload) return { unavailable: true }
                  const read = inspectRunnerConclusion({
                    ...scope,
                    entry: { ...entry, payload: payload.ok, session: scope.session, position: 1 },
                  })
                  if (!('conclusion' in read) || request.position !== 'before_action' || !action)
                    return { unavailable: true }
                  const call = action.calls.find(value => value.callId === read.conclusion.callId)
                  return call
                    ? {
                        position: 'before_action',
                        subject: {
                          call,
                          definition: { name: call.tool },
                          batch: [
                            action.calls[0].callId,
                            ...action.calls.slice(1).map(value => value.callId),
                          ],
                        },
                      }
                    : { unavailable: true }
                },
                isActive: () => context.currentGeneration() !== null,
              })
              const actions = await runner.ready
              if ('unavailable' in actions) {
                await release()
                return { unavailable: true }
              }
              unregisterToolRun = tools.registerRun({
                scope,
                run: journal.run,
                input: bound.input,
                context: runtimeContext,
                admission: actions.admission,
              })
              return {
                scope,
                run: journal.run,
                evaluation: bound.input,
                registry: bound.registry,
                context: runtimeContext,
                contextGeneration: context.currentGeneration,
                toolAccess,
                actions: { runner: actions.runner, host: actions.host, admission },
                providers: {
                  ...directory,
                  tools: bound.registry,
                  sourceVersions: { cliDefinition: '3', catalog: String(officialCatalogRevision) },
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
