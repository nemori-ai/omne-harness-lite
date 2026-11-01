// The `./testing` entry: a scripted `modelRuntime` host with a receiver table, and the conformance
// cases of the result receiver registration. The host runs on a real Cordis Context. It is not a
// Model runtime: the three root members fail when called, and only the registration is real. The
// suite drives a host that the fixture hands in, through the public method and the plugin
// lifecycle only, so a provider can run the same cases against its own runtime. Passing proves the
// registration rules in one process. It proves nothing about the push stage that resolves from
// the table.
import { Context, type Fiber } from '@deepseek-ai/cordis'
import type { ModelResultReceiver } from '@omne-harness/model-contract'
import { ModelRuntimeService } from '../cordis.ts'
import { createModelResultReceiverTable, type ModelResultReceiverTable } from '../receivers.ts'

async function unused(): Promise<never> {
  throw new Error('The scripted model runtime does not implement this member')
}

class ScriptedModelRuntimeService<P> extends ModelRuntimeService<P> {
  readonly calls = { admit: unused, inspect: unused, dispatches: unused, cancel: unused }
  readonly consumption = {
    beginRead: unused,
    readNext: unused,
    closeRead: unused,
    acknowledge: unused,
  }
  readonly instances = { connect: unused }
}

/** A `modelRuntime` provider on its own Context, and the lookup the push stage would use. */
export interface ModelResultReceiverHost<P> {
  /** The root Context. The `modelRuntime` service is provided by a plugin fiber below it. */
  readonly context: Context
  /** The receiver of the live registration under `owner`, or `null`. */
  resolve(owner: string): ModelResultReceiver<P> | null
  dispose(): Promise<void>
}

export type ScriptedModelRuntimeHostOptions<P> = Readonly<{
  /** Replaces the table. For a test that must show the suite goes red on a broken table. */
  table?: ModelResultReceiverTable<P>
}>

/** Starts a scripted `modelRuntime` whose registration uses the real table unless told otherwise. */
export async function createScriptedModelRuntimeHost<P = unknown>(
  options: ScriptedModelRuntimeHostOptions<P> = {},
): Promise<ModelResultReceiverHost<P>> {
  const table = options.table ?? createModelResultReceiverTable<P>()
  const context = new Context()
  await context.plugin({
    name: 'scripted-model-runtime',
    apply(ctx: Context) {
      new ScriptedModelRuntimeService<P>(ctx, table)
    },
  })
  return {
    context,
    resolve: owner => table.resolve(owner),
    dispose: async () => {
      await context.fiber.dispose()
    },
  }
}

export interface ModelResultReceiverFixture {
  /** A fresh host for each case. */
  create(): Promise<ModelResultReceiverHost<unknown>>
}

export type ModelResultReceiverCase = Readonly<{
  name: string
  /** The rule the case holds, in words. */
  clause: string
  run(): Promise<void>
}>

// Cordis fiber states by value: ACTIVE 2, FAILED 3, UNLOADING 5. The enum is not importable as a
// value.
const ACTIVE = 2
const FAILED = 3
const UNLOADING = 5

type Receiver = ModelResultReceiver<unknown>
type Host = ModelResultReceiverHost<unknown>

