import { heldPoint } from '@omne-harness/assets'
import { type Context, type Plugin, Service } from '@deepseek-ai/cordis'
import { declare, deployment, list, type Contract, type Scope } from '@omne-harness/dynamis'
import { dynamisKey, type DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import {
  isSkillSourcePrefix,
  SKILL_ENTRY_SOURCES_POINT,
  type SkillAccess,
  type SkillCatalog,
  type SkillEntrySource,
} from '@omne-harness/skill-contract'

/**
 * The Skill catalog as a service. It lists and searches the current lawful set that the caller may
 * read.
 *
 * @owner packages/skills/skill-cordis-contract
 */
export abstract class SkillCatalogService<P, S> extends Service implements SkillCatalog<P, S> {
  static readonly provide = 'skillCatalog'
  constructor(ctx: Context) {
    super(ctx, SkillCatalogService.provide)
  }
  abstract summaries(
    ...args: Parameters<SkillCatalog<P, S>['summaries']>
  ): ReturnType<SkillCatalog<P, S>['summaries']>
  abstract search(
    ...args: Parameters<SkillCatalog<P, S>['search']>
  ): ReturnType<SkillCatalog<P, S>['search']>
  abstract order(
    ...args: Parameters<SkillCatalog<P, S>['order']>
  ): ReturnType<SkillCatalog<P, S>['order']>
}

export const skillCatalogKey = SkillCatalogService.provide

/**
 * The Skill access as a service: read and list of one Skill, each checked on the spot.
 *
 * @owner packages/skills/skill-cordis-contract
 */
export abstract class SkillAccessService<P, S> extends Service implements SkillAccess<P, S> {
  static readonly provide = 'skillAccess'
  constructor(ctx: Context) {
    super(ctx, SkillAccessService.provide)
  }
  abstract read(
    ...args: Parameters<SkillAccess<P, S>['read']>
  ): ReturnType<SkillAccess<P, S>['read']>
  abstract list(
    ...args: Parameters<SkillAccess<P, S>['list']>
  ): ReturnType<SkillAccess<P, S>['list']>
}

export const skillAccessKey = SkillAccessService.provide

const SOURCE_EXAMPLE = [
  '{"point":"skill.entry-sources","key":"notes__","module":"skills.js","export":"skills"}',
  'skills.js:',
  'const text = "# Weekly notes\\nList what was done this week.\\n"',
  'const label = "notes plugin"',
  'const page = ({ start, length }) => ({ ok: { text: text.slice(start, start + length), start, total: text.length, label } })',
  'export function skills() {',
  '  return {',
  '    prefix: "notes__",',
  '    list: async () => ({ ok: [{ name: "notes__weekly", description: "Write the weekly notes.", label }] }),',
  '    read: async (asker, name, { range }) => (name === "notes__weekly" ? page(range) : { failure: "not-found" }),',
  '    readFile: async (asker, name, path, { range }) =>',
  '      name !== "notes__weekly" ? { failure: "not-found" } : path === "SKILL.md" ? page(range) : { failure: "file-not-found" },',
  '    listFiles: async (asker, name) =>',
  '      name === "notes__weekly" ? { ok: { files: [{ path: "SKILL.md", size: text.length }], label } } : { failure: "not-found" },',
  '  }',
  '}',
].join('\n')

const entrySourcesContract: Contract = Object.freeze({
  name: SKILL_ENTRY_SOURCES_POINT,
  tree: 'server',
  arity: 'keyed-one',
  keyFrom: null,
  key: 'the name prefix the source owns, for example mcp__',
  gives:
    'the asking principal and tenant; the Skill name, file path and byte range when one is read',
  item: Object.freeze({
    kind: 'effect',
    fields: Object.freeze({
      prefix: 'string',
      list: 'function',
      read: 'function',
      readFile: 'function',
      listFiles: 'function',
    }),
  }),
  resolve: 'conflict',
  binding: 'run',
  onError:
    'a source whose listing throws, times out or names a Skill outside its prefix answers unavailable; the other sources and the Skills of the assets answer as usual',
  version: 1,
  revision: 1,
  keys: 'public',
  conformance: 'skillEntrySourceConformance',
  summary:
    'The sources of Skills besides the assets: each item lists and reads the Skills under one name prefix, for the one who asks. A source of the deployment is seen by every tenant and is locked.',
  example: SOURCE_EXAMPLE,
})

/** @owner packages/skills/skill-cordis-contract */
export class SkillEntrySourcesService<P> extends Service {
  static readonly provide = 'skillEntrySources'
  protected readonly tree: DynamisService
  constructor(ctx: Context) {
    super(ctx, SkillEntrySourcesService.provide)
    const tree = ctx.get(dynamisKey) as DynamisService
    tree.put([declare(entrySourcesContract)])
    this.tree = tree
  }

  /** The sources now in service for the one who asks: each under its own prefix; a prefix with two sources has none. */
  sources(asker: Scope): readonly SkillEntrySource<P>[] {
    const read = list<SkillEntrySource<P>>(
      this.tree.registry(),
      SKILL_ENTRY_SOURCES_POINT,
      null,
      asker,
    )
    if (read.kind !== 'read') return []
    return read.items.flatMap(({ entry }) => (entry.key === entry.item.prefix ? [entry.item] : []))
  }

  /** A source goes on the point as the one who contributes, and comes off with its scope. */
  contribute(source: SkillEntrySource<P>): void {
    if (!isSkillSourcePrefix(source.prefix))
      throw new TypeError(`${JSON.stringify(source.prefix)} is not a Skill source prefix`)
    const { tree } = this
    this.ctx.effect(
      () =>
        tree.put(by => [
          {
            point: SKILL_ENTRY_SOURCES_POINT,
            key: source.prefix,
            id: '',
            scope: deployment,
            rank: 0,
            digest: `${source.prefix}@${by.fiber}#${by.generation}`,
            item: source,
            lock: true,
          },
        ]),
      'skillEntrySources.contribute',
    )
  }
}
export const skillEntrySourcesKey = SkillEntrySourcesService.provide

export const skillEntrySourcesPlugin: Plugin.Object = {
  name: 'skill-entry-sources',
  inject: [dynamisKey],
  apply(ctx: Context) {
    new SkillEntrySourcesService(ctx)
  },
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    skillCatalog: SkillCatalogService<unknown, unknown>
    skillAccess: SkillAccessService<unknown, unknown>
    skillEntrySources: SkillEntrySourcesService<unknown>
  }
}

/** The point of the category: each layer's held definitions are its items. */
export const skillSkillsPoint = heldPoint({
  name: 'skill.skills',
  key: 'the skill name',
  summary: 'The skill definitions each layer holds, by name.',
})
