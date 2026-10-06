import type { Context, Fiber } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { FIBER_STATE, definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import {
  createAssemblyLifetime,
  type AssemblyLifetime,
} from '@omne-harness-lite/assembly-lifecycle'
import {
  ASSEMBLY_LIFETIME_SERVICE,
  startAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import {
  composePluginTree,
  type AssemblyDeclaration,
  type PluginRow,
} from '@omne-harness-lite/cordis-plugin-tree'
import {
  preparePluginTree,
  loadPluginTree,
  inspectPluginTree,
} from '@omne-harness-lite/cordis-plugin-tree/cordis'
import {
  officialAdmission,
  inspectAdmissionPublication,
} from '@omne-harness-lite/tool-admission-local/cordis'
import {
  ToolActionHistoryService,
  TOOL_ACTION_HISTORY,
  TOOL_ADMISSION,
  TOOL_ADMISSION_PASS_SOURCE,
} from '@omne-harness-lite/tool-admission/cordis'
import {
  ResourceRecoveryAuthorityService,
  RESOURCE_RECOVERY_AUTHORITY,
} from '@omne-harness-lite/execution-environments/cordis'
import type {
  RecoveryAccess,
  ResourceRecoveryAuthority,
} from '@omne-harness-lite/execution-environments'
import { SESSION_LOG_OWNER, SESSION_LOG_BACKING } from '@omne-harness-lite/session-log/cordis'
import { SESSION_ACCESS } from '@omne-harness-lite/session-tenancy/cordis'
import { RUNTIME_CONTEXT } from '@omne-harness-lite/runtime-context/cordis'
import { CLOCK_SERVICE } from '@omne-harness-lite/offer-expiry/cordis'
import {
  RUNNER_HOST,
  LOOP_EXTENSION_IMPLEMENTATIONS,
} from '@omne-harness-lite/loop-extension-runner/cordis'
import type {
  ToolRuntimeConfig,
  ToolRuntimeCloseControl,
} from '@omne-harness-lite/tool-execution-runtime'
import {
  ToolRuntimeStartupService,
  TOOL_RUNTIME_STARTUP,
  TOOL_IMPLEMENTATIONS,
} from '@omne-harness-lite/tool-execution-runtime/cordis'
import { toolActionHistory } from './tool-driver-history.ts'
import { demoPureTools } from './demo-tools.cordis.ts'

class History extends ToolActionHistoryService {
  inspect(...args: Parameters<typeof toolActionHistory.inspect>) {
    return toolActionHistory.inspect(...args)
  }
}
class Maintenance extends ResourceRecoveryAuthorityService {
  async authorizeRecovery(
    ...[access, scope]: Parameters<ResourceRecoveryAuthority['authorizeRecovery']>
  ): ReturnType<ResourceRecoveryAuthority['authorizeRecovery']> {
    const result = await this.ctx.sessionLogOwner.readPrefix(access, scope)
    return result.kind === 'prefix'
      ? 'authorized'
      : result.reason === 'notAuthorized' || result.reason === 'invalidInput'
        ? 'notAuthorized'
        : 'unavailable'
  }
}
class Startup extends ToolRuntimeStartupService {
  constructor(
    ctx: Context,
    private readonly recovery: RecoveryAccess,
    private readonly retain: (control: ToolRuntimeCloseControl) => void,
  ) {
    super(ctx)
  }
  recoveryAccess = () => this.recovery
  retainClose = (control: ToolRuntimeCloseControl) => this.retain(control)
}
const EmptyConfig = z.object({}).strict()
export const managedToolOwnedInputs = Object.assign(
  definePlugin({
    name: 'demo-tool-owned-inputs-managed',
    Config: EmptyConfig,
    inject: [SESSION_LOG_OWNER, ASSEMBLY_LIFETIME_SERVICE],
    apply(ctx) {
      startAssemblyWork(
        ctx,
        async () => {
          new History(ctx)
          new Maintenance(ctx)
        },
        async () => {},
      )
    },
  }),
  {
    assemblyLifecycle: 1 as const,
    describeAssembly(value: unknown): AssemblyDeclaration {
      EmptyConfig.parse(value)
      return {
        provides: [TOOL_ACTION_HISTORY, RESOURCE_RECOVERY_AUTHORITY],
        requires: [SESSION_LOG_OWNER],
        optional: [],
        dynamicProvides: [],
        dynamicRequires: [],
        claims: [],
      }
    },
  },
)

// Trusted observation retains real contribution fibers; it is not an authorization interface.
const contributions = new WeakMap<Fiber, { readonly official: Fiber; readonly pure: Fiber }>()
export const managedDemoToolContributions = Object.assign(
  definePlugin({
    name: 'demo-tool-contributions-managed',
    Config: EmptyConfig,
    inject: [LOOP_EXTENSION_IMPLEMENTATIONS, TOOL_IMPLEMENTATIONS, ASSEMBLY_LIFETIME_SERVICE],
    apply(ctx) {
      let official: Fiber | undefined, pure: Fiber | undefined
      startAssemblyWork(
        ctx,
        async () => {
          official = ctx.plugin(officialAdmission, {})
          pure = ctx.plugin(demoPureTools, {})
          contributions.set(ctx.fiber, { official, pure })
          await Promise.all([Promise.resolve(official), Promise.resolve(pure)])
          if (
            (official.state !== FIBER_STATE.ACTIVE && official.state !== FIBER_STATE.PENDING) ||
            pure.state !== FIBER_STATE.ACTIVE
          )
            throw new Error('Demo tool contribution unavailable')
        },
        async () => {
          await pure?.dispose()
          await official?.dispose()
        },
      )
    },
  }),
  {
    assemblyLifecycle: 1 as const,
    describeAssembly(value: unknown): AssemblyDeclaration {
      EmptyConfig.parse(value)
      return {
        provides: [],
        requires: [LOOP_EXTENSION_IMPLEMENTATIONS, TOOL_IMPLEMENTATIONS],
        optional: [],
        dynamicProvides: [],
        dynamicRequires: [TOOL_ADMISSION],
        claims: [],
      }
    },
  },
)

/** Prepare before applying any provider; the caller retains the returned handle before awaiting ready. */
export async function installDemoTools(input: {
  readonly ctx: Context
  readonly recovery: RecoveryAccess
  readonly directory: string
  readonly config: ToolRuntimeConfig
  readonly onStopping: () => void
}) {
  const own = '@omne-harness-lite/model-invocation-minimal-demo'
  const rows: PluginRow[] = [
    {
      id: 'tool-owned-inputs',
      plugin: { package: own, export: 'managedToolOwnedInputs' },
      config: {},
    },
    {
      id: 'tool-runtime-registry',
      plugin: {
        package: '@omne-harness-lite/tool-execution-local',
        export: 'managedRuntimeRegistry',
      },
      config: {},
    },
    {
      id: 'tool-implementation-registry',
      plugin: {
        package: '@omne-harness-lite/tool-execution-local',
        export: 'managedImplementationRegistry',
      },
      config: {},
    },
    {
      id: 'execution-environments',
      plugin: {
        package: '@omne-harness-lite/execution-environments-host',
        export: 'managedEnvironmentRegistry',
      },
      config: {},
    },
    {
      id: 'tool-results',
      plugin: { package: '@omne-harness-lite/tool-result-files', export: 'managedToolResultFiles' },
      config: { directory: input.directory, storage: input.config.resultStorage },
    },
    {
      id: 'tool-admission-host',
      plugin: {
        package: '@omne-harness-lite/tool-admission-local',
        export: 'managedToolAdmissionLocal',
      },
      config: {},
    },
    {
      id: 'demo-tool-contributions-host',
      plugin: { package: own, export: 'managedDemoToolContributions' },
      config: {},
    },
    {
      id: 'tool-execution',
      plugin: {
        package: '@omne-harness-lite/tool-execution-local',
        export: 'managedToolExecutionLocal',
      },
      config: { ...input.config, tailRetry: { ...input.config.tailRetry } },
    },
  ]
  const prepared = await preparePluginTree(composePluginTree(rows), {
    externalServices: [
      SESSION_LOG_OWNER,
      SESSION_LOG_BACKING,
      SESSION_ACCESS,
      RUNTIME_CONTEXT,
      CLOCK_SERVICE,
      RUNNER_HOST,
      LOOP_EXTENSION_IMPLEMENTATIONS,
      TOOL_ADMISSION_PASS_SOURCE,
      TOOL_RUNTIME_STARTUP,
    ],
    resolveModule: reference =>
      reference.package === own ? import('./cordis.ts') : import(`${reference.package}/cordis`),
  })
  let control: ToolRuntimeCloseControl | undefined
  let observed = false
  const startup = input.ctx.plugin({
    name: 'demo-tool-startup',
    apply(ctx: Context) {
      new Startup(ctx, input.recovery, original => {
        if (control && control !== original) throw new Error('Tool runtime close control conflict')
        control = original
      })
    },
  })
  await startup
  // Load verifies the actual external Service after this trusted input becomes active.
  if (startup.state !== FIBER_STATE.ACTIVE) throw new Error('Tool startup input unavailable')
  const turn = Promise.withResolvers<void>()
  const closingDependencies = new Set<string>()
  let dependencyObserved = false
  let retainedDependency = Promise.withResolvers<void>()
  const lifetime = createAssemblyLifetime(prepared.ids, input.onStopping)
  // Only the author may close before consumers drain. All other resources retain their original ready.
  const phased: AssemblyLifetime = {
    ids: lifetime.ids,
    closed: lifetime.closed,
    isPristine: () => lifetime.isPristine(),
    tryClaim: () => lifetime.tryClaim(),
    isCurrent: () => lifetime.isCurrent(),
    close: () => lifetime.close(),
    closeControl: id => lifetime.closeControl(id),
    port(id) {
      const port = lifetime.port(id)
      return {
        isCurrent: port.isCurrent,
        retainClose: control => port.retainClose(control),
        register: work => {
          if (id === 'tool-execution') return port.register(work)
          return port.register({
            ready: work.ready,
            async close() {
              await turn.promise
              closingDependencies.add(id)
              const completed = work.close()
              const control = lifetime.closeControl(id)
              if (control)
                void control.closeAttempt().then(status => {
                  if (status === 'retained') retainedDependency.resolve()
                })
              await completed
            },
          })
        },
      }
    },
  }
  const tree = loadPluginTree(input.ctx, prepared, phased)
  return Object.freeze({
    ready: tree.ready,
    get officialAdmission(): Fiber {
      // The host's identity stays fixed when this actual contribution is independently withdrawn.
      const host = inspectPluginTree(tree).find(
        row => row.id === 'demo-tool-contributions-host',
      )?.fiber
      const actual = host && contributions.get(host.ctx.fiber)
      if (!actual) throw new Error('Tool contribution not initialized')
      return actual.official
    },
    get admissionPublication(): Fiber {
      const host = inspectPluginTree(tree).find(row => row.id === 'tool-admission-host')?.fiber
      if (!host) throw new Error('Tool admission host not initialized')
      return inspectAdmissionPublication(host.ctx.fiber)
    },
    get environments() {
      return input.ctx.executionEnvironments
    },
    async closeAuthors() {
      void tree.dispose()
      if (!control) return 'closed' as const
      const status = observed ? control.retryClose() : control.closeAttempt()
      observed = true
      return status
    },
    async closeDependencies() {
      retainedDependency = Promise.withResolvers<void>()
      if (dependencyObserved) {
        const retries = await Promise.all(
          [...closingDependencies].flatMap(id => {
            const control = lifetime.closeControl(id)
            return control ? [control.retryClose()] : []
          }),
        )
        if (retries.includes('retained')) return 'retained' as const
      }
      dependencyObserved = true
      turn.resolve()
      const result = await Promise.race([
        tree.dispose().then(report => ({ kind: 'closed' as const, report })),
        retainedDependency.promise.then(() => ({ kind: 'retained' as const })),
      ])
      if (result.kind === 'retained') return 'retained' as const
      // A setup failure is reported by ready; it does not itself mean close left physical work alive.
      if (
        result.report.assemblyErrors.length ||
        result.report.rows.some(
          row => row.result.kind === 'failed' && row.result.codes.includes('close'),
        )
      )
        throw new Error('Tool tree close failed')
      await startup.dispose()
      return 'closed' as const
    },
  })
}
