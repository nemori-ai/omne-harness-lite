import { toOpaqueJson } from '@omne-harness-lite/content-blocks'
import { instantToRfc3339, type Clock } from '@omne-harness-lite/offer-expiry'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type { EvaluationStorageDependencies } from '@omne-harness-lite/evaluation-input-store'
import { installOfficialFactoryDefinition } from '@omne-harness-lite/evaluation-input-store/publication'

/** CLI release data. This publication timestamp does not change on installation or restart. */
export const officialSessionDefinition = Object.freeze({
  category: 'agent_definition' as const,
  name: 'omne:session',
})
export const officialSessionAsset = Object.freeze({
  id: 'omne.cli.session-agent',
  capability: officialSessionDefinition,
  origin: 'official' as const,
  versions: Object.freeze([
    Object.freeze({
      number: 1,
      content: Object.freeze({
        category: 'agent_definition' as const,
        body: toOpaqueJson({
          references: [],
          attributes: [],
          contextSessionSeed: { required: [], initial: [], fixed: [] },
        }),
      }),
      publishedAt: '2026-10-09T04:41:58Z',
    }),
  ]),
})
export function officialSessionManifest(
  existing: EvaluationStorageDependencies['deployedOfficial'],
) {
  const declared = existing.find(
    entry =>
      entry.capability.category === 'agent_definition' &&
      entry.capability.name === officialSessionDefinition.name,
  )
  if (declared?.meta)
    throw new TypeError('official CLI Session definition is not a meta capability')
  return declared
    ? existing
    : Object.freeze([
        ...existing,
        Object.freeze({ capability: officialSessionDefinition, meta: false }),
      ])
}
/** The application factory installs its release; membership and execution remain separately checked. */
export async function deployOfficialSessionDefinition(
  dependencies: EvaluationStorageDependencies,
  tenant: TenantId,
  clock: Clock,
): Promise<void> {
  const now = await clock.now()
  if (now === 'unavailable') throw new Error('official Session deployment clock unavailable')
  const result = await installOfficialFactoryDefinition(dependencies, {
    definition: officialSessionAsset,
    since: instantToRfc3339(now),
    holders: [
      { layer: 'organization', organization: tenant.organization },
      { layer: 'tenant', tenant },
    ],
  })
  if ('failure' in result) throw new Error(`official Session deployment ${result.failure}`)
}
