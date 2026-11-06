import type { IntentSettlement } from '../src/intent-settlement.ts'
import {
  SETTINGS_SOURCE_CUSTODY_MIGRATION,
  SETTINGS_SOURCE_CUSTODY_TABLES,
} from '../src/source-custody-migration.ts'
import type {
  SourceCustodyPlan,
  SourceCustodyMember,
  SourceCustodyRecord,
  SourceCustodyPage,
} from '../src/source-custody-schema.ts'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
  type DomainRef,
} from '@omne-harness/sql-contract'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import { settingsSqlMaterials } from '../src/materials.ts'
import { SETTINGS_PREPARING_MIGRATION } from '../src/preparing-migration.ts'
import { SETTINGS_STANDING_CUSTODY_MIGRATION } from '../src/standing-custody-migration.ts'
import type {
  StandingPlanInput,
  StandingReceiptInput,
  StandingSettlementInput,
} from '../src/standing-custody.ts'
import { json } from '../src/encoding.ts'
import type { IntentAllocation, IntentIdentity } from '../src/intent-schema.ts'
import { config } from './config.ts'
import { command, definitionRef } from './world.ts'

export function allocation(): IntentAllocation {
  const value = command()
  const witness = { ownerRef: 'owner', subjectRef: 'scope', revision: '1' }
  return {
    identity: {
      domain: { scope: { kind: 'tenant', tenant: 'tenant-a' }, transactionDomain: 'intent-test' },
      principalRef: 'alice',
      operation: { target: value.target, operationId: value.operationId },
    },
    intent: { kind: 'change', command: value },
    purpose: { kind: 'target-change' },
    attemptId: 'attempt-1',
    plan: {
      protocol: 'settings-current-basis/1',
      target: value.target,
      definitionRef,
      ownerRevision: 1,
      enabled: true,
      valueRevision: 0,
      sources: [
        {
          sourceId: 'tenant',
          ownerRef: 'owner',
          scope: { kind: 'tenant', subjectRef: 'tenant-a' },
          authorityRevision: '1',
        },
      ],
      declaration: witness,
      selection: { kind: 'not-required', authority: witness },
      policies: [
        {
          policyRef: 'policy',
          interpretationRef: 'owner-policy/1',
          revision: '1',
          inputs: [],
          constraints: [],
        },
      ],
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
type StandingCommand =
  | { kind: 'plan'; input: StandingPlanInput }
  | { kind: 'request'; input: { identity: IntentIdentity; attemptId: string } }
  | { kind: 'held'; input: StandingReceiptInput }
  | { kind: 'settled'; input: StandingSettlementInput }
export async function openIntentWorld(
  existingRoot?: string,
  domain: DomainRef = allocation().identity.domain,
) {
  const parent = fileURLToPath(
    new URL('../../../../tmp/closures/settings-intent/databases/', import.meta.url),
  )
  mkdirSync(parent, { recursive: true })
  const root = existingRoot ?? realpathSync(mkdtempSync(join(parent, 'case-')))
  const own = settingsSqlMaterials()
  const materials: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    participants: own.participants.map(item =>
      item.participant === 'settings.persistence'
        ? { ...item, ...moduleFile('intent-writer'), requiresFacts: [], providesFacts: [] }
        : item,
    ),
    migrations: own.migrations,
    readHandlers: [
      ...own.readHandlers,
      {
        handler: 'fixture.settings.intent-read',
        protocol: 'fixture-settings-intent/1',
        ...moduleFile('intent-reader'),
        ordering: 'snapshot',
        readTables: [
          'st_governance_intent',
          'st_governance_attempt',
          'st_intent_standing',
          ...SETTINGS_SOURCE_CUSTODY_TABLES,
        ],
        requiresMigrations: [
          SETTINGS_PREPARING_MIGRATION,
          SETTINGS_STANDING_CUSTODY_MIGRATION,
          SETTINGS_SOURCE_CUSTODY_MIGRATION,
        ],
        maxRowsRead: 67,
        maxOutputBytes: 2 * 1024 * 1024,
      },
    ],
    declaredCombinations: { tenant: null, system: null },
  }
  const participants = ['settings.persistence']
  const manifest = combinationManifest({ catalog: materials, participants })
  if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
  const combination = {
    ...domain,
    combinationVersion: 'intent-test/1',
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
    settle(input: IntentSettlement, rollback = false) {
      return made.storage.commit({
        identity: {
          ...domain,
          operation: 'fixture.intent.settle',
          protocolVersion: '2',
          operationKey: randomUUID(),
        },
        combinationVersion: combination.combinationVersion,
        manifestDigest: combination.manifestDigest,
        commands: [
          { participant: 'settings.persistence', facts: { settlement: json(input), rollback } },
        ],
      })
    },
    source(
      command:
        | { kind: 'plan'; input: SourceCustodyPlan }
        | { kind: 'request'; input: SourceCustodyMember }
        | { kind: 'record'; input: SourceCustodyRecord },
      rollback = false,
    ) {
      return made.storage.commit({
        identity: {
          ...domain,
          operation: 'fixture.intent.source',
          protocolVersion: '2',
          operationKey: randomUUID(),
        },
        combinationVersion: combination.combinationVersion,
        manifestDigest: combination.manifestDigest,
        commands: [
          { participant: 'settings.persistence', facts: { source: json(command), rollback } },
        ],
      })
    },
    readSource(input: SourceCustodyMember) {
      return made.storage.read({
        domain,
        handler: 'fixture.settings.intent-read',
        protocol: 'fixture-settings-intent/1',
        requestKey: randomUUID(),
        input: json({ kind: 'source', input }),
      })
    },
    readSources(input: SourceCustodyPage) {
      return made.storage.read({
        domain,
        handler: 'fixture.settings.intent-read',
        protocol: 'fixture-settings-intent/1',
        requestKey: randomUUID(),
        input: json({ kind: 'sources', input }),
      })
    },
    standing(command: StandingCommand) {
      return made.storage.commit({
        identity: {
          ...domain,
          operation: 'fixture.intent.standing',
          protocolVersion: '2',
          operationKey: randomUUID(),
        },
        combinationVersion: combination.combinationVersion,
        manifestDigest: combination.manifestDigest,
        commands: [{ participant: 'settings.persistence', facts: { standing: json(command) } }],
      })
    },
    readStanding(identity: IntentIdentity, attemptId: string) {
      return made.storage.read({
        domain,
        handler: 'fixture.settings.intent-read',
        protocol: 'fixture-settings-intent/1',
        requestKey: randomUUID(),
        input: json({ kind: 'standing', identity, attemptId }),
      })
    },
    write(input: IntentAllocation, key: string = randomUUID(), rollback = false) {
      return made.storage.commit({
        identity: {
          ...domain,
          operation: 'fixture.intent.allocate',
          protocolVersion: '2',
          operationKey: key,
        },
        combinationVersion: combination.combinationVersion,
        manifestDigest: combination.manifestDigest,
        commands: [
          { participant: 'settings.persistence', facts: { input: json(input), rollback } },
        ],
      })
    },
    read(identity: IntentIdentity) {
      return made.storage.read({
        domain,
        handler: 'fixture.settings.intent-read',
        protocol: 'fixture-settings-intent/1',
        requestKey: randomUUID(),
        input: json(identity),
      })
    },
    async close() {
      const result = await made.control.close({ initiator: 'disposal' })
      if (result.kind !== 'closed') throw new Error(JSON.stringify(result))
    },
  }
}
