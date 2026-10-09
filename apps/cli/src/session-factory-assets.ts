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
    Object.freeze({
      number: 2,
      content: Object.freeze({
        category: 'agent_definition' as const,
        body: toOpaqueJson({
          references: [],
          attributes: [
            timingPreference('first_token_wait_limit', 'PT2M'),
            timingPreference('post_first_token_stall_limit', 'PT30S'),
          ],
          contextSessionSeed: { required: [], initial: [], fixed: [] },
        }),
      }),
      publishedAt: '2026-10-09T05:06:56Z',
    }),
  ]),
})
/** Exact AD1 duration domain; defaults belong to this release, not the runtime. */
function timingPreference(item: string, initial: string) {
  return {
    item,
    kind: 'setting',
    category: 'preference',
    default: initial,
    domain: {
      kind: 'open',
      schema: {
        allOf: [
          {
            $ref: 'https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/tool-definition/v3/tool-definition.schema.json#/$defs/Duration',
          },
          { pattern: '[1-9]' },
        ],
      },
    },
  }
}
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
