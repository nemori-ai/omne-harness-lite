import { z } from 'zod'
import { canonicalText } from '@omne-harness/authorization'
import {
  AssetsPublicationProjectionSchema,
  assetsPublicationFact,
} from '@omne-harness/assets-local'
import {
  GovernanceCatalogCurrentSchema,
  governanceCatalogCurrentFact,
} from '@omne-harness/governance-local'
import {
  SettingsOwnerProjectionSchema,
  StandalonePublicationProjectionSchema,
  settingsAssetsProjectionFact,
  settingsStandaloneProjectionFact,
  settingsStandalonePublicationFact,
} from '@omne-harness/settings-local'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import {
  CATALOG_CURRENT_PARTICIPANT,
  catalogCurrentRequestSchema,
  catalogCapture,
} from './catalog-current.ts'
import { GOVERNANCE_PUBLICATIONS, governancePublicationsSchema } from './current-publications.ts'
import { currentGovernanceCatalog } from './current-targets.ts'
import { PERMISSION_SUPPORT } from './permission-protocol.ts'
import { permissionSupportSchema } from './permission-support-participant.ts'

const unavailable = () => ({
  kind: 'unsupported' as const,
  basis: { reason: 'catalog-publication' },
})
export default {
  ...CATALOG_CURRENT_PARTICIPANT,
  execute(facts, port) {
    const request = catalogCurrentRequestSchema.safeParse(facts['request'])
    if (!request.success) return unavailable()
    const { binding, capture } = request.data
    if (
      canonicalText(capture) !== canonicalText(catalogCapture(binding)) ||
      canonicalText(binding.scope) !== canonicalText(binding.request.scope)
    )
      return unavailable()
    const released = governancePublicationsSchema.parse(port.requireFact(GOVERNANCE_PUBLICATIONS))
    const support = permissionSupportSchema.parse(port.requireFact(PERMISSION_SUPPORT))
    const current = currentGovernanceCatalog({
      capture,
      released,
      assets: SettingsOwnerProjectionSchema.parse(port.requireFact(settingsAssetsProjectionFact)),
      assetPublications: AssetsPublicationProjectionSchema.parse(
        port.requireFact(assetsPublicationFact),
      ),
      standalone: SettingsOwnerProjectionSchema.parse(
        port.requireFact(settingsStandaloneProjectionFact),
      ),
      standalonePublications: StandalonePublicationProjectionSchema.parse(
        port.requireFact(settingsStandalonePublicationFact),
      ),
    })
    if (current === undefined) return unavailable()
    const supported = new Set(support.map(value => canonicalText(value.binding)))
    const bindings = released
      .flatMap(value => value.declaration.enforcementBindings)
      .filter(value => supported.has(canonicalText(value)))
    const result = z.json().parse(
      GovernanceCatalogCurrentSchema.parse({
        binding,
        transactionDomain: binding.transactionDomain,
        epoch: binding.epoch,
        ...current,
        enforcementBindings: [
          ...new Map(bindings.map(value => [canonicalText(value), value])).values(),
        ],
      }),
    )
    port.provideFact(governanceCatalogCurrentFact, result)
    return { kind: 'participated', response: result }
  },
} satisfies ParticipantModule
