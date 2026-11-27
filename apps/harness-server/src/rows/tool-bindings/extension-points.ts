import { randomBytes } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { scopeOfLayer } from '@omne-harness/assets'
import type { Registry } from '@omne-harness/dynamis'
import { dynamisKey, type DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import { targetOf } from '@omne-harness/plugin-host-local'
import { judgeMember, reasonText, type Member, type Target } from '@omne-harness/plugin-protocol'
import {
  attachExtensionSight,
  createRevisions,
  type Admission,
  type ClientTree,
  type ExtensionSight,
  type PointRules,
} from '@omne-harness/plugin-tools'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import type { CallAccess, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { pluginReportsKey, type PluginReportsService } from '../plugin-access/reports-service.ts'
import { serverPointOf } from '../plugin-server/index.ts'

type Parent = CallAccess<unknown> & Readonly<{ request: FixedToolRequest }>

export type ExtensionSightPorts = Readonly<{
  /** The registry of the server tree now, or nothing when the tree is not there. */
  registry(): Registry | undefined
  /** What the connected clients of a tenant told, or nothing when that cannot be read now. */
  reportsOf(tenant: string): readonly ClientTree[] | undefined
  onChanged(listener: (registry: Registry) => void): () => void
  /** What names this process in a revision. */
  process: string
  admission?: ExtensionSight['admission']
}>

export type ExtensionSights = Readonly<{
  of(tenant: string): ExtensionSight
  revision(): string
  close(): void
}>

/** The trees as each tenant may see them. The revisions are of the registry of this process, the same for every tenant. */
export function createExtensionSights(ports: ExtensionSightPorts): ExtensionSights {
  const revisions = createRevisions({ process: ports.process })
  const first = ports.registry()
  if (first !== undefined) revisions.record(first)
  const stop = ports.onChanged(registry => revisions.record(registry))
  return {
    of: tenant => ({
      scope: scopeOfLayer('tenant', tenant),
      server: () => ports.registry() ?? 'unavailable',
      clients: () => ports.reportsOf(tenant) ?? 'unavailable',
      revisions,
      ...(ports.admission !== undefined && { admission: ports.admission }),
    }),
    revision: () => revisions.current(),
    close: stop,
  }
}

const PROBES: Readonly<Record<'data' | 'directory' | 'code', Omit<Member, 'point'>>> = {
  data: { key: 'k', data: {} },
  directory: { key: 'k', directory: 'd' },
  code: { key: 'k', module: 'm.js', export: 'm' },
} as unknown as Readonly<Record<'data' | 'directory' | 'code', Omit<Member, 'point'>>>

const judgedRules = (rules: PointRules) => ({
  binding: rules.binding,
  item: {
    kind: rules.item.kind,
    fields: Object.fromEntries(rules.item.fields.map(field => [field.name, field.kind])),
  },
  ...(rules.scopes !== undefined && { scopes: rules.scopes }),
})

function admissionOf(ctx: Context): NonNullable<ExtensionSight['admission']> {
  return (side, name, rules, form): Admission => {
    const point = side === 'server' ? serverPointOf(ctx, name) : undefined
    if (side === 'server' && point === undefined)
      return { open: false, reason: `${name} is not a point now` }
    const target: Target =
      point?.kind === 'category'
        ? targetOf(point)
        : { kind: 'point', rules: point?.rules ?? (judgedRules(rules) as never), form }
    const way =
      target.kind === 'category'
        ? target.takes === 'none'
          ? 'directory'
          : target.takes
        : rules.item.kind === 'data'
          ? 'data'
          : 'code'
    const judged = judgeMember(target, { point: name, ...PROBES[way] } as Member)
    if (judged.kind === 'not') return { open: false, reason: reasonText(judged.reason) }
    return point?.kind === 'category'
      ? { open: true, way, category: point.category }
      : { open: true, way }
  }
}

const sights = new WeakMap<Context, ExtensionSights>()

/** One set of sights for the row, made at the first call: the registry is followed from then on. */
function sightsOf(ctx: Context): ExtensionSights {
  const known = sights.get(ctx)
  if (known !== undefined) return known
  const tree = (): DynamisService | undefined => ctx.get(dynamisKey) as DynamisService | undefined
  const made = createExtensionSights({
    registry: () => tree()?.registry(),
    reportsOf: tenant =>
      (ctx.get(pluginReportsKey) as PluginReportsService | undefined)?.reportsOf(tenant),
    onChanged: listener => ctx.on('dynamis-cordis/changed', listener),
    process: randomBytes(2).toString('hex'),
    admission: admissionOf(ctx),
  })
  sights.set(ctx, made)
  ctx.effect(() => () => made.close(), 'tool-bindings.extension-points.close')
  return made
}

export const extensionRevisionOf = (ctx: Context): string => sightsOf(ctx).revision()

/** OmneExtensionPoints sees the trees as the tenant the call acts for; the model gives no tenant. */
export function bindReleaseExtensionPoints(
  ctx: Context,
  parent: Parent,
  scope: ToolExecutionScope,
): ToolExecutionScope {
  const tenant = tenantCodec.encode(parent.tenant)
  if (!tenant.ok) return scope
  return attachExtensionSight(scope, sightsOf(ctx).of(tenant.value))
}
