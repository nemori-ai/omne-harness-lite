import { Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import { z } from 'zod'
import type { RowId, RowManifest, ServiceName } from '../types.ts'

/** Behaviour switches a replacement row reads from its own config. Unknown keys are ignored here. */
const StubConfig = z.object({
  failOnApply: z.string().optional(),
  constructionCheck: z.string().optional(),
  holdApply: z.boolean().optional(),
  probeGet: z.array(z.string()).optional(),
  childInject: z.array(z.string()).optional(),
  expectIn: z
    .object({ service: z.string(), field: z.string(), value: z.string(), tag: z.string() })
    .optional(),
})

export type StubEvent =
  | Readonly<{ kind: 'applied'; row: string }>
  | Readonly<{
      kind: 'injected' | 'probed' | 'child-injected'
      row: string
      name: ServiceName
      value: unknown
    }>

export type StubHooks = Readonly<{
  observe: (event: StubEvent) => void
  /** Settles when a row with `holdApply` may finish loading. */
  hold?: Promise<void>
}>

/** Failure with a stable tag, so a test can tell the injected failure from an accident. */
export class StubFailure extends Error {
  readonly tag: string

  constructor(tag: string) {
    super(`stub failure: ${tag}`)
    this.name = 'StubFailure'
    this.tag = tag
  }
}

/** Provider value of a replacement row. A Service subclass registers under the label of the context it is given. */
export class StubService extends Service {
  readonly rowId: string
  readonly config: unknown

  constructor(ctx: Context, name: ServiceName, rowId: string, config: unknown) {
    super(ctx, name)
    this.rowId = rowId
    this.config = config
  }
}

/** One generic replacement plugin for a row. It declares only what the manifest declares. */
export function createStubPlugin(options: {
  id: RowId
  manifest: RowManifest
  hooks: StubHooks
}): Plugin {
  const { id, manifest, hooks } = options
  const apply = async (ctx: Context, rawConfig: unknown): Promise<void> => {
    hooks.observe({ kind: 'applied', row: id })
    const config = StubConfig.parse(rawConfig ?? {})
    const failure = config.failOnApply ?? config.constructionCheck
    if (failure !== undefined) throw new StubFailure(failure)

    const childNames = new Set(config.childInject ?? [])
    for (const name of manifest.injects) {
      if (childNames.has(name)) continue
      hooks.observe({ kind: 'injected', row: id, name, value: ctx.reflect.get(name) })
      if (config.expectIn?.service === name)
        checkExpectation(config.expectIn, ctx.reflect.get(name))
    }
    for (const name of config.probeGet ?? []) {
      hooks.observe({ kind: 'probed', row: id, name, value: ctx.reflect.get(name) })
    }
    if (childNames.size > 0) {
      await ctx.plugin({
        inject: [...childNames],
        apply: (child: Context) => {
          for (const name of childNames) {
            hooks.observe({ kind: 'child-injected', row: id, name, value: child.reflect.get(name) })
          }
        },
      })
    }
    if (config.holdApply) await hooks.hold
    for (const name of manifest.provides) new StubService(ctx, name, id, rawConfig)
  }
  return { name: id, inject: [...manifest.injects], apply }
}

function checkExpectation(
  expectation: { service: string; field: string; value: string; tag: string },
  provided: unknown,
): void {
  const list = (provided as { config?: Record<string, unknown> } | undefined)?.config?.[
    expectation.field
  ]
  if (!Array.isArray(list) || !list.includes(expectation.value))
    throw new StubFailure(expectation.tag)
}
