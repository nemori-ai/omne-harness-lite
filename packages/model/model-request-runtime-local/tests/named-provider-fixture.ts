import { createSessionModelCallFacts } from '@omne-harness-lite/session-runtime-local'
import { sessionModelSettlement } from '@omne-harness-lite/session-runtime-local'
import { createSessionModelAcknowledgement } from '@omne-harness-lite/session-runtime-local'
import {
  publishSessionModelCallContent,
  sessionModelRequestPreparation,
} from '@omne-harness-lite/session-runtime-local'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { createAssemblyLifetime } from '@omne-harness-lite/assembly-lifecycle'
import { AssemblyLifetimeService } from '@omne-harness-lite/assembly-lifecycle/cordis'
import {
  ModelRuntimeHostInputsService,
  ModelRuntimeExecutionSupportService,
} from '@omne-harness-lite/model-request-runtime/cordis'
import type {
  ModelRuntimeHostInputs,
  ModelRuntimeExecutionSupport,
  ModelTransportService,
} from '@omne-harness-lite/model-request-runtime'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { composeMigrations } from '@omne-harness-lite/storage'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import {
  createModelRuntimeLocal,
  type ModelRuntimeLocalConfig,
  type ModelRuntimeLocalConstruction,
} from '../src/service-plugin.ts'
import { modelCallContentMigrations } from '../src/reference-content.ts'
import { policy } from './invoke-policy-fixture.ts'
import { noWaitScheduler, policy as settlementPolicy } from './settlement-fixture.ts'

export const providerConfig = {
  maxScopes: 4,
  callReferences: { maxScopes: 4, content: { maxConcurrentWrites: 2, maxContentBytes: 1048576 } },
  reservationWaitPolicy: { maxWaitersPerCall: '2', timeoutMs: '100' },
  tokenMargin: { multiplier: '1', reserveTokens: '0' },
}
export function unavailableInputs(): ModelRuntimeHostInputs {
  return {
    sessions: {
      async bind() {
        return { failure: 'unavailable' }
      },
    },
    callAccess: {
      async check() {
        return { unavailable: true }
      },
    },
    callPresence: {
      async read() {
        return { unavailable: true }
      },
    },
    identities: {
      call() {
        throw new Error('unqualified identity')
      },
      response() {
        throw new Error('unqualified identity')
      },
      message() {
        throw new Error('unqualified identity')
      },
    },
    history: {
      call: () => ({ unavailable: true, reason: 'history' }),
      calibration: () => ({ sourceUnavailable: true }),
      failure: () => ({ unavailable: true }),
      run: () => ({ unavailable: true }),
    },
    recovery: {
      async authorize() {
        return { unavailable: true }
      },
      async enter() {
        return { unavailable: true }
      },
    },
  }
}
export async function namedProviderFixture(
  options: {
    readonly capture?: (fiber: Fiber) => ModelRuntimeHostInputs
    readonly release?: () => void
    readonly support?: ModelRuntimeExecutionSupport
    readonly deferDependencies?: boolean
    readonly config?: ModelRuntimeLocalConfig
    readonly callFactsFactory?: ModelRuntimeLocalConstruction['callFactsFactory']
    readonly settlementFactory?: ModelRuntimeLocalConstruction['settlementFactory']
    readonly construction?: Omit<
      ModelRuntimeLocalConstruction,
      | 'requestPreparation'
      | 'recordPublication'
      | 'acknowledgementFactory'
      | 'settlementFactory'
      | 'callFactsFactory'
    >
    readonly transport?: Pick<ModelTransportService, 'clearReuseScope' | 'acquire'>
  } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), 'model-named-provider-'))
  const storage = await openStorage({
    dialect: 'sqlite',
    file: join(directory, 'content.sqlite'),
    upgrade: false,
    migrations: composeMigrations(modelCallContentMigrations('sqlite')),
  })
  const ctx = new Context(),
    binding = createModelRuntimeLocal({
      ...options.construction,
      acknowledgementFactory: createSessionModelAcknowledgement,
      callFactsFactory: options.callFactsFactory ?? createSessionModelCallFacts,
      settlementFactory: options.settlementFactory ?? sessionModelSettlement,
      recordPublication: publishSessionModelCallContent,
      requestPreparation: sessionModelRequestPreparation,
    })
  const lifetime = createAssemblyLifetime(['model'], binding.closeAdmission)
  if (!lifetime.tryClaim()) throw new Error('fixture lifetime claim')
  const captures: Fiber[] = []
  let releases = 0
  class Inputs extends ModelRuntimeHostInputsService {
    capture() {
      captures.push(this.ctx.fiber)
      let released = false
      return {
        inputs: options.capture?.(this.ctx.fiber) ?? unavailableInputs(),
        lease: {
          generation: lifetime,
          isCurrent: () => lifetime.isCurrent(),
          release() {
            if (released) return
            options.release?.()
            released = true
            releases++
          },
        },
      }
    }
  }
  const support: ModelRuntimeExecutionSupport = options.support ?? {
    settlementContention: settlementPolicy(),
    settlementScheduler: noWaitScheduler,
    policy: policy(),
    acknowledgementCleanup: { next: () => ({ stop: true }) as const },
    diagnostic() {},
  }
  class Support extends ModelRuntimeExecutionSupportService {
    declare readonly diagnosticCollector?: Exclude<
      ModelRuntimeExecutionSupport['diagnosticCollector'],
      undefined
    >
    readonly settlementContention = support.settlementContention
    readonly settlementScheduler = support.settlementScheduler
    readonly policy = support.policy
    readonly acknowledgementCleanup = support.acknowledgementCleanup
    readonly diagnostic = support.diagnostic
    constructor(inner: Context) {
      super(inner)
      if (support.diagnosticCollector) this.diagnosticCollector = support.diagnosticCollector
    }
  }
  class Lifetime extends AssemblyLifetimeService {
    isCurrent = () => lifetime.port('model').isCurrent()
    register = lifetime.port('model').register
    retainClose = lifetime.port('model').retainClose
  }
  let dependencies: Fiber | undefined
  async function supplyDependencies() {
    dependencies = ctx.plugin(
      definePlugin({
        name: 'named-provider-fixture-inputs',
        Config: z.object({}).strict(),
        apply(inner) {
          new Inputs(inner)
          new Support(inner)
          new Lifetime(inner)
          inner.provide('storage', storage)
          inner.provide('clock', { now: async () => 'unavailable' })
          inner.provide(
            'modelTransport',
            options.transport ?? {
              clearReuseScope() {},
              acquire: () => ({ rejected: 'unavailable' }),
            },
          )
        },
      }),
      {},
    )
    await dependencies
  }
  if (!options.deferDependencies) await supplyDependencies()
  const fiber = ctx.plugin(binding.plugin, options.config ?? providerConfig)
  return {
    ctx,
    binding,
    fiber,
    lifetime,
    captures,
    releases: () => releases,
    supplyDependencies,
    async close() {
      binding.closeAdmission()
      const close = lifetime.close()
      const control = lifetime.closeControl('model')
      if (control) {
        const result = await control.closeAttempt()
        if (result === 'retained') await control.retryClose()
      }
      await close
      await fiber.dispose()
      await dependencies?.dispose()
      await ctx.fiber.dispose()
      await storage.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
}
