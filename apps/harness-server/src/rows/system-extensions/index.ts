import { Service, type Context } from '@deepseek-ai/cordis'
import type {
  EnabledExtension,
  ExtensionInput,
  ExtensionInvocationResult,
  Failure,
  SystemExtensions,
} from '@omne-harness/agent-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { z } from 'zod'
import { defineRow } from '../../row.ts'

export const SYSTEM_EXTENSIONS_KEY = 'harnessSystemExtensions'
const OWNER = 'systemExtensions'

/** One contribution to the trusted system extensions of this release: its members and how each is run. */
export type SystemExtensionProvider = Readonly<{
  name: string
  members: readonly EnabledExtension[]
  invoke(
    access: Readonly<{ principal: unknown; tenant: TenantId }>,
    member: EnabledExtension,
    input: ExtensionInput,
  ): Promise<ExtensionInvocationResult>
}>

const unavailable = (diagnostic: string): Outcome<never, Failure> =>
  fail({ kind: 'unavailable', owner: OWNER, diagnostic })
const same = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

/** The point system extensions are contributed at. A contribution leaves with the scope that made it. */
export class SystemExtensionsRegistry extends Service {
  private readonly held = new Map<string, SystemExtensionProvider>()
  private readonly declared: readonly string[]

  constructor(ctx: Context, declared: readonly string[]) {
    super(ctx, SYSTEM_EXTENSIONS_KEY)
    this.declared = declared
  }

  contribute(scope: Context, provider: SystemExtensionProvider): void {
    if (this.held.has(provider.name))
      throw new Error(`the system extensions of ${provider.name} are contributed already`)
    this.held.set(provider.name, provider)
    scope.effect(
      () => () => {
        if (this.held.get(provider.name) === provider) this.held.delete(provider.name)
      },
      `system-extensions.${provider.name}`,
    )
  }

  /** The members in the declared order. A declared contribution that is away is a failure, never no member. */
  members(): Outcome<readonly EnabledExtension[], Failure> {
    const away = this.declared.find(name => !this.held.has(name))
    if (away !== undefined) return unavailable(`the system extensions of ${away} are away`)
    return succeed(this.declared.flatMap(name => this.held.get(name)?.members ?? []))
  }

  /** The contribution a recorded member belongs to, by its declaration and its exact implementation. */
  find(member: EnabledExtension): SystemExtensionProvider | undefined {
    return [...this.held.values()].find(provider => provider.members.some(own => same(own, member)))
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    [SYSTEM_EXTENSIONS_KEY]: SystemExtensionsRegistry
  }
}

/** The port of the system source for the Agent host: the registry is asked at each read. Without it there is no system source. */
export function systemExtensionsOf(ctx: Context): SystemExtensions<unknown> {
  const registry = () => ctx.get(SYSTEM_EXTENSIONS_KEY) as SystemExtensionsRegistry | undefined
  return {
    async read() {
      return registry()?.members() ?? succeed([])
    },
    async resolve({ passage, principal, tenant }) {
      const { declaration, implementation } = passage
      const member = { declaration, implementation }
      const provider = registry()?.find(member)
      if (provider === undefined) return unavailable(`no system extension is ${declaration.name}`)
      return succeed({
        implementation,
        invoke: input => provider.invoke({ principal, tenant }, member, input),
      })
    },
  }
}

export const systemExtensionsConfig = z.strictObject({ declared: z.array(z.string().min(1)) })

/** The registry of the trusted system extensions, with the names this release declares. */
export const systemExtensionsRow = defineRow({
  row: 'system-extensions',
  implementation: 'real',
  manifest: { provides: [SYSTEM_EXTENSIONS_KEY], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'system-extensions',
    Config: systemExtensionsConfig,
    apply(ctx: Context, config: z.infer<typeof systemExtensionsConfig>) {
      new SystemExtensionsRegistry(ctx, config.declared)
    },
  },
})
