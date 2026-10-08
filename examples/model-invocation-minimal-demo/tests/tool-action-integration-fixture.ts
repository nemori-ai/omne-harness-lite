import { mkdtemp, rm } from 'node:fs/promises'
import { AsyncLocalStorage } from 'node:async_hooks'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import type { RunnerPiece } from '@omne-harness-lite/loop-extension-runner'
import { loopExtensionRunnerPlugin } from '@omne-harness-lite/loop-extension-runner-local/cordis'
import {
  LOOP_EXTENSION_IMPLEMENTATIONS,
  LOOP_EXTENSION_RUNNER,
} from '@omne-harness-lite/loop-extension-runner/cordis'
import type { ModelRuntimeOperations } from '@omne-harness-lite/model-request-runtime'
import type {
  AccessIdentity,
  SessionAccess,
  SessionAccessOperations,
  SessionScope,
} from '@omne-harness-lite/session-tenancy'
import type { AuthorizationContext } from '@omne-harness-lite/tool-admission'
import { TOOL_ADMISSION } from '@omne-harness-lite/tool-admission/cordis'
import {
  toolAdmissionLocal,
  officialAdmission,
} from '@omne-harness-lite/tool-admission-local/cordis'
import { createAuthorizedLogOwner } from '../src/authorized-log-owner.ts'
import { createSessionLogBacking } from '../src/log-backing.ts'
import { createDemoRunnerHost } from '../src/runner-host.ts'
import {
  createDemoRunnerServiceHost,
  type DemoRunnerExternalExecution,
} from '../src/runner-service-host.ts'
import { createSessionAccessOwner } from '../src/session-access.ts'
import { createToolActionDriver } from '../src/tool-action-driver.ts'
import { readToolActionSource } from '../src/tool-action-source.ts'
import { createToolDriverJournal } from '../src/tool-driver-journal.ts'
import { toolActionHistory } from '../src/tool-driver-history.ts'
import {
  at,
  historyFixture,
  officialPiece,
  origin,
  scope,
  toolCall,
  type FixtureTool,
} from './tool-driver-history-fixture.ts'
import { actionManifest } from './tool-action-manifest-fixture.ts'
import { startRuntimeContextAssembly } from '../src/runtime-context-assembly.ts'
import { environmentRegistry } from '@omne-harness-lite/execution-environments-host/cordis'
import {
  createHostEnvironment,
  type HostNativePolicy,
} from '@omne-harness-lite/execution-environments-host'
import { hostEnvironmentMigrations } from '@omne-harness-lite/execution-environments-host/migrations'
import type { ContextSessionSeed, ContextSource } from '@omne-harness-lite/runtime-context'
import { toolResultFiles } from '@omne-harness-lite/tool-result-files/cordis'
import {
  runtimeRegistry,
  implementationRegistry,
  toolExecutionLocal,
  toolEnvironmentPlacement,
} from '@omne-harness-lite/tool-execution-local/cordis'
import { TOOL_IMPLEMENTATIONS } from '@omne-harness-lite/tool-execution-runtime/cordis'
import type { ToolExecutor } from '@omne-harness-lite/tool-execution-runtime'
import type { ToolDefinition } from '@omne-harness-lite/tool-definition'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import { tool } from './tool-driver-history-fixture.ts'
import { createToolMaintenanceRunner } from '../src/tool-maintenance-runner.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { EnvironmentProvider } from '@omne-harness-lite/execution-environments'
import { toolEnvironmentInputs } from './tool-environment-input-fixture.ts'

