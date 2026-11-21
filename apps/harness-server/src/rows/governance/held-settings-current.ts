import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { assetsSettingsProjectionCommand } from '@omne-harness/assets-local'
import {
  SettingsProjectionBindingSchema,
  settingsValueProjectionCommand,
  settingsValueProjectionFact,
  standaloneSettingsProjectionCommand,
  type SettingsProjectionBinding,
  type SettingsValueProjection,
} from '@omne-harness/settings-local'
import {
  settingsCommitCurrentFact,
  settingsPreparationCurrentFact,
} from '@omne-harness/settings-local/preparation'
import type { FactCommandV2, SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { canonicalDigest } from '@omne-harness/tool'
import { canonicalText } from '@omne-harness/authorization'
import {
  settingsCurrentMaterial,
  tenantSettingsCurrentConfigurationSchema,
  type TenantSettingsCurrentConfiguration,
  type TenantSettingsCurrentMaterial,
} from './tenant-settings-current.ts'

/** Writes to asset targets that no release governs: the holding itself says what is current. */
export const HELD_SETTINGS_CONFIGURATION: TenantSettingsCurrentConfiguration = {
  destination: 'harness.governance.held-asset-settings',
  sourceRoute: 'harness.governance.held-asset-settings',
  required: [],
}

export const HELD_SETTINGS_PHASES = ['ready', 'commit'] as const
export type HeldSettingsPhase = (typeof HELD_SETTINGS_PHASES)[number]
export const heldSettingsCurrentParticipant = (phase: HeldSettingsPhase) =>
  `harness.held-settings-current.${phase}`
export const heldSettingsCurrentProtocol = (
  phase: HeldSettingsPhase,
  configuration: TenantSettingsCurrentConfiguration,
) =>
  `harness-held-settings-current/1/${phase}/${createHash('sha256').update(JSON.stringify(configuration)).digest('hex')}`

export const heldSettingsCurrentRequestSchema = z.strictObject({
  binding: z.json(),
  capture: SettingsProjectionBindingSchema,
})

/** The facts a held target's current is read from: the holding, the stored definition, the values. */
export function heldSettingsCommands(capture: SettingsProjectionBinding): readonly FactCommandV2[] {
  return [
    assetsSettingsProjectionCommand(capture, { excluded: [] }),
    standaloneSettingsProjectionCommand(capture),
    settingsValueProjectionCommand(capture),
  ]
}

export function heldSettingsCurrentMaterial(
  values: SettingsValueProjection,
  capture: SettingsProjectionBinding,
  configuration: TenantSettingsCurrentConfiguration,
): TenantSettingsCurrentMaterial | undefined {
  const target = capture.request.targets[0]
  if (
    canonicalText(values.binding) !== canonicalText(capture) ||
    capture.request.targets.length !== 1 ||
    target?.kind !== 'asset' ||
    values.views.length !== 1 ||
    canonicalText(values.views[0]!.view.target) !== canonicalText(target)
  )
    return undefined
  const subjectRef = canonicalDigest({ tenant: target.scopeRef, target })
  return settingsCurrentMaterial({
    values: values.views[0]!,
    tenantRef: target.scopeRef,
    transactionDomain: capture.domain.transactionDomain,
    mode: capture.request.mode,
    declaration: {
      ownerRef: 'assets',
      subjectRef,
      revision: canonicalDigest(values.views[0]!.view.definitionRef),
    },
    authority: {
      ownerRef: 'assets',
      subjectRef,
      revision: canonicalDigest({ mode: 'management' }),
    },
    configuration,
  })
}

export function heldSettingsCurrentParticipants(
  configuration: TenantSettingsCurrentConfiguration,
): SqlMaterialCatalog['participants'] {
  const fixed = tenantSettingsCurrentConfigurationSchema.parse(configuration)
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const file = new URL(`./held-settings-current-participant.${extension}`, import.meta.url)
  const codeDigest = createHash('sha256').update(readFileSync(file)).digest('hex')
  return HELD_SETTINGS_PHASES.map(phase => {
    const url = new URL(file)
    url.searchParams.set('phase', phase)
    url.searchParams.set('configuration', JSON.stringify(fixed))
    return {
      participant: heldSettingsCurrentParticipant(phase),
      protocol: heldSettingsCurrentProtocol(phase, fixed),
      moduleUrl: url.href,
      codeDigest,
      ownedTables: [],
      readTables: [],
      allowedFunctions: [],
      grouping: 'groupable',
      requiresFacts: [settingsValueProjectionFact],
      providesFacts: [
        phase === 'ready' ? settingsPreparationCurrentFact : settingsCommitCurrentFact,
      ],
    }
  })
}
