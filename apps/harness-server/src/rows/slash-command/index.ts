import type { Context, Plugin } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { dynamisKey } from '@omne-harness/dynamis-cordis/cordis'
import type { Message } from '@omne-harness/message'
import type { UtteranceResolver } from '@omne-harness/session-contract'
import { sessionUtteranceResolverKey } from '@omne-harness/session-cordis-contract/cordis'
import { createCommandCatalog, createResolver, type Named } from '@omne-harness/slash-command'
import {
  CommandCatalogService,
  commandCatalogKey,
  CommandEntrySourcesService,
  commandEntrySourcesKey,
} from '@omne-harness/slash-command-cordis-contract/cordis'
import type { CommandCatalog } from '@omne-harness/slash-command-contract'
import { defineRow } from '../../row.ts'

export const slashCommandRowConfig = z.strictObject({
  declaredSources: z.array(z.string().min(1)),
  timeoutMs: z.number().int().positive(),
})

class ReleaseCommandCatalog extends CommandCatalogService<unknown> {
  readonly read: CommandCatalog<unknown>['read']
  readonly take: CommandCatalog<unknown>['take']
  readonly candidates: CommandCatalog<unknown>['candidates']
  constructor(ctx: Context, catalog: CommandCatalog<unknown>) {
    super(ctx)
    this.read = (asker, signal) => catalog.read(asker, signal)
    this.take = (asker, naming, signal) => catalog.take(asker, naming, signal)
    this.candidates = (asker, full, param, signal) => catalog.candidates(asker, full, param, signal)
  }
}

const BOTH = Object.freeze({ toHuman: true, toModel: true })

/** The person's words as they came, and after them one text block for each thing named, with its origin. */
function withNamed(original: Message, appended: readonly Named[]): Message {
  const taken = new Set<string>(original.blocks.map(block => block.id))
  const idOf = (n: number): string => {
    let id = `named-${String(n)}`
    while (taken.has(id)) id = `${id}-`
    return id
  }
  const blocks = appended.map((named, n) => ({
    kind: 'text',
    id: idOf(n + 1),
    visibility: BOTH,
    text: named.text,
    origin: named.origin,
  }))
  return { ...original, blocks: [...original.blocks, ...blocks] } as Message
}

function resolverOf(catalog: CommandCatalog<unknown>): UtteranceResolver<unknown> {
  const resolve = createResolver(catalog)
  return {
    name: 'slash-command',
    async resolve({ original, seen, access, request }) {
      const text = original.blocks
        .flatMap(block => (block.kind === 'text' ? [block.text] : []))
        .join('\n')
      const asker = { principal: access.principal, tenant: access.tenant, session: access.session }
      const resolved = await resolve({ text, seen, asker, request: String(request.operation) })
      return resolved.kind === 'input'
        ? { kind: 'input', effective: withNamed(original, resolved.appended) }
        : resolved
    },
  }
}

const slashCommandPlugin: Plugin.Object = {
  name: 'slash-command',
  inject: [dynamisKey, sessionUtteranceResolverKey],
  Config: slashCommandRowConfig,
  apply(ctx: Context, raw: unknown) {
    const config = slashCommandRowConfig.parse(raw)
    const sources = new CommandEntrySourcesService<unknown>(ctx)
    const catalog = createCommandCatalog<unknown>({
      sources: () => sources.sources(),
      declared: config.declaredSources,
      timeoutMs: config.timeoutMs,
    })
    const holding = async <T>(full: string, work: () => Promise<T>): Promise<T> => {
      const owner = sources
        .sources()
        .find(slot => slot.source.space === full.slice(0, full.indexOf(':')))
      const release = owner === undefined ? () => {} : sources.hold(owner.source.name)
      try {
        return await work()
      } finally {
        release()
      }
    }
    const held: CommandCatalog<unknown> = {
      read: catalog.read,
      take: (asker, naming, signal) =>
        holding(naming.name, () => catalog.take(asker, naming, signal)),
      candidates: (asker, full, param, signal) =>
        holding(full, () => catalog.candidates(asker, full, param, signal)),
    }
    new ReleaseCommandCatalog(ctx, held)
    ctx.get(sessionUtteranceResolverKey)?.register(resolverOf(held))
  },
}

/** The command domain: the entry-sources point, and the list a session can name, asked of every source each time. */
export const slashCommandRow = defineRow({
  row: 'slash-command',
  implementation: 'real',
  manifest: {
    provides: [commandEntrySourcesKey, commandCatalogKey],
    injects: [dynamisKey, sessionUtteranceResolverKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: slashCommandPlugin,
})
