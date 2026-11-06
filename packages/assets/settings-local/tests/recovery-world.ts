import { randomUUID, createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import {
  settingsRecoveryMaterials,
  SETTINGS_RECOVERY_PARTICIPANTS,
} from '../src/recovery-materials.ts'
import { TERMINAL_MIGRATION } from '../src/terminal-schema.ts'
import { SETTINGS_PREPARING_MIGRATION } from '../src/preparing-migration.ts'
import { SOURCE_RETENTION_MIGRATION } from '../src/source-retention-schema.ts'
import { RESULT_FACT } from '../src/schema.ts'
import type { RecoveryRequest } from '../src/finalization-schema.ts'
import { intentCommandDigest } from '../src/intent-records.ts'
import { json } from '../src/encoding.ts'
import { config } from './config.ts'
import { allocation } from './intent-world.ts'
export function recoveryRequest(input = allocation()): Extract<RecoveryRequest, { kind: 'seal' }> {
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
export async function openRecoveryWorld(root: string) {
  const own = settingsRecoveryMaterials()
  const materials: SqlMaterialCatalog = {
    ...own,
    catalogProtocol: 'sql-catalog/1',
    declaredCombinations: { tenant: null, system: null },
    participants: [
      ...own.participants,
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
  const domain = allocation().identity.domain
  const combination = {
    ...domain,
    combinationVersion: 'recovery-test/1',
    manifestDigest: manifestDigest(manifest.manifest),
    participants,
  }
  const made = await createSqliteStorage({
    config: config(root),
    materials,
    closeLeases: { admit: () => ({}), release() {} },
  })
  if (made.kind !== 'created') throw new Error(JSON.stringify(made))
  const registered = await made.storage.registerCombination(combination)
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  return {
    root,
    materials,
    participants,
    run(
      request: RecoveryRequest,
      rollback = false,
      changed?: { participant: string; request: RecoveryRequest },
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
    read(request: RecoveryRequest) {
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
