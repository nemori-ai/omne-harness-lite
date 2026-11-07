import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { SettingsIdSchema } from '@omne-harness/settings'
import type { FactCommandV2 } from '@omne-harness/sql-contract'
import { domainSchema, PARTICIPANT } from './schema.ts'
import {
  SETTINGS_CHECKPOINT_PARTICIPANTS,
  SETTINGS_READY_PARTICIPANTS,
  SETTINGS_COMMIT_PARTICIPANTS,
  SETTINGS_RECOVERY_PARTICIPANTS,
} from './recovery-materials.ts'
import { PREPARATION_READ, type PreparationRead } from './preparation-read-schema.ts'
import { type FinalizationRequest } from './finalization-schema.ts'
import { SOURCE_READINESS_PARTICIPANT } from './source-readiness.ts'
import { intentObservationSchema } from './preparation-observation.ts'
import { intentAttemptIdentity } from './intent-records.ts'
import type { IntentIdentity } from './intent-schema.ts'
import type { SettingsPreparationOptions, PreparationPhase } from './preparation-types.ts'
import { equal, json } from './encoding.ts'
const participants = {
  checkpoint: SETTINGS_CHECKPOINT_PARTICIPANTS,
  ready: SETTINGS_READY_PARTICIPANTS,
  commit: SETTINGS_COMMIT_PARTICIPANTS,
  recovery: SETTINGS_RECOVERY_PARTICIPANTS,
}
function phaseCommands(
  phase: PreparationPhase,
  request: FinalizationRequest,
  extra: readonly FactCommandV2[],
) {
  if (phase !== 'ready' && phase !== 'commit' && extra.length !== 0)
    throw new Error('Unexpected Settings current commands')
  if (extra.some(command => participants[phase].includes(command.participant)))
    throw new Error('Settings current commands cannot replace phase owners')
  return [
    ...extra,
    ...participants[phase].map(participant => ({
      participant,
      facts:
        participant === SOURCE_READINESS_PARTICIPANT
          ? { binding: json(request.binding) }
          : { kind: 'finalize', request: json(request) },
    })),
  ]
}
export class PreparationRolledBack extends Error {}
export class PreparationSql<Context> {
  readonly options: SettingsPreparationOptions<Context>
  constructor(options: SettingsPreparationOptions<Context>) {
    this.options = options
    domainSchema.parse(options.domain)
    for (const registration of Object.values(options.registrations)) {
      SettingsIdSchema.parse(registration.combinationVersion)
      z.string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(registration.manifestDigest)
    }
  }
  async read(input: PreparationRead) {
    const result = await this.options.storage.read({
      domain: this.options.domain,
      ...PREPARATION_READ,
      requestKey: randomUUID(),
      input: json(input),
    })
    if (result.kind !== 'read') throw new Error('Settings preparation observation unavailable')
    return result.output
  }
  async root(identity: IntentIdentity) {
    const result = intentObservationSchema.parse(await this.read({ kind: 'root', identity }))
    if (result.kind === 'found' && !equal(result.identity, identity))
      throw new Error('Settings root observation binding mismatch')
    return result
  }
  async write(request: FinalizationRequest, extra: readonly FactCommandV2[] = []) {
    const phase: PreparationPhase =
      request.kind === 'seal' || request.kind === 'cancel' ? 'recovery' : request.kind
    const registration = this.options.registrations[phase]
    const identity =
      request.kind === 'commit'
        ? intentAttemptIdentity(request.binding.identity, request.binding.attemptId)
        : {
            ...this.options.domain,
            operation: `settings.${phase}`,
            protocolVersion: '2' as const,
            operationKey: randomUUID(),
          }
    const result = await this.options.storage.commit({
      identity,
      ...registration,
      commands: phaseCommands(phase, request, extra),
    })
    if (
      result.kind === 'rolled_back' ||
      (result.kind === 'identity_conflict' && result.existing.kind === 'rolled_back')
    )
      throw new PreparationRolledBack('Settings attempt has a durable rollback')
    if (result.kind !== 'committed')
      throw new Error('Settings preparation transaction outcome unavailable')
    const reply = result.responses.find(value => value.participant === PARTICIPANT)?.reply.response
    if (reply === undefined) throw new Error('Settings preparation response missing')
    return reply
  }
}
