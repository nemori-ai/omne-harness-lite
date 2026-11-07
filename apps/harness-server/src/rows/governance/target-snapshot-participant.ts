import { z } from 'zod'
import {
  AssetsPublicationProjectionSchema,
  assetsPublicationFact,
} from '@omne-harness/assets-local'
import {
  GovernanceTargetBindingSchema,
  GovernanceTargetProjectionSchema,
  governanceTargetProjectionFact,
} from '@omne-harness/governance-local'
import {
  SettingsOwnerProjectionSchema,
  StandalonePublicationProjectionSchema,
  SettingsValueProjectionSchema,
  settingsAssetsProjectionFact,
  settingsStandaloneProjectionFact,
  settingsStandalonePublicationFact,
  settingsValueProjectionFact,
} from '@omne-harness/settings-local'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { GOVERNANCE_PUBLICATIONS, governancePublicationsSchema } from './current-publications.ts'
import { PERMISSION_SUPPORT } from './permission-protocol.ts'
import { permissionSupportSchema } from './permission-support-participant.ts'
import {
  TARGET_SNAPSHOT,
  targetCapture,
  targetSnapshotFact,
  targetSnapshotSchema,
} from './target-snapshot.ts'
import { joinTargetSnapshot } from './target-snapshot-join.ts'

export default {
  ...TARGET_SNAPSHOT,
  execute(facts, port) {
    const binding = GovernanceTargetBindingSchema.parse(facts['binding'])
    const joined = joinTargetSnapshot({
      binding,
      capture: targetCapture(binding),
      governance: GovernanceTargetProjectionSchema.parse(
        port.requireFact(governanceTargetProjectionFact),
      ),
      values: SettingsValueProjectionSchema.parse(port.requireFact(settingsValueProjectionFact)),
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
      released: governancePublicationsSchema.parse(port.requireFact(GOVERNANCE_PUBLICATIONS)),
      supported: permissionSupportSchema.parse(port.requireFact(PERMISSION_SUPPORT)),
    })
    if (joined === undefined) return { kind: 'unsupported', basis: { reason: 'current-target' } }
    const result = z.json().parse(targetSnapshotSchema.parse(joined))
    port.provideFact(targetSnapshotFact, result)
    return { kind: 'participated', response: result }
  },
} satisfies ParticipantModule