function receiverOf(): Receiver {
  return {
    async push() {
      throw new Error('The conformance receiver is never pushed to')
    },
  }
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

/** Loads a plugin that registers `owner` once and keeps the removal function it got. */
function registrant(
  host: Host,
  name: string,
  owner: string,
  receiver: Receiver,
  after?: (ctx: Context) => void,
): { fiber: Fiber; removal: () => (() => void) | undefined } {
  let removal: (() => void) | undefined
  const fiber = host.context.plugin({
    name,
    inject: ['modelRuntime'],
    apply(ctx: Context) {
      removal = ctx.modelRuntime.registerResultReceiver(owner, receiver)
      after?.(ctx)
    },
  })
  return { fiber, removal: () => removal }
}

async function settled(fiber: Fiber): Promise<void> {
  try {
    await fiber
  } catch {
    // A failed fiber is read from its state, not from the rejection.
  }
}

/**
 * The conformance cases of `registerResultReceiver`: registration takes effect at once, a live
 * fiber's owner cannot be taken by another live fiber, a registration of an unloading fiber is
 * replaced, and a plugin that reruns registers again without failing.
 */
export function modelResultReceiverConformance(
  fixture: ModelResultReceiverFixture,
): readonly ModelResultReceiverCase[] {
  const inHost = (run: (host: Host) => Promise<void>) => async () => {
    const host = await fixture.create()
    try {
      await run(host)
    } finally {
      await host.dispose()
    }
  }
  return [
    {
      name: 'registration-resolves-by-owner',
      clause: 'A registration takes effect at once, and the table answers by owner only',
      run: inHost(async host => {
        const first = receiverOf()
        const second = receiverOf()
        const a = registrant(host, 'agent-a', 'owner-a', first)
        const b = registrant(host, 'agent-b', 'owner-b', second)
        await Promise.all([settled(a.fiber), settled(b.fiber)])
        check(host.resolve('owner-a') === first, 'owner-a does not resolve to its receiver')
        check(host.resolve('owner-b') === second, 'owner-b does not resolve to its receiver')
        check(host.resolve('owner-c') === null, 'an unregistered owner resolved')
      }),
    },
    {
      name: 'live-conflict-fails-the-second',
      clause:
        'Two live fibers cannot hold one owner: the second plugin is FAILED, the first keeps it',
      run: inHost(async host => {
        const first = receiverOf()
        const second = receiverOf()
        const a = registrant(host, 'holder', 'owner', first)
        await settled(a.fiber)
        const b = registrant(host, 'claimant', 'owner', second)
        await settled(b.fiber)
        check(b.fiber.state === FAILED, `the second fiber is in state ${b.fiber.state}`)
        check(a.fiber.state === ACTIVE, 'the first fiber is not active')
        check(host.resolve('owner') === first, 'the first registration was displaced')
      }),
    },
    {
      name: 'unloading-registration-is-replaced',
      clause:
        'A registration of a fiber that is unloading is replaced by a live fiber; the late removal keeps the successor',
      run: inHost(async host => {
        const first = receiverOf()
        const second = receiverOf()
        let live: Context | undefined
        const claimant = host.context.plugin({
          name: 'new',
          inject: ['modelRuntime'],
          apply(ctx: Context) {
            live = ctx
          },
        })
        await settled(claimant)
        const during: { state?: number; resolved?: Receiver | null; failure?: unknown } = {}
        // Cordis runs the removal of the later effect of a fiber first, and it runs
        // synchronously, so this hook runs while the old fiber is unloading and its own
        // registration is not yet removed.
        const old = registrant(host, 'old', 'owner', first, ctx => {
          ctx.effect(
            () => () => {
              during.state = ctx.fiber.state
              during.resolved = host.resolve('owner')
              try {
                live?.modelRuntime.registerResultReceiver('owner', second)
              } catch (error) {
                during.failure = error
              }
            },
            'replace-while-unloading',
          )
        })
        await settled(old.fiber)
        await old.fiber.dispose()
        check(during.state === UNLOADING, `the old fiber was in state ${during.state}`)
        check(during.resolved === null, 'an unloading fiber still answers for its owner')
        check(during.failure === undefined, 'the replacement of an unloading fiber was refused')
        check(claimant.state === ACTIVE, `the replacing fiber is in state ${claimant.state}`)
        check(host.resolve('owner') === second, 'the old removal deleted the successor')
      }),
    },
    {
      name: 'removal-is-synchronous-and-own',
      clause:
        'The removal function removes at once, is idempotent, and does not remove a successor',
      run: inHost(async host => {
        const first = receiverOf()
        const second = receiverOf()
        const a = registrant(host, 'old', 'owner', first)
        await settled(a.fiber)
        const removal = a.removal()
        check(removal !== undefined, 'the registration returned no removal function')
        removal?.()
        check(host.resolve('owner') === null, 'the registration outlived its removal function')
        removal?.()
        const b = registrant(host, 'new', 'owner', second)
        await settled(b.fiber)
        removal?.()
        check(host.resolve('owner') === second, 'a repeated removal deleted the successor')
      }),
    },
    {
      name: 'fiber-unload-removes-the-registration',
      clause: 'The registration ends with the registering fiber, and the owner is free again',
      run: inHost(async host => {
        const first = receiverOf()
        const a = registrant(host, 'agent', 'owner', first)
        await settled(a.fiber)
        await a.fiber.dispose()
        check(host.resolve('owner') === null, 'the registration outlived its fiber')
        const again = receiverOf()
        const b = registrant(host, 'agent-2', 'owner', again)
        await settled(b.fiber)
        check(host.resolve('owner') === again, 'the owner was not free after the unload')
      }),
    },
    {
      name: 'rerun-registers-again-without-failing',
      clause:
        'A plugin that reruns because another dependency changed registers again and is not FAILED',
      run: inHost(async host => {
        const received: Receiver[] = []
        const agent = host.context.plugin({
          name: 'agent-host',
          inject: ['modelRuntime', 'otherDependency'],
          apply(ctx: Context) {
            const receiver = receiverOf()
            received.push(receiver)
            ctx.modelRuntime.registerResultReceiver('owner', receiver)
          },
        })
        const dependency = (name: string) =>
          host.context.plugin({
            name,
            apply(ctx: Context) {
              ctx.provide('otherDependency', { name })
            },
          })
        const firstGeneration = dependency('dependency-1')
        await settled(firstGeneration)
        await settled(agent)
        check(received.length === 1, `the agent plugin ran ${received.length} times`)
        await firstGeneration.dispose()
        await settled(dependency('dependency-2'))
        await settled(agent)
        check(received.length === 2, `the agent plugin ran ${received.length} times`)
        check(agent.state === ACTIVE, `the agent plugin is in state ${agent.state}`)
        check(host.resolve('owner') === received[1], 'the new registration is not the live one')
      }),
    },
    {
      name: 'malformed-input-is-refused',
      clause: 'An empty owner or a receiver without push is refused and registers nothing',
      run: inHost(async host => {
        const a = registrant(host, 'empty-owner', '', receiverOf())
        const b = registrant(host, 'no-push', 'owner', {} as Receiver)
        await Promise.all([settled(a.fiber), settled(b.fiber)])
        check(a.fiber.state === FAILED && b.fiber.state === FAILED, 'a malformed input was taken')
        check(host.resolve('owner') === null && host.resolve('') === null, 'something registered')
      }),
    },
  ]
}
