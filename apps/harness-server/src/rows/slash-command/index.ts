import type { Context, Plugin } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { dynamisKey } from '@omne-harness/dynamis-cordis/cordis'
import { createCommandCatalog } from '@omne-harness/slash-command'
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
  constructor(ctx: Context, catalog: CommandCatalog<unknown>) {
    super(ctx)
    this.read = (asker, signal) => catalog.read(asker, signal)
    this.take = (asker, full, signal) => catalog.take(asker, full, signal)
  }
}

const slashCommandPlugin: Plugin.Object = {
  name: 'slash-command',
  inject: [dynamisKey],
  Config: slashCommandRowConfig,
  apply(ctx: Context, raw: unknown) {
    const config = slashCommandRowConfig.parse(raw)
    const sources = new CommandEntrySourcesService<unknown>(ctx)
    const catalog = createCommandCatalog<unknown>({
      sources: () => sources.sources(),
      declared: config.declaredSources,
      timeoutMs: config.timeoutMs,
    })
    new ReleaseCommandCatalog(ctx, {
      read: catalog.read,
      async take(asker, full, signal) {
        const owner = sources
          .sources()
          .find(slot => slot.source.space === full.slice(0, full.indexOf(':')))
        const release = owner === undefined ? () => {} : sources.hold(owner.source.name)
        try {
          return await catalog.take(asker, full, signal)
        } finally {
          release()
        }
      },
    })
  },
}

/** The command domain: the entry-sources point, and the list a session can name, asked of every source each time. */
export const slashCommandRow = defineRow({
  row: 'slash-command',
  implementation: 'real',
  manifest: {
    provides: [commandEntrySourcesKey, commandCatalogKey],
    injects: [dynamisKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: slashCommandPlugin,
})
