import { Context, type Fiber } from '@deepseek-ai/cordis'

type CordisFiberState = typeof import('@deepseek-ai/cordis').FiberState

const PENDING = 0 satisfies CordisFiberState['PENDING']
const LOADING = 1 satisfies CordisFiberState['LOADING']
const ACTIVE = 2 satisfies CordisFiberState['ACTIVE']

export type TestPlugin = {
  name: string
  inject?: readonly string[]
  apply: (ctx: Context) => void | Promise<void>
}

export type TestAssembly = {
  context: Context
  dispose: () => Promise<void>
}

export class TestAssemblyStartFailed extends Error {
  readonly startError: unknown
  readonly disposeErrors: readonly unknown[]

  constructor(startError: unknown, disposeErrors: readonly unknown[]) {
    super('Test assembly failed to start')
    this.name = 'TestAssemblyStartFailed'
    this.startError = startError
    this.disposeErrors = disposeErrors
  }
}

export class TestAssemblyDisposeFailed extends Error {
  readonly disposeErrors: readonly unknown[]

  constructor(disposeErrors: readonly unknown[]) {
    super('Test assembly dispose failed')
    this.name = 'TestAssemblyDisposeFailed'
    this.disposeErrors = disposeErrors
  }
}

export async function startTestAssembly(
  plugins: readonly TestPlugin[],
): Promise<TestAssembly> {
  const context = new Context()
  const submitted: Fiber[] = []
  const started: Fiber[] = []
  let failure: StartFailure | undefined

  for (const plugin of plugins) {
    let fiber: Fiber
    try {
      fiber = context.plugin(cordisPlugin(plugin, started, submitted))
    } catch (error) {
      failure = { error }
      break
    }
    submitted.push(fiber)
    adoptPublicFiber(started, fiber)
    try {
      await fiber
    } catch (error) {
      failure = { error }
      break
    }
  }

  if (failure === undefined) failure = await waitForApplies(submitted)
  if (failure !== undefined) await failStart(disposalOrder(submitted, started), failure.error)

  const pending = submitted.find((fiber) => !started.includes(publicOrInner(started, fiber)))
  if (pending !== undefined) {
    await failStart(
      disposalOrder(submitted, started),
      new Error(`Test plugin "${pluginName(pending)}" did not run apply`),
    )
  }

  const order = disposalOrder(submitted, started)
  return {
    context,
    async dispose() {
      const disposeErrors = await disposeStarted(order)
      if (disposeErrors.length > 0) throw new TestAssemblyDisposeFailed(disposeErrors)
    },
  }
}

function cordisPlugin(plugin: TestPlugin, started: Fiber[], submitted: Fiber[]): TestPlugin {
  const apply = (ctx: Context) => {
    rememberStart(started, submitted, ctx.fiber)
    return plugin.apply(ctx)
  }
  if (plugin.inject === undefined) return { name: plugin.name, apply }
  return { name: plugin.name, inject: plugin.inject, apply }
}

function rememberStart(started: Fiber[], submitted: Fiber[], inner: Fiber): void {
  const fiber = publicOrInner(submitted, inner)
  if (!started.includes(fiber)) started.push(fiber)
}

function adoptPublicFiber(started: Fiber[], fiber: Fiber): void {
  const inner = Object.getPrototypeOf(fiber) as Fiber
  const index = started.indexOf(inner)
  if (index !== -1) started[index] = fiber
}

function publicOrInner(candidates: readonly Fiber[], inner: Fiber): Fiber {
  return candidates.find((fiber) => fiber === inner || Object.getPrototypeOf(fiber) === inner) ?? inner
}

type StartFailure = { error: unknown }

async function waitForApplies(fibers: readonly Fiber[]): Promise<StartFailure | undefined> {
  for (;;) {
    const busy = fibers.filter((fiber) => fiber.state === LOADING || fiber.inertia !== undefined)
    if (busy.length === 0) break
    try {
      await Promise.all(busy.map((fiber) => fiber))
    } catch (error) {
      return { error }
    }
  }
  for (const fiber of fibers) {
    if (fiber.state === ACTIVE || fiber.state === PENDING) continue
    try {
      await fiber
    } catch (error) {
      return { error }
    }
  }
  return undefined
}

function disposalOrder(submitted: readonly Fiber[], started: readonly Fiber[]): Fiber[] {
  const startedSet = new Set(started)
  const unstarted = submitted.filter((fiber) => !startedSet.has(fiber))
  return [...[...started].reverse(), ...unstarted]
}

function pluginName(fiber: Fiber): string {
  return fiber.runtime?.name ?? fiber.name ?? 'plugin'
}

async function failStart(fibers: readonly Fiber[], startError: unknown): Promise<never> {
  const disposeErrors = await disposeStarted(fibers)
  if (disposeErrors.length > 0) {
    throw new TestAssemblyStartFailed(startError, disposeErrors)
  }
  throw startError
}

async function disposeStarted(fibers: readonly Fiber[]): Promise<unknown[]> {
  const disposeErrors: unknown[] = []
  for (const fiber of fibers) {
    try {
      await fiber.dispose()
    } catch (error) {
      disposeErrors.push(error)
    }
  }
  return disposeErrors
}
