import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  createScheduleManagementApplication,
  type ManagementAccess,
  type ScheduleManagementDependencies,
} from '@omne-harness/schedule'
import { ScheduleIdSchema, type ScheduleCallContext } from '@omne-harness/schedule-contract'
import {
  createScheduleManagementSqlBackend,
  scheduleManagementSqlMaterials,
  scheduleManagementGuardsFact,
  scheduleManagementResultFact,
  type ScheduleManagementSqlGuards,
} from '@omne-harness/schedule-local'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
  type SqlStorage,
  type StorageScope,
} from '@omne-harness/sql-contract'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import { config } from './config.ts'
import { access, context as defaultContext, now, observation, recovery } from './data.ts'
const GUARD = 'fixture.schedule.guards'
function material(name: string) {
  const url = new URL(`./${name}.mjs`, import.meta.url)
  return {
    moduleUrl: url.href,
    codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
  }
}
export function temporaryRoot() {
  const parent = fileURLToPath(
    new URL('../../../../../tmp/schedule-a2-storage/databases/', import.meta.url),
  )
  mkdirSync(parent, { recursive: true })
  return realpathSync(mkdtempSync(join(parent, 'case-')))
}
function catalog(): SqlMaterialCatalog {
  const own = scheduleManagementSqlMaterials()
  const migration = material('guard-migration')
  return {
    catalogProtocol: 'sql-catalog/1',
    participants: [
      ...own.participants,
      {
        participant: GUARD,
        protocol: 'schedule-management-guards/1',
        ...material('guard'),
        ownedTables: ['fixture_schedule_authority', 'fixture_schedule_quota'],
        readTables: [],
        requiresFacts: [],
        providesFacts: [scheduleManagementGuardsFact],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      {
        participant: 'fixture.schedule.after',
        protocol: 'fixture-schedule-after/1',
        ...material('after-write'),
        ownedTables: [],
        readTables: [],
        requiresFacts: [scheduleManagementResultFact],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'singleton',
      },
    ],
    migrations: [
      ...own.migrations,
      {
        owner: GUARD,
        id: 'fixture-schedule-guards-1',
        moduleUrl: migration.moduleUrl,
        checksum: migration.codeDigest,
        requires: [],
      },
    ],
    readHandlers: own.readHandlers,
    declaredCombinations: { tenant: null, system: null },
  }
}
export async function openWorld(
  options: {
    root?: string
    scope?: StorageScope
    wrap?: (storage: SqlStorage) => SqlStorage
    configure?: boolean
    context?: ScheduleCallContext
  } = {},
) {
  const context = options.context ?? defaultContext
  const root = options.root ?? temporaryRoot()
  const scope: StorageScope = options.scope ?? { kind: 'tenant', tenant: 't1' }
  const materials = catalog()
  const participants = materials.participants.map(item => item.participant)
  const manifest = combinationManifest({ catalog: materials, participants })
  if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
  const combination = {
    scope,
    transactionDomain: 'schedule.management',
    combinationVersion: 'fixture-schedule/1',
    manifestDigest: manifestDigest(manifest.manifest),
    participants,
  }
  const leases = new Set<object>()
  const created = await createSqliteStorage({
    config: config(root),
    materials,
    closeLeases: {
      admit() {
        const lease = {}
        leases.add(lease)
        return lease
      },
      release(lease) {
        leases.delete(lease)
      },
    },
  })
  if (created.kind !== 'created') throw new Error(JSON.stringify(created))
  const raw = created.storage
  const registered = await raw.registerCombination(combination)
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  const storage = options.wrap?.(created.storage) ?? created.storage
  const guards: ScheduleManagementSqlGuards = {
    participant: GUARD,
    command: requirement => ({ participant: GUARD, facts: { requirement } }),
  }
  const backend = createScheduleManagementSqlBackend({
    storage,
    scope,
    combinationVersion: combination.combinationVersion,
    manifestDigest: combination.manifestDigest,
    guards,
  })
  let authorized = access(context)
  const dependencies: ScheduleManagementDependencies = {
    ...backend,
    authorizer: {
      async authorize() {
        return { kind: 'ok', value: authorized }
      },
      async authorizeRecovery({ context }) {
        return { kind: 'ok', value: recovery(context) }
      },
    },
    definitions: {
      async resolve(input) {
        return { kind: 'ok', value: observation(input.definition, input.definitionRevision) }
      },
    },
    quota: {
      async inspect(input) {
        const releasing =
          input.request.kind === 'execute' &&
          (input.request.input.action === 'stop' || input.request.input.action === 'discard') &&
          input.current?.quota.kind === 'held'
        return {
          kind: 'ok',
          value: {
            guardRef: 'quota:guard',
            resultingHolding:
              input.allocatedId !== null
                ? { kind: 'held', reservationRef: `reservation:${input.allocatedId}` }
                : releasing
                  ? { kind: 'released', releaseRef: `release:${input.operation.operationRef}` }
                  : null,
          },
        }
      },
    },
    clock: { now: () => now },
    ids: { schedule: () => ScheduleIdSchema.parse(randomUUID()) },
  }
  const app = createScheduleManagementApplication(dependencies)
  async function configure(
    overrides: {
      access?: ManagementAccess
      mode?: string
      decisionAt?: string
      capacity?: number
      basisGuard?: string
      quotaGuard?: string
      actions?: readonly string[]
      purposes?: readonly string[]
    } = {},
  ) {
    authorized = overrides.access ?? authorized
    const result = await raw.commit({
      identity: {
        scope,
        transactionDomain: combination.transactionDomain,
        operation: 'fixture.configure',
        protocolVersion: '2',
        operationKey: randomUUID(),
      },
      combinationVersion: combination.combinationVersion,
      manifestDigest: combination.manifestDigest,
      commands: [
        {
          participant: GUARD,
          facts: {
            action: 'configure',
            access: authorized,
            basisGuard: overrides.basisGuard ?? 'basis:guard',
            quotaGuard: overrides.quotaGuard ?? 'quota:guard',
            mode: overrides.mode ?? 'normal',
            decisionAt: overrides.decisionAt ?? now,
            capacity: overrides.capacity ?? 1000,
            actions: overrides.actions ?? [
              'create',
              'update',
              'reviseDraft',
              'reconfirmConsent',
              'pause',
              'resume',
              'stop',
              'promote',
              'discard',
              'replace',
            ],
            purposes: overrides.purposes ?? ['execution', 'reminder'],
          },
        },
      ],
    })
    if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
  }
  if (options.configure !== false) await configure()
  return {
    root,
    scope,
    combination,
    storage,
    raw: created.storage,
    guards,
    dependencies,
    ...backend,
    ...app,
    configure,
    sql(sql: string) {
      const path = join(
        root,
        'domains',
        `${Buffer.from('schedule.management').toString('hex')}.sqlite`,
      )
      const db = new DatabaseSync(path, { readOnly: true })
      try {
        return db.prepare(sql).all()
      } finally {
        db.close()
      }
    },
    async close() {
      const result = await created.control.close({ initiator: 'disposal' })
      if (result.kind !== 'closed' || leases.size !== 0)
        throw new Error(JSON.stringify({ result, leases: leases.size }))
    },
    context,
  }
}
export type World = Awaited<ReturnType<typeof openWorld>>
