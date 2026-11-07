import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
  type JsonValue,
  type CommitRequestV2,
} from '@omne-harness/sql-contract'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import { CATALOG_CURRENT, CATALOG_SNAPSHOT } from '../src/catalog-schema.ts'
import { governanceSqlMaterials } from '../src/materials.ts'
import {
  ADOPTION_CURRENT,
  METADATA_PLANNER,
  MUTATION_PLANNER,
  ADOPTION_PLANNER,
  controlRequestSchema,
  businessRequestSchema,
  type ControlRequest,
  type BusinessRequest,
} from '../src/activation-schema.ts'
import { GOVERNANCE_OWNER } from '../src/migration.ts'
import { digest, json, operationIdentity } from '../src/encoding.ts'
import { tenantRef } from './operation-world.ts'
import { storedStageSchema, persistStageSchema, type SqlStage } from '../src/sql-stage-schema.ts'
import { STAGE_HANDLER } from '../src/sql-stage-read.ts'
import { acceptanceReceiptSchema, type OperationBinding } from '../src/operation-schema.ts'
import { config } from './config.ts'

type ParticipantCommand = CommitRequestV2['commands'][number]
export function activationCatalog(
  extra?: Pick<SqlMaterialCatalog, 'participants' | 'migrations' | 'readHandlers'>,
): SqlMaterialCatalog {
  const base = governanceSqlMaterials()
  const url = new URL('./activation-current.mjs', import.meta.url)
  const catalogUrl = new URL('./catalog-current.mjs', import.meta.url)
  return {
    catalogProtocol: 'sql-catalog/1',
    ...base,
    migrations: [...base.migrations, ...(extra?.migrations ?? [])],
    readHandlers: [...base.readHandlers, ...(extra?.readHandlers ?? [])],
    participants: [
      ...base.participants,
      {
        participant: 'fixture.governance-catalog-current',
        protocol: CATALOG_CURRENT.protocol,
        moduleUrl: catalogUrl.href,
        codeDigest: createHash('sha256').update(readFileSync(catalogUrl)).digest('hex'),
        ownedTables: [],
        readTables: [],
        requiresFacts: [],
        providesFacts: [CATALOG_CURRENT],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      ...(extra?.participants ?? []),
      {
        participant: 'fixture.governance-current',
        protocol: ADOPTION_CURRENT.protocol,
        moduleUrl: url.href,
        codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
        ownedTables: [],
        readTables: [],
        requiresFacts: [],
        providesFacts: [ADOPTION_CURRENT],
        allowedFunctions: [],
        grouping: 'groupable',
      },
    ],
    declaredCombinations: { tenant: null, system: null },
  }
}
export const plannerMembers = {
  catalog: ['fixture.governance-catalog-current', CATALOG_SNAPSHOT.participant, GOVERNANCE_OWNER],
  metadata: [METADATA_PLANNER, GOVERNANCE_OWNER],
  mutation: [MUTATION_PLANNER, GOVERNANCE_OWNER],
  adoption: ['fixture.governance-current', ADOPTION_PLANNER, GOVERNANCE_OWNER],
}
export async function openActivation(
  existing?: string,
  options: {
    tenantRef?: string
    extraMaterials?: Pick<SqlMaterialCatalog, 'participants' | 'migrations' | 'readHandlers'>
  } = {},
) {
  const root = existing ?? realpathSync(mkdtempSync(join(tmpdir(), 'governance-activation-')))
  const materials = activationCatalog(options.extraMaterials)
  const made = await createSqliteStorage({
    config: config(root),
    materials,
    closeLeases: { admit: () => ({}), release() {} },
  })
  if (made.kind !== 'created') throw new Error(JSON.stringify(made))
  const { storage, control } = made
  const domain = {
    scope: { kind: 'tenant' as const, tenant: options.tenantRef ?? tenantRef },
    transactionDomain: 'governance-operations',
  }
  function combination(mode: keyof typeof plannerMembers) {
    const participants = plannerMembers[mode]
    const checked = combinationManifest({ catalog: materials, participants })
    if (checked.kind !== 'manifest') throw new Error(JSON.stringify(checked))
    return {
      ...domain,
      participants,
      combinationVersion: 'activation-' + mode + '/1',
      manifestDigest: manifestDigest(checked.manifest),
    }
  }
  for (const mode of ['metadata', 'mutation', 'adoption', 'catalog'] as const) {
    const result = await storage.registerCombination(combination(mode))
    if (result.kind !== 'registered') throw new Error(JSON.stringify(result))
  }
  const execution = (mode: 'mutation' | 'adoption') => ({
    combinationVersion: combination(mode).combinationVersion,
    manifestDigest: combination(mode).manifestDigest,
    authority: { fixture: 'coordinator-admission-and-source' },
  })
  async function commit(
    mode: keyof typeof plannerMembers,
    commands: readonly ParticipantCommand[],
  ) {
    return storage.commit({
      identity: {
        ...domain,
        operation: 'fixture.activation',
        protocolVersion: '2',
        operationKey: randomUUID(),
      },
      combinationVersion: combination(mode).combinationVersion,
      manifestDigest: combination(mode).manifestDigest,
      commands,
    })
  }
  async function response(result: Awaited<ReturnType<typeof commit>>) {
    if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
    const found = result.responses.find(r => r.participant === GOVERNANCE_OWNER)
    if (found?.reply.kind !== 'participated') throw new Error(JSON.stringify(result))
    return found.reply.response
  }
  function controlCommands(raw: ControlRequest): ParticipantCommand[] {
    const request = controlRequestSchema.parse(raw)
    return [
      { participant: METADATA_PLANNER, facts: { request: json(request) } },
      { participant: GOVERNANCE_OWNER, facts: { requestDigest: digest(request) } },
    ]
  }
  function businessCommands(
    mode: 'mutation' | 'adoption',
    raw: BusinessRequest,
    evidence?: JsonValue,
  ): ParticipantCommand[] {
    const request = businessRequestSchema.parse(raw)
    return [
      ...(mode === 'adoption'
        ? [{ participant: 'fixture.governance-current', facts: { evidence: evidence ?? null } }]
        : []),
      {
        participant: mode === 'adoption' ? ADOPTION_PLANNER : MUTATION_PLANNER,
        facts: { request: json(request) },
      },
      { participant: GOVERNANCE_OWNER, facts: { requestDigest: digest(request) } },
    ]
  }
  async function readStage(binding: OperationBinding, stage: SqlStage) {
    const result = await storage.read({
      domain,
      ...STAGE_HANDLER,
      requestKey: randomUUID(),
      input: json({ binding, stage }),
    })
    if (result.kind !== 'read') throw new Error(JSON.stringify(result))
    return result.output
  }
  function envelope(
    mode: 'mutation' | 'adoption',
    request: BusinessRequest,
    evidence?: JsonValue,
  ): CommitRequestV2 {
    return {
      identity: operationIdentity(domain.transactionDomain, request.binding.ref),
      combinationVersion: combination(mode).combinationVersion,
      manifestDigest: combination(mode).manifestDigest,
      commands: businessCommands(mode, request, evidence),
    }
  }
  return {
    root,
    readStage,
    envelope,
    domain,
    storage: storage,
    execution,
    commit,
    response,
    controlCommands,
    businessCommands,
    combination,
    async control(request: ControlRequest) {
      const result = await response(await commit('metadata', controlCommands(request)))
      return request.kind === 'accept' ? acceptanceReceiptSchema.parse(result).outcome : result
    },
    async apply(mode: 'mutation' | 'adoption', request: BusinessRequest, evidence?: JsonValue) {
      const saved = await response(
        await commit(
          'metadata',
          controlCommands({
            kind: 'persist-stage',
            input: persistStageSchema.parse({
              binding: request.binding,
              stage: 'apply',
              envelope: envelope(mode, request, evidence),
            }),
          }),
        ),
      )
      if (typeof saved === 'object' && saved !== null && 'kind' in saved && saved.kind === 'found')
        return saved
      const stored = storedStageSchema.parse(await readStage(request.binding, 'apply'))
      const result = await storage.commit(stored.envelope)
      return response(result)
    },
    async close(remove = true) {
      const result = await control.close({ initiator: 'disposal' })
      if (result.kind !== 'closed') throw new Error(JSON.stringify(result))
      if (remove) rmSync(root, { recursive: true, force: true })
    },
  }
}
