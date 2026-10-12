import {
  ASSEMBLY_LIFETIME_SERVICE,
  startRetainedAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import type { AssemblyDeclaration } from '@omne-harness-lite/cordis-plugin-tree'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import type { Fiber } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { LOOP_EXTENSION_IMPLEMENTATIONS } from '@omne-harness-lite/loop-extension-runner/cordis'
import { SESSION_LOG_BACKING } from '@omne-harness-lite/session-log/cordis'
import { SESSION_ACCESS } from '@omne-harness-lite/session-tenancy/cordis'
import type { ToolAdmissionOperations } from '@omne-harness-lite/tool-admission'
import {
  ToolAdmissionService,
  TOOL_ADMISSION,
  TOOL_ADMISSION_PASS_SOURCE,
  TOOL_ACTION_HISTORY,
} from '@omne-harness-lite/tool-admission/cordis'
import { z } from 'zod'
import { createToolAdmission } from './provider.ts'

class Admission extends ToolAdmissionService {
  constructor(
    ctx: Context,
    private readonly operations: ToolAdmissionOperations,
  ) {
    super(ctx)
  }
  forPass(...args: Parameters<ToolAdmissionOperations['forPass']>) {
    return this.operations.forPass(...args)
  }
  verifyToken(...args: Parameters<ToolAdmissionOperations['verifyToken']>) {
    return this.operations.verifyToken(...args)
  }
}
export const toolAdmissionLocal = definePlugin({
  name: 'tool-admission-local',
  inject: [SESSION_ACCESS, SESSION_LOG_BACKING, TOOL_ADMISSION_PASS_SOURCE, TOOL_ACTION_HISTORY],
  Config: z.object({}).strict(),
  apply(ctx) {
    const instance = createToolAdmission({
      access: ctx.sessionAccess,
      backing: ctx.sessionLogBacking,
      source: ctx.toolAdmissionPassSource,
      history: ctx.toolActionHistory,
    })
    ctx.effect(() => () => instance.close(), 'tool-admission-local.close')
    new Admission(ctx, instance)
  },
})
export const officialAdmission = definePlugin({
  name: 'official-tool-admission',
  inject: [LOOP_EXTENSION_IMPLEMENTATIONS, TOOL_ADMISSION],
  Config: z.object({}).strict(),
  apply(ctx) {
    const admission = ctx.toolAdmission
    // The registry service owns withdrawal in this contributor's fiber.
    ctx.loopExtensionImplementations.registerAdmission(async (access, scope, pass, batch) => {
      const bound = await admission.forPass(access, scope, pass)
      if (bound.kind !== 'bound')
        return {
          kind: 'failed',
          reason: bound.reason === 'invalidInput' ? 'invalidInput' : 'unavailable',
        }
      return bound.judgment.admit(batch)
    })
  },
})

const publications = new WeakMap<Fiber, Fiber>()
/** Observe the actual owned publication; this function does not grant admission authority. */
export function inspectAdmissionPublication(host: Fiber): Fiber {
  const publication = publications.get(host)
  if (!publication) throw new TypeError('Invalid tool admission host')
  return publication
}

const admissionRequirements = [
  SESSION_ACCESS,
  SESSION_LOG_BACKING,
  TOOL_ADMISSION_PASS_SOURCE,
  TOOL_ACTION_HISTORY,
]
/** A stable owner retains the root when its dynamic admission publication is withdrawn. */
export const managedToolAdmissionLocal = Object.assign(
  definePlugin({
    name: 'tool-admission-local-managed',
    inject: [...admissionRequirements, ASSEMBLY_LIFETIME_SERVICE],
    Config: z.object({}).strict(),
    apply(ctx) {
      let instance: ReturnType<typeof createToolAdmission> | undefined
      let publication: Fiber | undefined
      startRetainedAssemblyWork(
        ctx,
        async () => {
          instance = createToolAdmission({
            access: ctx.sessionAccess,
            backing: ctx.sessionLogBacking,
            source: ctx.toolAdmissionPassSource,
            history: ctx.toolActionHistory,
          })
          const original = instance
          publication = ctx.plugin({
            name: 'tool-admission-publication',
            apply(scope: Context) {
              scope.effect(() => () => original.closeAdmission(), 'tool-admission-local.withdraw')
              new Admission(scope, original)
            },
          })
          publications.set(ctx.fiber, publication)
          await publication
          if (publication.state !== FIBER_STATE.ACTIVE)
            throw new Error('Tool admission publication unavailable')
        },
        async () => {
          await instance?.close()
          await publication?.dispose()
        },
      )
    },
  }),
  {
    assemblyLifecycle: 1 as const,
    describeAssembly(value: unknown): AssemblyDeclaration {
      z.object({}).strict().parse(value)
      return {
        provides: [],
        requires: admissionRequirements,
        optional: [],
        dynamicProvides: [TOOL_ADMISSION],
        dynamicRequires: [],
        claims: [],
      }
    },
  },
)
