import { Service, type Context } from '@deepseek-ai/cordis'
import type { AssemblyLifetimePort } from './types.ts'
import { AssemblyWorkStopped } from './errors.ts'
import { createRetainedWork } from './retained-work.ts'

/** @owner packages/core/assembly-lifecycle */
export abstract class AssemblyLifetimeService extends Service implements AssemblyLifetimePort {
  static readonly provide = 'assemblyLifetime' as const

  constructor(ctx: Context) {
    super(ctx, AssemblyLifetimeService.provide)
  }

  abstract isCurrent: AssemblyLifetimePort['isCurrent']
  abstract register: AssemblyLifetimePort['register']
  abstract retainClose: AssemblyLifetimePort['retainClose']
}

export const ASSEMBLY_LIFETIME_SERVICE = AssemblyLifetimeService.provide

/** Start managed work without tying resource readiness to fiber activation. */
export function startAssemblyWork(
  ctx: Context,
  setup: () => Promise<void>,
  close: () => Promise<void>,
): void {
  startManagedWork(ctx, setup, close, false)
}

/** Retain an unconfirmed original close in the same assembly row. */
export function startRetainedAssemblyWork(
  ctx: Context,
  setup: () => Promise<void>,
  attemptClose: () => Promise<void>,
): void {
  startManagedWork(ctx, setup, attemptClose, true)
}

function startManagedWork(
  ctx: Context,
  setup: () => Promise<void>,
  close: () => Promise<void>,
  retain: boolean,
): void {
  const lifetime = ctx.get(ASSEMBLY_LIFETIME_SERVICE)
  if (!lifetime) throw new Error('Assembly lifetime is required')
  const ready = Promise.withResolvers<void>()
  // Registration failure remains a synchronous usage error, before any effects.
  const retained = retain ? createRetainedWork(ready.promise, close) : undefined
  const registration = lifetime.register(retained?.work ?? { ready: ready.promise, close })
  const fail = (error: unknown): void => {
    ready.reject(error)
    registration.requestStop()
  }
  try {
    if (retained) lifetime.retainClose(retained.control)
    ctx.effect(() => async () => {
      registration.requestStop()
      await registration.closed
    })
  } catch (error) {
    fail(error)
    return
  }
  const assertCurrent = (): void => {
    ctx.fiber.assertActive()
    if (!lifetime.isCurrent()) throw new AssemblyWorkStopped()
  }
  void Promise.resolve()
    .then(async () => {
      assertCurrent()
      await setup()
      assertCurrent()
    })
    .then(ready.resolve, fail)
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    assemblyLifetime: AssemblyLifetimeService
  }
}
