import { canonicalText } from '@omne-harness/authorization'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { assetsPublicationCommand, assetsPublicationFact } from '@omne-harness/assets-local'
import {
  GovernanceAdoptionCurrentSchema,
  governanceAdoptionCurrentFact,
  type GovernanceAdoptionProjection,
} from '@omne-harness/governance-local'
import {
  SettingsProjectionBindingSchema,
  settingsAssetsProjectionFact,
  settingsStandaloneProjectionFact,
  settingsStandalonePublicationFact,
  standaloneSettingsPublicationCommand,
} from '@omne-harness/settings-local'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { canonicalDigest } from '@omne-harness/tool'
import { GOVERNANCE_PUBLICATIONS } from './current-publications.ts'
import { PERMISSION_SUPPORT, SUPPORT_PARTICIPANT } from './permission-protocol.ts'

export const ADOPTION_CURRENT_PARTICIPANT = {
  participant: 'harness.governance-current',
  protocol: '1',
}
export const adoptionCurrentRequestSchema = GovernanceAdoptionCurrentSchema.omit({
  targets: true,
  enforcementBindings: true,
}).extend({
  capture: SettingsProjectionBindingSchema,
})
export type AdoptionCurrentRequest = z.infer<typeof adoptionCurrentRequestSchema>

export function createGovernanceAdoptionProjection(
  transactionDomain: string,
): GovernanceAdoptionProjection {
  return input => {
    const targets = [
      ...new Map(
        input.command.complete
          .flatMap(member => member.selectedTargets)
          .map(target => [canonicalText(target), target]),
      ).values(),
    ]
    const capture = SettingsProjectionBindingSchema.parse({
      domain: {
        scope: { kind: 'tenant', tenant: input.command.scope.tenantRef },
        transactionDomain,
      },
      principalRef: input.binding.ref.principalRef,
      captureId: canonicalDigest(input.binding).slice(7),
      request: {
        deploymentRef: input.command.scope.deploymentId,
        mode: 'runtime',
        targets,
        selectionRef: null,
      },
    })
    const request = adoptionCurrentRequestSchema.parse({
      binding: input.binding,
      epoch: input.epoch,
      transactionDomain,
      capture,
    })
    return [
      { participant: 'harness.tool-permission-release', facts: {} },
      { participant: SUPPORT_PARTICIPANT.participant, facts: {} },
      assetsPublicationCommand(capture),
      standaloneSettingsPublicationCommand(capture),
      {
        participant: ADOPTION_CURRENT_PARTICIPANT.participant,
        facts: { request: z.json().parse(request) },
      },
    ]
  }
}

export function governanceCurrentParticipant(): SqlMaterialCatalog['participants'][number] {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const url = new URL(`./adoption-current-participant.${extension}`, import.meta.url)
  return {
    ...ADOPTION_CURRENT_PARTICIPANT,
    moduleUrl: url.href,
    codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
    ownedTables: [],
    readTables: [],
    allowedFunctions: [],
    grouping: 'groupable',
    requiresFacts: [
      GOVERNANCE_PUBLICATIONS,
      PERMISSION_SUPPORT,
      assetsPublicationFact,
      settingsAssetsProjectionFact,
      settingsStandalonePublicationFact,
      settingsStandaloneProjectionFact,
    ],
    providesFacts: [governanceAdoptionCurrentFact],
  }
}
