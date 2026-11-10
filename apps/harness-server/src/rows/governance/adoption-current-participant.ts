import { z } from 'zod'
import { canonicalText } from '@omne-harness/authorization'
import {
  AssetsPublicationProjectionSchema,
  assetsPublicationFact,
} from '@omne-harness/assets-local'
import {
  GovernanceAdoptionCurrentSchema,
  governanceAdoptionCurrentFact,
} from '@omne-harness/governance-local'
import {
  SettingsOwnerProjectionSchema,
  StandalonePublicationProjectionSchema,
  settingsAssetsProjectionFact,
  settingsStandaloneProjectionFact,
  settingsStandalonePublicationFact,
} from '@omne-harness/settings-local'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { canonicalDigest } from '@omne-harness/tool'
import {
  ADOPTION_CURRENT_PARTICIPANT,
  adoptionCurrentRequestSchema,
  type AdoptionCurrentRequest,
} from './adoption-current.ts'
import { GOVERNANCE_PUBLICATIONS, governancePublicationsSchema } from './current-publications.ts'
import { currentGovernanceTargets } from './current-targets.ts'
import { PERMISSION_SUPPORT } from './permission-protocol.ts'
import { permissionSupportSchema } from './permission-support-participant.ts'

function bound(request: AdoptionCurrentRequest) {
  const { binding, capture } = request
  const scope = binding.ref.scope
  return (
    binding.ref.owner === 'adopt' &&
    capture.domain.scope.kind === 'tenant' &&
    capture.domain.scope.tenant === scope.tenantRef &&
    capture.domain.transactionDomain === request.transactionDomain &&
    capture.principalRef === binding.ref.principalRef &&
    capture.captureId === canonicalDigest(binding).slice(7) &&
    capture.request.deploymentRef === scope.deploymentId &&
    capture.request.mode === 'runtime' &&
    capture.request.selectionRef === null &&
    capture.request.targets.every(target => target.scopeRef === scope.tenantRef)
  )
}
const unavailable = () => ({
  kind: 'unsupported' as const,
  basis: { reason: 'current-publication' },
})

export default {
  ...ADOPTION_CURRENT_PARTICIPANT,
  execute(facts, port) {
    const request = adoptionCurrentRequestSchema.safeParse(facts['request'])
    if (!request.success || !bound(request.data)) return unavailable()
    const released = governancePublicationsSchema.parse(port.requireFact(GOVERNANCE_PUBLICATIONS))
    const support = permissionSupportSchema.parse(port.requireFact(PERMISSION_SUPPORT))
    const targets = currentGovernanceTargets({
      capture: request.data.capture,
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
    if (targets === undefined) return unavailable()
    const supported = new Set(support.map(value => canonicalText(value.binding)))
    const bindings = released
      .flatMap(value => value.declaration.enforcementBindings)
      .filter(binding => supported.has(canonicalText(binding)))
    const current = GovernanceAdoptionCurrentSchema.parse({
      binding: request.data.binding,
      epoch: request.data.epoch,
      transactionDomain: request.data.transactionDomain,
      targets,
      enforcementBindings: [
        ...new Map(bindings.map(binding => [canonicalText(binding), binding])).values(),
      ],
    })
    port.provideFact(governanceAdoptionCurrentFact, z.json().parse(current))
    return { kind: 'participated', response: z.json().parse(current) }
  },
} satisfies ParticipantModule
