import assert from 'node:assert/strict'
import { Context, Service } from '@deepseek-ai/cordis'

type Principal = { readonly name: string; live: boolean }
type Binding = { check(): string }
type Negative = 'shared-entry' | 'mutable-current'
const negative = process.argv[2] as Negative | undefined
assert(negative === undefined || negative === 'shared-entry' || negative === 'mutable-current')
const root = new Context()
const principals = new WeakMap<Context['fiber'], Principal>()
const owners: Awaited<ReturnType<Context['plugin']>>[] = []
const gate = Promise.withResolvers<void>()
let current: Principal | undefined
let ctxA: Context | undefined
let capturedA: Promise<Binding> | undefined
let capturedB: Promise<Binding> | undefined

class ProbeHost extends Service {
  static readonly provide = 'modelCallerProbeHost'
  constructor(ctx: Context) {
    super(ctx, ProbeHost.provide)
  }
  capture(): Binding {
    const caller = negative === 'shared-entry' ? root.fiber : this.ctx.fiber
    const principal = principals.get(caller)
    return {
      check: () => {
        const selected = negative === 'mutable-current' ? current : principal
        return selected?.live === true ? selected.name : 'denied'
      },
    }
  }
}

class ProbeRuntime extends Service {
  static readonly provide = 'modelCallerProbeRuntime'
  private readonly host: ProbeHost
  constructor(ctx: Context, host: ProbeHost) {
    super(ctx, ProbeRuntime.provide)
    this.host = host
  }
  async wait(): Promise<Binding> {
    const binding = this.ctx.reflect.trace(this.host).capture()
    await gate.promise
    return binding
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    modelCallerProbeHost: ProbeHost
    modelCallerProbeRuntime: ProbeRuntime
  }
}

try {
  owners.push(
    await root.plugin({
      name: 'model-caller-probe-host',
      apply(ctx) {
        new ProbeHost(ctx)
      },
    }),
  )
  owners.push(
    await root.plugin({
      name: 'model-caller-probe-runtime',
      inject: ['modelCallerProbeHost'],
      apply(ctx) {
        new ProbeRuntime(ctx, ctx.modelCallerProbeHost)
      },
    }),
  )
  const originalHost = root.modelCallerProbeHost
  const a: Principal = { name: 'a', live: true }
  const b: Principal = { name: 'b', live: true }
  owners.push(
    await root.plugin({
      name: 'model-caller-probe-a',
      inject: ['modelCallerProbeRuntime'],
      apply(ctx) {
        ctxA = ctx
        principals.set(negative === 'shared-entry' ? root.fiber : ctx.fiber, a)
        current = a
        capturedA = ctx.modelCallerProbeRuntime.wait()
      },
    }),
  )
  owners.push(
    await root.plugin({
      name: 'model-caller-probe-b',
      inject: ['modelCallerProbeRuntime'],
      apply(ctx) {
        principals.set(negative === 'shared-entry' ? root.fiber : ctx.fiber, b)
        current = b
        capturedB = ctx.modelCallerProbeRuntime.wait()
      },
    }),
  )
  assert(ctxA && capturedA && capturedB)
  const oldRuntimeA = ctxA.modelCallerProbeRuntime
  const hostOwner = owners[0]
  assert(hostOwner)
  await hostOwner.dispose()
  assert.equal(root.get(ProbeHost.provide), undefined)
  const nextA = oldRuntimeA.wait()
  gate.resolve()
  const [first, second, repeated] = await Promise.all([capturedA, capturedB, nextA])
  assert.equal(first.check(), 'a', 'caller A retains its captured principal')
  assert.equal(second.check(), 'b', 'caller B retains its captured principal')
  assert.equal(repeated.check(), 'a', 'a shared entry cannot overwrite caller A')
  a.live = false
  assert.equal(first.check(), 'denied', 'the original binding observes revocation')
  assert.equal(second.check(), 'b', 'revocation remains local to caller A')
  assert.equal(
    root.reflect.trace(originalHost).capture().check(),
    'denied',
    'unknown callers have no grant',
  )
  process.stdout.write('caller-context: pass\n')
} finally {
  gate.resolve()
  for (const owner of owners.reverse()) await owner.dispose()
}
