import {
  eventTypeNameSchema,
  sourceNameSchema,
  standingItemsSchema,
  type SourceDeclaration,
  type StandingItem,
} from '@omne-harness/notification-contract'
import type { ReportedClient } from '@omne-harness/plugin-access'
import type { ListedPlugin, ListedPlugins } from '@omne-harness/plugin-host-local'
import type { StaticBlock, SuppliedBlockDescriptor } from '@omne-harness/runtime-context-contract'
import { ARRIVAL_TYPES } from './arrivals.ts'

export const PLUGIN_LOAD_FAILURES_KEY = 'plugin.load-failures'

const SOURCE = sourceNameSchema.parse('extensions.changes')
const LOAD_FAILED = eventTypeNameSchema.parse('load-failed')
const TITLE_MAX = 200

/** The extensions as a source of notification: a standing type open while a held one cannot be loaded, and what arrives. */
export const EXTENSIONS_SOURCE: SourceDeclaration = {
  name: SOURCE,
  label: '拓展',
  types: [
    {
      name: LOAD_FAILED,
      label: '一份拓展装不上',
      description:
        '这个租户在持并启用的一份拓展，有客户端装不上它，或连着起不来之后把它停掉了。它在那里不生效，界面是自带的样子。修好再发布，或禁用它，这一条就没了。',
      kind: { kind: 'standing', binding: PLUGIN_LOAD_FAILURES_KEY },
      subject: { presence: 'required', hint: '哪一份拓展，写成 类别:名字' },
      subscribable: ['person', 'agent'],
      nameable: [],
      defaults: { person: 'strong', agent: 'off' },
      external: false,
    },
    ...ARRIVAL_TYPES,
  ],
}

/** Since when each failure stands: the first time it was seen, forgotten once it is seen no more. */
export type FirstSeen = Readonly<{ since(tenant: string, standing: readonly string[]): string[] }>

export function createFirstSeen(now: () => string): FirstSeen {
  const seen = new Map<string, Map<string, string>>()
  return {
    since(tenant, standing) {
      const before = seen.get(tenant) ?? new Map<string, string>()
      const next = new Map(standing.map(key => [key, before.get(key) ?? now()]))
      if (next.size === 0) seen.delete(tenant)
      else seen.set(tenant, next)
      return standing.map(key => next.get(key) as string)
    },
  }
}

type Failed = Readonly<{ plugin: string; clients: number; held: boolean; reason: string | null }>

/** A plugin counts as failed where a client says so of the version the tenant holds now; one that waits is not failed. */
function failedOf(plugins: readonly ListedPlugin[], clients: readonly ReportedClient[]): Failed[] {
  return plugins
    .filter(plugin => plugin.enabled)
    .flatMap(plugin => {
      const told = clients.flatMap(each =>
        each.plugins.filter(
          report =>
            report.name === plugin.name &&
            `sha256:${report.version}` === plugin.held.version &&
            report.state !== 'loaded' &&
            report.waiting === undefined,
        ),
      )
      const [first] = told
      if (first === undefined) return []
      const failed = told.find(report => report.state === 'failed')
      return [
        {
          plugin: plugin.name,
          clients: told.length,
          held: failed === undefined,
          reason: (failed ?? first).reason,
        },
      ]
    })
}

function titleOf({ plugin, clients, held, reason }: Failed): string {
  const what = held
    ? '被停掉了：应用连着两次带着它起不来'
    : `${clients > 1 ? `在 ${String(clients)} 个客户端` : ''}装不上${reason === null ? '' : `：${reason}`}`
  return [...`plugin ${plugin} ${what}`].slice(0, TITLE_MAX).join('')
}

export function standingItemsOfFailures(
  tenant: string,
  plugins: readonly ListedPlugin[],
  clients: readonly ReportedClient[],
  first: FirstSeen,
): readonly StandingItem[] {
  const failed = failedOf(plugins, clients)
  const since = first.since(
    tenant,
    failed.map(each => each.plugin),
  )
  return standingItemsSchema.parse(
    failed.map((each, at) => ({
      id: `${SOURCE}/plugin/${each.plugin}/${LOAD_FAILED}`,
      source: SOURCE,
      type: LOAD_FAILED,
      subject: `plugin:${each.plugin}`,
      title: titleOf(each),
      locator: { kind: 'extension', ref: `plugin:${each.plugin}` },
      since: since[at],
    })),
  )
}

const descriptor = Object.freeze({
  key: PLUGIN_LOAD_FAILURES_KEY,
  kind: 'supplied',
  // The same schema as Notification's need: a block bound without translation must have the need's shape.
  schema: standingItemsSchema,
  consumers: ['coordinator'],
  required: true,
  disclosure: 'plain',
  carriesPrevious: false,
  volatility: 'per-read',
  recovery: 'reread',
} satisfies SuppliedBlockDescriptor<typeof PLUGIN_LOAD_FAILURES_KEY, readonly StandingItem[]>)

export type LoadFailurePorts = Readonly<{
  tenantText(tenant: unknown): string | null
  listed(tenant: string): Promise<ListedPlugins>
  /** What the connected clients of a tenant told; undefined when that cannot be read now. */
  reports(tenant: string): readonly ReportedClient[] | undefined
  now(): string
}>

/** What a tenant holds that some client could not load, as a block; not known when either side cannot be read. */
export function loadFailuresBlock(ports: LoadFailurePorts): StaticBlock {
  const first = createFirstSeen(ports.now)
  return Object.freeze({
    declaration: descriptor,
    supply: async ({ tenant }) => {
      const text = ports.tenantText(tenant)
      const clients = text === null ? undefined : ports.reports(text)
      const holding = text === null || clients === undefined ? undefined : await ports.listed(text)
      if (text === null || clients === undefined || holding?.kind !== 'read')
        return { kind: 'unknown' } as const
      const value = standingItemsOfFailures(text, holding.plugins, clients, first)
      return { kind: 'value', value } as const
    },
  })
}
