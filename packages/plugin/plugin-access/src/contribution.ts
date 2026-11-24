import type { AccessContribution, AnswerOf } from '@omne-harness/access-cordis-contract'
import { pluginProtocol, wantedOf, type PluginProtocol } from '@omne-harness/plugin-protocol'
import { actingFor, tenantText } from './acting.ts'
import { createWantedObservation } from './observe-wanted.ts'
import type {
  Asker,
  PluginReports,
  PluginSource,
  SourcePlugin,
  TargetTenantPrincipals,
} from './ports.ts'

export type PluginContributionInput = Readonly<{
  principals: TargetTenantPrincipals
  source: PluginSource
  reports: PluginReports
}>

type Answer<K extends keyof PluginProtocol['operations']> = AnswerOf<
  PluginProtocol['operations'][K]
>

/** The most one read gives back; a larger limit reads one part of this size. A part travels as text, and this many bytes fit the text one answer may carry. */
const PART_BYTES = 720_000

const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const UNKNOWN = Object.freeze({ outcome: 'unknown' as const })
const notFound = (reason: 'plugin' | 'file') => ({
  outcome: 'not-found' as const,
  body: { reason },
})

/** What the source offers that some side is to load: a name offered twice is not among it. */
function loadable(offered: readonly SourcePlugin[]): readonly SourcePlugin[] {
  const names = new Set(
    (['client', 'server'] as const).flatMap(side => wantedOf(offered, side).map(w => w.name)),
  )
  return offered.filter(each => names.has(each.manifest.name))
}

export function createPluginContribution(
  input: PluginContributionInput,
): AccessContribution<PluginProtocol> {
  const { principals, source, reports } = input
  const listed = (asker: Asker) =>
    source.list(asker).catch(() => ({ kind: 'unavailable' as const }))

  return {
    protocol: pluginProtocol,
    operations: {
      async 'list-wanted'(call, body): Promise<Answer<'list-wanted'>> {
        const tenant = tenantText(body.tenant)
        const principal = await actingFor(principals, call.principal, tenant)
        if ('outcome' in principal) return principal
        const list = await listed({ principal, tenant })
        if (list.kind !== 'read') return UNAVAILABLE
        const byName = new Map(list.offered.map(each => [each.manifest.name, each]))
        const plugins = wantedOf(list.offered, body.side).map(({ name, version }) => {
          const { manifestText, files } = byName.get(name)!
          return {
            name,
            version,
            manifest: manifestText,
            files: files.map(({ path, digest, bytes }) => ({ path, digest, bytes })),
          }
        })
        return { outcome: 'succeeded', body: { plugins } }
      },
      async 'read-file'(call, body): Promise<Answer<'read-file'>> {
        const tenant = tenantText(body.tenant)
        const principal = await actingFor(principals, call.principal, tenant)
        if ('outcome' in principal) return principal
        const asker = { principal, tenant }
        const list = await listed(asker)
        if (list.kind !== 'read') return UNAVAILABLE
        const { name, version, path, offset, limit } = body
        const plugin = loadable(list.offered).find(
          each => each.manifest.name === name && each.version === version,
        )
        if (plugin === undefined) return notFound('plugin')
        if (!plugin.files.some(file => file.path === path)) return notFound('file')
        if (limit === 0) return { outcome: 'limited', body: {} }
        const at = { name, version, path, offset, limit: Math.min(limit, PART_BYTES) }
        const read = await source.read(asker, at).catch(() => ({ kind: 'unavailable' as const }))
        if (read.kind === 'absent') return notFound(read.what)
        if (read.kind !== 'read') return UNAVAILABLE
        return {
          outcome: 'succeeded',
          body: { part: read.part, next: read.next, bytes: read.bytes },
        }
      },
      async 'report-loaded'(call, body): Promise<Answer<'report-loaded'>> {
        const tenant = tenantText(body.tenant)
        const principal = await actingFor(principals, call.principal, tenant)
        if ('outcome' in principal) return principal
        const { plugins, points, parts } = body
        try {
          const kept = reports.record(tenant, body.client, { plugins, points, parts })
          return kept === 'kept' ? { outcome: 'succeeded', body: {} } : UNAVAILABLE
        } catch {
          return UNKNOWN
        }
      },
      async 'list-reports'(call, body): Promise<Answer<'list-reports'>> {
        const tenant = tenantText(body.tenant)
        const principal = await actingFor(principals, call.principal, tenant)
        if ('outcome' in principal) return principal
        try {
          return { outcome: 'succeeded', body: { clients: [...reports.reportsOf(tenant)] } }
        } catch {
          return UNAVAILABLE
        }
      },
    },
    observations: { 'observe-wanted': createWantedObservation({ principals, source, reports }) },
  }
}
