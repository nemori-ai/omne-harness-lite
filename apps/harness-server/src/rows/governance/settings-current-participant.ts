import { z } from 'zod'
import { canonicalText } from '@omne-harness/authorization'
import { canonicalDigest } from '@omne-harness/tool'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import {
  SettingsCommitCurrentSchema,
  SettingsPreparationCurrentSchema,
  settingsCommitCurrentFact,
  settingsPreparationCurrentFact,
} from '@omne-harness/settings-local/preparation'
import { targetSnapshotFact, targetSnapshotSchema, targetCapture } from './target-snapshot.ts'
import {
  settingsCurrentConfigurationSchema,
  settingsCurrentMaterial,
  settingsCurrentPlan,
} from './settings-current-material.ts'
import {
  settingsCurrentParticipant,
  settingsCurrentPhaseSchema,
  settingsCurrentRequestSchema,
} from './settings-current.ts'

const parameters = new URL(import.meta.url).searchParams
const phase = settingsCurrentPhaseSchema.parse(parameters.get('phase'))
const configuration = settingsCurrentConfigurationSchema.parse(
  JSON.parse(parameters.get('configuration') ?? 'null'),
)
const same = (a: unknown, b: unknown) => canonicalText(a) === canonicalText(b)

export default {
  participant: settingsCurrentParticipant(phase),
  protocol: `settings-current/1/${phase}/${canonicalDigest(configuration).slice(7)}`,
  execute(facts, port) {
    const request = settingsCurrentRequestSchema.parse(facts['request'])
    const snapshot = targetSnapshotSchema.parse(port.requireFact(targetSnapshotFact))
    if (!same(snapshot.binding, request.snapshot))
      throw new Error('Settings snapshot binding mismatch')
    const material = settingsCurrentMaterial(snapshot, configuration)
    if (material === undefined)
      return { kind: 'unsupported', basis: { reason: 'settings_external_source_required' } }
    if (phase === 'capture') {
      if (request.attempt !== null) throw new Error('Initial capture cannot carry an attempt')
      return { kind: 'participated', response: z.json().parse(settingsCurrentPlan(material)) }
    }
    const binding = request.attempt
    const capture = targetCapture(snapshot.binding)
    if (
      binding === null ||
      !same(
        {
          domain: binding.identity.domain,
          principalRef: binding.identity.principalRef,
          target: binding.identity.operation.target,
        },
        {
          domain: capture.domain,
          principalRef: capture.principalRef,
          target: snapshot.binding.target,
        },
      )
    )
      throw new Error('Settings current attempt mismatch')
    const current =
      phase === 'ready'
        ? SettingsPreparationCurrentSchema.parse({
            binding,
            basis: material.basis,
            standing: material.standing,
            sources: material.sources,
          })
        : SettingsCommitCurrentSchema.parse({
            binding,
            observation: { kind: 'available', material },
          })
    port.provideFact(
      phase === 'ready' ? settingsPreparationCurrentFact : settingsCommitCurrentFact,
      z.json().parse(current),
    )
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