/** Actual Cordis providers and persistence. The model reply, external extension handles and login standing are controlled. */
export async function actionIntegrationFixture(
  options: {
    readonly calls?: ReturnType<typeof toolCall>[]
    readonly pieces?: readonly RunnerPiece[]
    readonly official?: boolean
    readonly permission?: 'auto' | 'forbid'
    readonly executor?: ToolExecutor
    readonly frameQueueBytes?: number
    readonly beforeRuntime?: (fixture: Awaited<ReturnType<typeof historyFixture>>) => Promise<void>
    readonly installRuntime?: boolean
    readonly ownedScopes?: readonly SessionScope[]
    readonly adoptedTool?: FixtureTool
    readonly contextKeys?: readonly string[]
    readonly contextSeed?: ContextSessionSeed
    readonly contextSources?: readonly ContextSource[]
    readonly environment?: {
      readonly tool: FixtureTool
      readonly providers?: readonly EnvironmentProvider[]
      readonly host?: { readonly provider: string; readonly policy?: HostNativePolicy }
    }
  } = {},
) {
  const selectedTool = options.environment?.tool ?? options.adoptedTool ?? tool
  let logAuthorization: ReturnType<typeof createSessionAccessOwner> | undefined
  const f = await historyFixture(
      options.calls,
      options.permission,
      selectedTool,
      async (_unit, access, candidate) => {
        const checked = await logAuthorization?.operations.authorize(
          access as SessionAccess,
          candidate,
          'session.log.coordinate',
        )
        return { kind: checked?.kind === 'authorized' ? 'authorized' : 'denied' }
      },
      options.environment?.host ? hostEnvironmentMigrations : [],
      options.contextSeed,
    ),
    directory = await mkdtemp(join(tmpdir(), 'omne-action-manifest-'))
  const manifest = await actionManifest(
    directory,
    options.pieces ?? [officialPiece()],
    options.ownedScopes ?? [scope],
  )
  const environmentInputs = options.environment
    ? await toolEnvironmentInputs(directory, selectedTool, manifest.sessionTenancy)
    : undefined
  const actor = {
    tenant: scope.tenant,
    account: unwrap(parseOpaqueIdentifier('history-user', 'AccountId')),
    loginState: unwrap(parseOpaqueIdentifier('action-login', 'LoginStateId')),
  }
  const policy = {
    grants: Object.freeze({}) as AuthorizationContext,
    runMode: 'auto_permission' as const,
  }
  let current: Awaited<ReturnType<typeof start>>
  async function start() {
    let authorized = true
    const borrowedLogs = new AsyncLocalStorage<
      import('@omne-harness-lite/session-log').SessionLog
    >()
    const append = vi.fn<import('@omne-harness-lite/session-log').SessionLog['append']>((...args) =>
        (borrowedLogs.getStore() ?? f.log).append(...args),
      ),
      log = { ...f.log, append }
    const backing = createSessionLogBacking(log, f.log.backing.ownerGeneration)
    const authorization = createSessionAccessOwner({
      async check(identity) {
        return authorized
          ? { kind: 'authorized', identity }
          : { kind: 'rejected', reason: 'notAuthorized' }
      },
    })
    logAuthorization = authorization
    async function issue(
      consumer: AccessIdentity['consumer'],
      operations: Parameters<ReturnType<typeof authorization.issuerFor>['issue']>[0]['operations'],
    ): Promise<SessionAccess> {
      const identity: AccessIdentity = {
        scope,
        binding: `${consumer}-binding`,
        consumer,
        principal: 'history-user',
        principalKind: 'human',
        contextKeys: options.contextKeys ?? [],
      }
      const issued = await authorization.issuerFor(identity).issue({ ...identity, operations })
      if (issued.kind !== 'issued') throw new Error('action access issue')
      return issued.access
    }
    const coordinator = await issue('coordinator', ['run.advance', 'session.log.coordinate'])
    const toolAccess = await issue('tool', [
      'tool.submit',
      'tool.read',
      'tool.stop',
      'context.read',
      'result.read',
      ...(options.environment ? (['environment.describe', 'environment.acquire'] as const) : []),
    ])
    const authority = { scope, coordinator, access: coordinator, policy }
    const owner = await createAuthorizedLogOwner({
      owner: {
        ...f.log.owner,
        async borrow(...args) {
          const held = await f.log.owner.borrow(...args)
          return held.kind === 'borrowed'
            ? {
                ...held,
                log: {
                  ...held.log,
                  append: (...params) => borrowedLogs.run(held.log, () => append(...params)),
                },
              }
            : held
        },
      },
      generation: f.log.backing.ownerGeneration,
      recovery: f.log
        .fixtureAccess as import('@omne-harness-lite/execution-environments').RecoveryAccess,
      catalog: async () => options.ownedScopes ?? [scope],
    })
    await options.beforeRuntime?.(f)
    const runnerHost = createDemoRunnerHost(log, f.log.backing.ownerGeneration),
      generation = {}
    const binding = {
      ...scope,
      log,
      readPrefix: () => f.log.fixturePrefix(scope, log),
      generation,
      currentGeneration: () => generation,
    }
    // These controlled endpoints cannot run OS commands or claim interactive answers.
    const external: DemoRunnerExternalExecution = {
      readAskState: async () => ({ kind: 'unavailable' }),
      openHandles: async () => ({
        log: unwrap(parseOpaqueIdentifier('fixture-log', 'LogHandle')),
        environment: unwrap(parseOpaqueIdentifier('fixture-environment', 'EnvironmentHandle')),
        release() {},
      }),
      mintReminder: () => ({ unavailable: true }),
      fallbackNeedsProjection: async () => false,
      commandPresence: async () => 'absent',
      invokeCommand: async () => ({ kind: 'notStartedUnavailable' }),
    }
    const maintenance = new AsyncLocalStorage<SessionScope>()
    const host = createDemoRunnerServiceHost({
      runnerHost,
      model: () => ({}) as ModelRuntimeOperations,
      manifest: manifest.manifest,
      history: manifest.history,
      sessionTenancy: manifest.sessionTenancy,
      authorize: async session => {
        const maintained = maintenance.getStore()
        if (!maintained) return { actor, binding }
        if (
          maintained.session !== session ||
          (await owner.operations.readPrefix(owner.recovery, maintained)).kind !== 'prefix'
        )
          return { unavailable: true }
        return {
          binding,
          maintenance: { scope: maintained, access: owner.recovery, external: () => external },
        }
      },
      selectedRun: () => undefined,
      now: () => at,
      actions: {
        owner: owner.operations,
        authorization: authorization.operations,
        authorize: async () => authority,
        external: async () => external,
      },
    })
    const assembly = await bootAssembly({
      services: [
        { name: 'sessionLog', value: log },
        {
          name: 'storage',
          value: { read: f.storage.read.bind(f.storage), write: f.storage.write.bind(f.storage) },
        },
        { name: 'runnerHost', value: host },
        { name: 'sessionAccess', value: authorization.operations },
        { name: 'sessionLogBacking', value: backing.operations },
        { name: 'toolActionHistory', value: toolActionHistory },
        { name: 'sessionLogOwner', value: owner.operations },
        { name: 'clock', value: { now: () => unwrap(instantFromRfc3339(at)) } },
        ...(environmentInputs
          ? [{ name: 'currentEvaluationInputs', value: environmentInputs.reader }]
          : []),
        {
          name: 'resourceRecoveryAuthority',
          value: {
            async authorizeRecovery(access: unknown, candidate: typeof scope) {
              return (await owner.operations.readPrefix(access as typeof owner.recovery, candidate))
                .kind === 'prefix'
                ? 'authorized'
                : 'notAuthorized'
            },
          },
        },
      ],
      plugins: [
        { plugin: loopExtensionRunnerPlugin, config: {} },
        { plugin: toolAdmissionLocal, config: {} },
        ...(options.official === false ? [] : [{ plugin: officialAdmission, config: {} }]),
        ...(options.executor
          ? [
              { plugin: runtimeRegistry, config: {} },
              { plugin: implementationRegistry, config: {} },
              {
                plugin: {
                  name: 'fixture-managed-context',
                  async apply(ctx: Context) {
                    const tree = await startRuntimeContextAssembly(ctx)
                    await tree.ready
                    ctx.effect(() => async () => {
                      if ((await tree.close()) === 'retained')
                        throw new Error('fixture context retained')
                    })
                  },
                },
                config: {},
              },
              { plugin: environmentRegistry, config: {} },
              ...(options.environment
                ? [
                    {
                      plugin: toolEnvironmentPlacement,
                      config: {
                        name: 'environment-fixture',
                        factoryPermission: 'always-allow',
                        selection: { kind: 'unique' },
                      },
                    },
                    {
                      plugin: {
                        name: 'fixture-environment-contributions',
                        inject: [
                          'executionEnvironments',
                          'storage',
                          'sessionAccess',
                          'runtimeContext',
                        ],
                        apply(ctx: Context) {
                          for (const source of options.contextSources ?? [])
                            ctx.runtimeContext.registerSource(source)
                          for (const provider of options.environment!.providers ?? [])
                            ctx.executionEnvironments.registerProvider(provider)
                          const host = options.environment?.host
                          if (host)
                            ctx.executionEnvironments.registerProvider(
                              createHostEnvironment({
                                name: host.provider,
                                storage: ctx.storage,
                                access: ctx.sessionAccess,
                                ...(host.policy ? { policy: host.policy } : {}),
                              }),
                            )
                        },
                      },
                      config: {},
                    },
                  ]
                : []),
              {
                plugin: toolResultFiles,
                config: { directory: join(directory, 'results'), storage: 'integration-results' },
              },
              {
                plugin: {
                  name: 'fixture-tool-contribution',
                  inject: [TOOL_IMPLEMENTATIONS],
                  apply(ctx: Context) {
                    ctx.toolImplementations.register({
                      ...selectedTool,
                      definition: selectedTool.definition,
                      executor: options.executor!,
                    })
                  },
                },
                config: {},
              },
              ...(options.installRuntime === false
                ? []
                : [
                    {
                      plugin: toolExecutionLocal({ recovery: owner.recovery }),
                      config: {
                        resultStorage: 'integration-results',
                        frameQueueBytes: options.frameQueueBytes ?? 1048576,
                        tailRetry: { attempts: 3, minDelayMs: 0, maxDelayMs: 0 },
                      },
                    },
                  ]),
            ]
          : []),
      ],
    })
    const runner = assembly.ctx.get(LOOP_EXTENSION_RUNNER),
      admission = assembly.ctx.get(TOOL_ADMISSION)
    const implementations = assembly.ctx.get(LOOP_EXTENSION_IMPLEMENTATIONS)
    if (runner === undefined || admission === undefined || implementations === undefined)
      throw new Error('Cordis action assembly missing')
    const opened = await createToolDriverJournal({
      owner: owner.operations,
      access: coordinator,
      recovery: owner.recovery,
      scope,
    })
    if (opened.kind !== 'journal') throw new Error('journal unavailable')
    const driver = createToolActionDriver({
      journal: opened,
      owner: owner.operations,
      authorization: authorization.operations,
      authority,
      runner,
    })
    const dispatch = vi.spyOn(runner, 'dispatch')
    const forPass = vi.spyOn(admission, 'forPass')
    return {
      assembly,
      runner,
      maintenanceRunner: createToolMaintenanceRunner({
        scope,
        runner,
        within: (heldScope, task) => maintenance.run(heldScope, task),
      }),
      driver,
      journal: opened,
      admission,
      implementations,
      toolAccess,
      dispatch,
      forPass,
      host,
      backing,
      owner,
      append,
      authorization: authorization.operations as SessionAccessOperations,
      coordinator,
      revoke() {
        authorized = false
      },
      restore() {
        authorized = true
      },
      source: () =>
        readToolActionSource({
          owner: owner.operations,
          authorization: authorization.operations,
          authority,
          origin,
        }),
      async close() {
        await opened.close()
        await assembly.dispose()
        owner.closeAdmission()
        await owner.drain()
        backing.closeAdmission()
        await backing.drain()
        const result = await runnerHost.close()
        if (!result.complete) throw new Error('runner physical host did not drain')
        authorization.stop()
      },
    }
  }
  current = await start()
  return {
    f,
    environmentInputs,
    get current() {
      return current
    },
    async dispatch() {
      return current.driver.dispatch(origin, new AbortController().signal)
    },
    async reopen() {
      await current.close()
      await f.reopen()
      current = await start()
    },
    async close() {
      await current.close()
      await manifest.close()
      await environmentInputs?.close()
      await f.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
}
