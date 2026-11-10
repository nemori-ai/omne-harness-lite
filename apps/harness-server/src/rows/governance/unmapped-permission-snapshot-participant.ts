import { z } from 'zod'
import { canonicalText } from '@omne-harness/authorization'
import {
  AssetsPublicationProjectionSchema,
  assetsPublicationFact,
} from '@omne-harness/assets-local'
import {
  GovernanceTargetBindingSchema,
  GovernanceDefinitionProjectionSchema,
  governanceSelectedDefinitionFact,
} from '@omne-harness/governance-local'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { GOVERNANCE_PUBLICATIONS, governancePublicationsSchema } from './current-publications.ts'
import { PERMISSION_SUPPORT } from './permission-protocol.ts'
import { permissionSupportSchema } from './permission-support-participant.ts'
import { targetCapture, targetSnapshotFact } from './target-snapshot.ts'
import {
  UNMAPPED_PERMISSION_SNAPSHOT,
  selectedDefinitionBinding,
  unmappedPermissionSnapshotSchema,
} from './unmapped-permission-snapshot.ts'

const equal = (a: unknown, b: unknown) => canonicalText(a) === canonicalText(b)
export default {
  ...UNMAPPED_PERMISSION_SNAPSHOT,
  execute(facts, port) {
    const binding = GovernanceTargetBindingSchema.parse(facts['binding'])
    const assets = AssetsPublicationProjectionSchema.parse(port.requireFact(assetsPublicationFact))
    const selected = GovernanceDefinitionProjectionSchema.parse(
      port.requireFact(governanceSelectedDefinitionFact),
    )
    const released = governancePublicationsSchema.parse(port.requireFact(GOVERNANCE_PUBLICATIONS))
    const support = permissionSupportSchema.parse(port.requireFact(PERMISSION_SUPPORT))
    const unavailable = () => ({
      kind: 'unsupported' as const,
      basis: { reason: 'unmapped-permission-target' },
    })
    if (
      binding.mode !== 'runtime' ||
      !equal(assets.binding, targetCapture(binding)) ||
      !equal(selected.binding, selectedDefinitionBinding(binding)) ||
      selected.observation.kind !== 'available'
    )
      return unavailable()
    const view = assets.views[0]
    if (assets.views.length !== 1 || view === undefined || !equal(view.target, binding.target))
      return unavailable()
    const { declaration, ...revisions } = selected.observation
    if (
      declaration.origin.kind !== 'asset' ||
      declaration.origin.assetId !== view.publicationRef.assetRef
    )
      return unavailable()
    const publications = released.filter(
      value =>
        value.publication.kind === 'asset' &&
        equal(value.publication.reference, view.publicationRef) &&
        equal(value.declaration, declaration),
    )
    const supported = new Set(support.map(value => canonicalText(value.binding)))
    if (
      publications.length !== 1 ||
      !declaration.enforcementBindings.every(value => supported.has(canonicalText(value)))
    )
      return unavailable()
    const result = z.json().parse(
      unmappedPermissionSnapshotSchema.parse({
        binding,
        ...revisions,
        kind: 'unmapped',
        declaration,
        ownerRevision: view.ownerRevision,
        enforcementBindings: declaration.enforcementBindings,
      }),
    )
    port.provideFact(targetSnapshotFact, result)
    return { kind: 'participated', response: result }
  },
} satisfies ParticipantModule
