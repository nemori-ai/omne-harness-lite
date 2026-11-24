import { type Context, type Plugin, Service } from '@deepseek-ai/cordis'
import { type Contract, declare, deployment, list } from '@omne-harness/dynamis'
import { dynamisKey, type DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import {
  type CommandCatalog,
  ENTRY_SOURCES_POINT,
  type EntrySource,
  type EntrySourceSlot,
  isName,
} from '@omne-harness/slash-command-contract'

const entrySourcesContract: Contract = Object.freeze({
  name: ENTRY_SOURCES_POINT,
  tree: 'server',
  arity: 'keyed-one',
  keyFrom: null,
  key: 'the name the source registers under; it also declares one namespace',
  gives: 'the asking tenant, subject and session; the named entry when one is taken',
  item: Object.freeze({
    kind: 'effect',
    fields: Object.freeze({
      name: 'string',
      space: 'string',
      official: 'boolean',
      list: 'function',
      take: 'function',
    }),
  }),
  resolve: 'conflict',
  binding: 'run',
  onError:
    'a source whose listing throws, times out or names an entry outside its namespace is marked missing; the other sources answer as usual',
  version: 1,
  revision: 1,
  keys: 'public',
  conformance: null,
  summary:
    'The sources of command entries: each lists and hands over the entries of one namespace.',
})

type Item<P> = EntrySource<P> & Readonly<{ official: boolean }>

/** @owner packages/slash-command/slash-command-cordis-contract */
export class CommandEntrySourcesService<P> extends Service {
  static readonly provide = 'commandEntrySources'
  protected readonly tree: DynamisService
  private readonly inflight = new Map<string, Set<symbol>>()
  private readonly idle = new Map<string, (() => void)[]>()
  constructor(ctx: Context) {
    super(ctx, CommandEntrySourcesService.provide)
    const tree = ctx.get(dynamisKey) as DynamisService
    tree.put([declare(entrySourcesContract)])
    this.tree = tree
  }

  /** The sources now in service. A name with two sources has none; a point that cannot be read gives none. */
  sources(): readonly EntrySourceSlot<P>[] {
    const read = list<Item<P>>(this.tree.registry(), ENTRY_SOURCES_POINT, null, deployment)
    if (read.kind !== 'read') return []
    return read.items.map(({ entry }) => ({ source: entry.item, official: entry.item.official }))
  }

  /** One taking from this source is in flight until the returned function is called. */
  hold(name: string): () => void {
    const held = this.inflight.get(name) ?? new Set<symbol>()
    this.inflight.set(name, held)
    const mark = Symbol('source-take')
    held.add(mark)
    return () => {
      held.delete(mark)
      if (held.size > 0) return
      for (const wake of this.idle.get(name) ?? []) wake()
      this.idle.delete(name)
    }
  }

  /** A source goes on the point as the one who contributes; it is taken off once its takings in flight have ended. */
  contribute(
    source: EntrySource<P>,
    options: Readonly<{ official: boolean }> = { official: false },
  ): void {
    if (!isName(source.name) || !isName(source.space))
      throw new TypeError(
        `${JSON.stringify(source.name)} or ${JSON.stringify(source.space)} is not a source name`,
      )
    const { tree } = this
    const item: Item<P> = Object.freeze({ ...source, official: options.official })
    const drained = (): Promise<void> =>
      (this.inflight.get(source.name)?.size ?? 0) === 0
        ? Promise.resolve()
        : new Promise(resolve => {
            this.idle.set(source.name, [...(this.idle.get(source.name) ?? []), resolve])
          })
    this.ctx.effect(
      () =>
        tree.put(
          by => [
            {
              point: ENTRY_SOURCES_POINT,
              key: source.name,
              id: '',
              scope: deployment,
              rank: 0,
              digest: `${source.name}@${by.fiber}#${by.generation}`,
              item,
            },
          ],
          { drain: drained },
        ),
      'commandEntrySources.contribute',
    )
  }
}
export const commandEntrySourcesKey = CommandEntrySourcesService.provide

export const commandEntrySourcesPlugin: Plugin.Object = {
  name: 'command-entry-sources',
  inject: [dynamisKey],
  apply(ctx: Context) {
    new CommandEntrySourcesService(ctx)
  },
}

/** @owner packages/slash-command/slash-command-cordis-contract */
export abstract class CommandCatalogService<P> extends Service implements CommandCatalog<P> {
  static readonly provide = 'commandCatalog'
  constructor(ctx: Context) {
    super(ctx, CommandCatalogService.provide)
  }
  abstract readonly read: CommandCatalog<P>['read']
  abstract readonly take: CommandCatalog<P>['take']
}
export const commandCatalogKey = CommandCatalogService.provide
