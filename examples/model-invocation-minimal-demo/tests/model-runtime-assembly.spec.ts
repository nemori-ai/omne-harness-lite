// @module-tag slow
// Actual Cordis/tree/SQLite owners; controlled host ports test assembly custody only.
import { Context } from '@deepseek-ai/cordis'
import { jsonNumberSource } from '@omne-harness-lite/content-blocks'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import {
  ModelRuntimeHostInputsService,
  ModelRuntimeExecutionSupportService,
} from '@omne-harness-lite/model-request-runtime/cordis'
import type {
  ModelRuntimeHostInputs,
  ModelRuntimeExecutionSupport,
} from '@omne-harness-lite/model-request-runtime'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { composeMigrations } from '@omne-harness-lite/storage'
import { modelCallContentMigrations } from '@omne-harness-lite/model-request-runtime-local'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { startModelRuntimeAssembly } from '../src/model-runtime-assembly.ts'
import { callDeployment } from './model-request-support.ts'

async function assemblyFixture() {
  const deployment = await callDeployment('named-model-assembly'),
    config = deployment.modelRequest!
  const storage = await openStorage({
    dialect: 'sqlite',
    file: deployment.databaseFile,
    upgrade: false,
    migrations: composeMigrations(modelCallContentMigrations('sqlite')),
  })
  const ctx = new Context(),
    generation = Object.freeze({})
  let blocked = false,
    badPresence = false,
    captures = 0,
    returns = 0
  const base: ModelRuntimeHostInputs = {
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
        throw new Error('no actor')
      },
      response() {
        throw new Error('no actor')
      },
      message() {
        throw new Error('no actor')
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
  class Inputs extends ModelRuntimeHostInputsService {
    capture() {
      captures++
      let released = false
      const inputs = {
        ...base,
        get callPresence() {
          if (badPresence) throw new Error('original presence construction failed')
          return base.callPresence
        },
      }
      return {
        inputs,
        lease: {
          generation,
          isCurrent: () => true,
          release() {
            if (released) return
            if (blocked) throw new Error('original borrow return blocked')
            released = true
            returns++
          },
        },
      }
    }
  }
  class Support extends ModelRuntimeExecutionSupportService {
    declare readonly diagnosticCollector?: Exclude<
      ModelRuntimeExecutionSupport['diagnosticCollector'],
      undefined
    >
    readonly settlementContention = config.settlement.contention
    readonly settlementScheduler = config.settlement.scheduler
    readonly policy = { ...config.invocation, diagnostic() {} }
    readonly acknowledgementCleanup = config.acknowledgementCleanup
    readonly diagnostic = () => {}
  }
  const dependencies = ctx.plugin(
    definePlugin({
      name: 'actual-model-assembly-inputs',
      Config: z.object({}).strict(),
      apply(inner) {
        new Inputs(inner)
        new Support(inner)
        inner.provide('storage', storage)
        inner.provide('clock', { now: () => 'unavailable' })
        inner.provide('modelTransport', {
          clearReuseScope() {},
          acquire: () => ({ rejected: 'unavailable' }),
        })
      },
    }),
    {},
  )
  await dependencies
  return {
    ctx,
    config: {
      maxScopes: config.maxScopes,
      callReferences: config.callReferences,
      reservationWaitPolicy: {
        maxWaitersPerCall: jsonNumberSource(config.reservationWaitPolicy.maxWaitersPerCall),
        timeoutMs: jsonNumberSource(config.reservationWaitPolicy.timeoutMs),
      },
      tokenMargin: {
        multiplier: jsonNumberSource(config.tokenMargin.multiplier),
        reserveTokens: jsonNumberSource(config.tokenMargin.reserveTokens),
      },
    },
    block(value: boolean) {
      blocked = value
    },
    failPresence(value: boolean) {
      badPresence = value
    },
    counts: () => ({ captures, returns }),
    async close() {
      blocked = false
      await dependencies.dispose()
      await ctx.fiber.dispose()
      await storage.close()
    },
  }
}

describe('same-host model assembly ownership', () => {
  it('reserves before asynchronous preparation and prevents late old cleanup from releasing a successor', async () => {
    const h = await assemblyFixture()
    const starting = startModelRuntimeAssembly(h.ctx, h.config)
    await expect(startModelRuntimeAssembly(h.ctx, h.config)).rejects.toThrow(
      'original assembly retained',
    )
    const original = await starting
    try {
      await original.ready
      expect(await original.close()).toBe('closed')
      const successor = await startModelRuntimeAssembly(h.ctx, h.config)
      await successor.ready
      expect(await original.close()).toBe('closed')
      await expect(startModelRuntimeAssembly(h.ctx, h.config)).rejects.toThrow(
        'original assembly retained',
      )
      expect(await successor.close()).toBe('closed')
      expect(h.counts()).toEqual({ captures: 2, returns: 2 })
    } finally {
      await original.close()
      await h.close()
    }
  })

  it('keeps the original owner/control during retained close, retries it and only then permits a new generation', async () => {
    const h = await assemblyFixture(),
      original = await startModelRuntimeAssembly(h.ctx, h.config)
    try {
      await original.ready
      const source = original.owner().executionSource
      h.block(true)
      expect(await original.close()).toBe('retained')
      expect(original.owner().executionSource).toBe(source)
      await expect(startModelRuntimeAssembly(h.ctx, h.config)).rejects.toThrow(
        'original assembly retained',
      )
      expect(h.counts()).toEqual({ captures: 1, returns: 0 })
      h.block(false)
      expect(await original.close()).toBe('closed')
      const successor = await startModelRuntimeAssembly(h.ctx, h.config)
      await successor.ready
      expect(successor.owner().executionSource).not.toBe(source)
      expect(await successor.close()).toBe('closed')
      expect(h.counts()).toEqual({ captures: 2, returns: 2 })
    } finally {
      h.block(false)
      await original.close()
      await h.close()
    }
  })

  it('preserves acquired content and the accessible close control when facts construction fails', async () => {
    const h = await assemblyFixture()
    h.failPresence(true)
    h.block(true)
    const original = await startModelRuntimeAssembly(h.ctx, h.config)
    try {
      await expect(original.ready).rejects.toThrow()
      expect(await original.close()).toBe('retained')
      expect(h.counts()).toEqual({ captures: 1, returns: 0 })
      await expect(startModelRuntimeAssembly(h.ctx, h.config)).rejects.toThrow(
        'original assembly retained',
      )
      h.block(false)
      expect(await original.close()).toBe('closed')
      h.failPresence(false)
      const next = await startModelRuntimeAssembly(h.ctx, h.config)
      await next.ready
      expect(await next.close()).toBe('closed')
      expect(h.counts()).toEqual({ captures: 2, returns: 2 })
    } finally {
      h.block(false)
      await original.close()
      await h.close()
    }
  })
})
