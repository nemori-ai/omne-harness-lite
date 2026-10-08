import { Context, Service, type Fiber } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import {
  MODEL_RUNTIME_HOST_INPUTS,
  MODEL_RUNTIME_SERVICE,
} from '@omne-harness-lite/model-request-runtime/cordis'
import type {
  ModelRuntimeHostInputs,
  ModelRuntimeHostLease,
} from '@omne-harness-lite/model-request-runtime'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { expect, it } from 'vitest'
import { z } from 'zod'
import { createDemoModelInputs } from '../src/model-runtime-inputs.ts'
import { callDeployment } from './model-request-support.ts'

// Controlled operations consumer; actual Cordis caller and demo host lease.
it('returns a retained host borrow once while its caller is already disposing', async () => {
  const config = (await callDeployment('model-inputs-dispose')).modelRequest!
  const ctx = new Context()
  const unavailable = async () => ({ unavailable: true }) as const
  const identity = () => {
    throw new Error('unqualified identity')
  }
  const base: ModelRuntimeHostInputs = {
    sessions: { bind: async () => ({ failure: 'unavailable' }) },
    callAccess: { check: unavailable },
    callPresence: { read: unavailable },
    identities: { call: identity, response: identity, message: identity },
    history: {
      call: () => ({ unavailable: true, reason: 'history' }),
      calibration: () => ({ sourceUnavailable: true }),
      failure: () => ({ unavailable: true }),
      run: () => ({ unavailable: true }),
    },
    recovery: { authorize: unavailable, enter: unavailable },
  }
  const inputs = await createDemoModelInputs(ctx, base, {
    settlementContention: config.settlement.contention,
    settlementScheduler: config.settlement.scheduler,
    policy: { ...config.invocation, diagnostic() {} },
    acknowledgementCleanup: config.acknowledgementCleanup,
    diagnostic() {},
  })
  let owner: Fiber | undefined,
    lease: ModelRuntimeHostLease | undefined,
    returns = 0
  class RetainedConsumer extends Service {
    constructor(inner: Context) {
      super(inner, MODEL_RUNTIME_SERVICE)
    }
    async legalTargets() {
      owner = this.ctx.fiber
      const host = this.ctx.get(MODEL_RUNTIME_HOST_INPUTS)
      if (!host) throw new Error('host absent')
      lease = host.capture().lease
      this.ctx.effect(() => () => {
        lease!.release()
        returns++
      })
      return { unavailable: true } as const
    }
  }
  const provider = ctx.plugin(
    definePlugin({
      name: 'retained-inputs-test-consumer',
      Config: z.object({}).strict(),
      apply(inner) {
        new RetainedConsumer(inner)
      },
    }),
    {},
  )
  try {
    await provider
    const caller = inputs.caller(() => base)
    expect(
      await caller.legalTargets({
        session: unwrap(parseOpaqueIdentifier('inputs-session', 'SessionRef')),
      }),
    ).toEqual({ unavailable: true })
    expect(returns).toBe(0)
    expect(lease!.isCurrent()).toBe(true)
    await owner!.dispose()
    expect(returns).toBe(1)
    expect(lease!.isCurrent()).toBe(false)
    expect(() => lease!.release()).not.toThrow()
    await inputs.close()
    expect(returns).toBe(1)
  } finally {
    await inputs.close()
    await ctx.fiber.dispose()
  }
})
