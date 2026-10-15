import { Context, type Fiber } from '@deepseek-ai/cordis'

/** Cordis 4.0.4 FiberState.ACTIVE. A const enum cannot be value-imported. */
const ACTIVE = 2

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
  const fibers: Fiber[] = []
  let startError: unknown

  for (const plugin of plugins) {
    const fiber = context.plugin(cordisPlugin(plugin))
    fibers.push(fiber)
    try {
      await fiber
    } catch (error) {
      startError = error
      break
    }
  }

  if (startError === undefined) {
    for (const fiber of fibers) {
      if (fiber.state === ACTIVE) continue
      try {
        await fiber
      } catch (error) {
        startError = error
        break
      }
    }
  }

  if (startError !== undefined) {
    await failStart(fibers, startError)
  }

  const pending = fibers.find((fiber) => fiber.state !== ACTIVE)
  if (pending !== undefined) {
    const name = pending.runtime?.name ?? 'plugin'
    await failStart(fibers, new Error(`Test plugin "${name}" did not run apply`))
  }

  return {
    context,
    async dispose() {
      const disposeErrors = await disposeStarted(fibers)
      if (disposeErrors.length > 0) throw new TestAssemblyDisposeFailed(disposeErrors)
    },
  }
}

function cordisPlugin(plugin: TestPlugin): TestPlugin {
  if (plugin.inject === undefined) {
    return { name: plugin.name, apply: plugin.apply }
  }
  return { name: plugin.name, inject: plugin.inject, apply: plugin.apply }
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
  for (const fiber of [...fibers].reverse()) {
    try {
      await fiber.dispose()
    } catch (error) {
      disposeErrors.push(error)
    }
  }
  return disposeErrors
}
