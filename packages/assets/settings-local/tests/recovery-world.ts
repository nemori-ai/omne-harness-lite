import {
  settingsOrganizationCurrentMaterials,
  type OrganizationCurrentConfiguration,
} from '../src/preparation.ts'
import { sourceSnapshotMaterials } from '../src/source-snapshot-materials.ts'
import { settingsStandaloneMaterials } from '../src/standalone-materials.ts'
import { randomUUID, createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
  type DomainRef,
} from '@omne-harness/sql-contract'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import {
  settingsRecoveryMaterials,
  SETTINGS_RECOVERY_PARTICIPANTS,
  SETTINGS_READY_PARTICIPANTS,
  SETTINGS_COMMIT_PARTICIPANTS,
  SETTINGS_CHECKPOINT_PARTICIPANTS,
} from '../src/recovery-materials.ts'
import { TERMINAL_MIGRATION } from '../src/terminal-schema.ts'
import { SETTINGS_PREPARING_MIGRATION } from '../src/preparing-migration.ts'
import { SOURCE_RETENTION_MIGRATION } from '../src/source-retention-schema.ts'
import { RESULT_FACT } from '../src/schema.ts'
import { PREPARATION_CURRENT, type FinalizationRequest } from '../src/finalization-schema.ts'
import type { ReadySettingsIntent } from '../src/intent-ready.ts'
import { PREPARATION_READ, type PreparationRead } from '../src/preparation-read-schema.ts'
import { type CheckpointRequest } from '../src/checkpoint-schema.ts'
import { COMMIT_CURRENT, type CommitCurrent } from '../src/commit-current.ts'
import { SOURCE_READINESS_PARTICIPANT } from '../src/source-readiness.ts'
import { intentCommandDigest } from '../src/intent-records.ts'
import { json } from '../src/encoding.ts'
import { config } from './config.ts'
import { allocation } from './intent-world.ts'
export function recoveryRequest(
  input = allocation(),
): Extract<FinalizationRequest, { kind: 'seal' }> {
  return {
    kind: 'seal',
    binding: {
      identity: input.identity,
      attemptId: input.attemptId,
      commandKind: input.intent.kind,
      commandDigest: intentCommandDigest(input.intent),
    },
  }
}
function moduleFile(name: string) {
  const url = new URL(`./${name}.mjs`, import.meta.url)
  return {
    moduleUrl: url.href,
    codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
  }
}
export async function openRecoveryWorld(
  root: string,
  domain: DomainRef = allocation().identity.domain,
  sourceCapture = false,
  organizationCurrent?: OrganizationCurrentConfiguration,
) {
  const base = settingsRecoveryMaterials()
  const targets = settingsStandaloneMaterials()
  const own = sourceCapture
    ? {
        ...base,
        participants: [
          ...base.participants.filter(p => p.participant !== 'settings.source-snapshot'),
          ...sourceSnapshotMaterials({ capture: true }).participants,
          ...targets.participants,
        ],
        migrations: [...base.migrations, ...targets.migrations],
      }
    : base
  const materials: SqlMaterialCatalog = {
    ...own,
    catalogProtocol: 'sql-catalog/1',
    declaredCombinations: { tenant: null, system: null },
    participants: [
      ...own.participants,
      ...(organizationCurrent ? settingsOrganizationCurrentMaterials(organizationCurrent) : []),
      {
        participant: 'fixture.commit-current',
        protocol: 'fixture-commit/1',
        ...moduleFile('commit-current'),
        ownedTables: [],
        readTables: [],
        requiresFacts: [],
        providesFacts: [COMMIT_CURRENT],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      {
        participant: 'fixture.preparation-current',
        protocol: 'fixture-preparation/1',
        ...moduleFile('preparation-current'),
        ownedTables: [],
        readTables: [],
        requiresFacts: [],
        providesFacts: [PREPARATION_CURRENT],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      {
        participant: 'fixture.recovery-rollback',
        protocol: 'fixture-recovery/1',
        ...moduleFile('recovery-rollback'),
        ownedTables: [],
        readTables: [],
        requiresFacts: [RESULT_FACT],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'groupable',
      },
    ],
    readHandlers: [
      ...own.readHandlers,
      {
        handler: 'fixture.recovery-read',
        protocol: 'fixture-recovery/1',
        ...moduleFile('recovery-reader'),
        ordering: 'snapshot',
        readTables: [
          'st_governance_intent',
          'st_governance_attempt',
          'st_terminals',
          'st_source_gate',
          'st_source_reservation',
        ],
        requiresMigrations: [
          SETTINGS_PREPARING_MIGRATION,
          TERMINAL_MIGRATION,
          SOURCE_RETENTION_MIGRATION,
        ],
        maxRowsRead: 5,
        maxOutputBytes: 2 * 1024 * 1024,
      },
    ],
  }
  const participants = [...SETTINGS_RECOVERY_PARTICIPANTS, 'fixture.recovery-rollback']
  const manifest = combinationManifest({ catalog: materials, participants })
  if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
  const combination = {
    ...domain,
    combinationVersion: 'recovery-test/1',
    manifestDigest: manifestDigest(manifest.manifest),
    participants,
  }
  const made = await createSqliteStorage({
    config: { ...config(root), maxCommandsPerCommit: 10 },
    materials,
    closeLeases: { admit: () => ({}), release() {} },
  })
  if (made.kind !== 'created') throw new Error(JSON.stringify(made))
  const registered = await made.storage.registerCombination(combination)
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  const readyParticipants = [
    ...SETTINGS_READY_PARTICIPANTS,
    ...(organizationCurrent
      ? ['settings.organization-ready-current', 'settings.targets']
      : ['fixture.preparation-current']),
    'fixture.recovery-rollback',
  ]
  const readyManifest = combinationManifest({ catalog: materials, participants: readyParticipants })
  if (readyManifest.kind !== 'manifest') throw new Error(JSON.stringify(readyManifest))
  const readyCombination = {
    ...domain,
    combinationVersion: 'ready-test/1',
    manifestDigest: manifestDigest(readyManifest.manifest),
    participants: readyParticipants,
  }
  const readyRegistered = await made.storage.registerCombination(readyCombination)
  if (readyRegistered.kind !== 'registered') throw new Error(JSON.stringify(readyRegistered))
  const commitParticipants = [
    ...SETTINGS_COMMIT_PARTICIPANTS,
    ...(organizationCurrent
      ? ['settings.organization-commit-current', 'settings.targets']
      : ['fixture.commit-current']),
    'fixture.recovery-rollback',
  ]
  const commitManifest = combinationManifest({
    catalog: materials,
    participants: commitParticipants,
  })
  if (commitManifest.kind !== 'manifest') throw new Error(JSON.stringify(commitManifest))
  const commitCombination = {
    ...domain,
    combinationVersion: 'prepared-commit-test/1',
    manifestDigest: manifestDigest(commitManifest.manifest),
    participants: commitParticipants,
  }
  const commitRegistered = await made.storage.registerCombination(commitCombination)
  if (commitRegistered.kind !== 'registered') throw new Error(JSON.stringify(commitRegistered))
  const checkpointParticipants = [...SETTINGS_CHECKPOINT_PARTICIPANTS, 'fixture.recovery-rollback']
  const checkpointManifest = combinationManifest({
    catalog: materials,
    participants: checkpointParticipants,
  })
  if (checkpointManifest.kind !== 'manifest') throw new Error(JSON.stringify(checkpointManifest))
  const checkpointCombination = {
    ...domain,
    combinationVersion: 'checkpoint-test/1',
    manifestDigest: manifestDigest(checkpointManifest.manifest),
    participants: checkpointParticipants,
  }
  const checkpointRegistered = await made.storage.registerCombination(checkpointCombination)
  if (checkpointRegistered.kind !== 'registered')
    throw new Error(JSON.stringify(checkpointRegistered))
  return {
    root,
    storage: made.storage,
    registrations: {
      checkpoint: checkpointCombination,
      ready: readyCombination,
      commit: commitCombination,
      recovery: combination,
    },
    observePreparation(input: PreparationRead) {
      return made.storage.read({
        domain,
        ...PREPARATION_READ,
        requestKey: randomUUID(),
        input: json(input),
      })
    },
    checkpoint(
      request: CheckpointRequest,
      options: {
        rollback?: boolean
        omitAdmission?: boolean
        admitted?: CheckpointRequest
        key?: string
      } = {},
    ) {
      return made.storage.commit({
        identity: {
          ...domain,
          operation: 'settings.checkpoint',
          protocolVersion: '2',
          operationKey: options.key ?? randomUUID(),
        },
        combinationVersion: checkpointCombination.combinationVersion,
        manifestDigest: checkpointCombination.manifestDigest,
        commands: checkpointParticipants
          .filter(p => !options.omitAdmission || p !== 'settings.checkpoint-input')
          .map(participant => ({
            participant,
            facts:
              participant === 'settings.checkpoint-input'
                ? { request: json(options.admitted ?? request) }
                : participant === 'fixture.recovery-rollback'
                  ? { rollback: options.rollback ?? false }
                  : { kind: 'finalize', request: json(request) },
          }))
          .reverse(),
      })
    },
    materials,
    participants,
    readyParticipants,
    commitParticipants,
    commit(
      current: CommitCurrent,
      options: {
        rollback?: boolean
        omitCurrent?: boolean
        binding?: CommitCurrent['binding']
        key?: string
      } = {},
    ) {
      const request = { kind: 'commit' as const, binding: options.binding ?? current.binding }
      return made.storage.commit({
        identity: {
          ...domain,
          operation: 'settings.prepared-commit',
          protocolVersion: '2',
          operationKey: options.key ?? randomUUID(),
        },
        combinationVersion: commitCombination.combinationVersion,
        manifestDigest: commitCombination.manifestDigest,
        commands: commitParticipants
          .filter(participant => !options.omitCurrent || participant !== 'fixture.commit-current')
          .map(participant => ({
            participant,
            facts:
              participant === 'fixture.commit-current'
                ? { current: json(current) }
                : participant === SOURCE_READINESS_PARTICIPANT
                  ? { binding: json(request.binding) }
                  : participant === 'fixture.recovery-rollback'
                    ? { rollback: options.rollback ?? false }
                    : { kind: 'finalize', request: json(request) },
          }))
          .reverse(),
      })
    },
    ready(
      current: Omit<ReadySettingsIntent, 'terminal'>,
      options: {
        rollback?: boolean
        omitCurrent?: boolean
        binding?: ReadySettingsIntent['binding']
      } = {},
    ) {
      const request = { kind: 'ready' as const, binding: options.binding ?? current.binding }
      return made.storage.commit({
        identity: {
          ...domain,
          operation: 'settings.ready',
          protocolVersion: '2',
          operationKey: randomUUID(),
        },
        combinationVersion: readyCombination.combinationVersion,
        manifestDigest: readyCombination.manifestDigest,
        commands: readyParticipants
          .filter(
            participant => !options.omitCurrent || participant !== 'fixture.preparation-current',
          )
          .map(participant => ({
            participant,
            facts:
              participant === 'fixture.preparation-current'
                ? { current: json(current) }
                : participant === 'fixture.recovery-rollback'
                  ? { rollback: options.rollback ?? false }
                  : { kind: 'finalize', request: json(request) },
          }))
          .reverse(),
      })
    },
    run(
      request: FinalizationRequest,
      rollback = false,
      changed?: { participant: string; request: FinalizationRequest },
    ) {
      return made.storage.commit({
        identity: {
          ...domain,
          operation: 'settings.recovery',
          protocolVersion: '2',
          operationKey: randomUUID(),
        },
        combinationVersion: combination.combinationVersion,
        manifestDigest: combination.manifestDigest,
        commands: participants
          .map(participant => ({
            participant,
            facts:
              participant === 'fixture.recovery-rollback'
                ? { rollback }
                : {
                    kind: 'finalize',
                    request: json(changed?.participant === participant ? changed.request : request),
                  },
          }))
          .reverse(),
      })
    },
    read(request: FinalizationRequest) {
      return made.storage.read({
        domain,
        handler: 'fixture.recovery-read',
        protocol: 'fixture-recovery/1',
        requestKey: randomUUID(),
        input: json(request),
      })
    },
    async close() {
      const result = await made.control.close({ initiator: 'disposal' })
      if (result.kind !== 'closed') throw new Error(JSON.stringify(result))
    },
  }
}
