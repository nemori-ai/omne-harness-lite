import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  scheduleManagementGuardsFact,
  scheduleManagementSqlMaterials,
  type ScheduleDispatchRequirement,
  type ScheduleManagementSqlGuards,
} from '@omne-harness/schedule-local'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'

export const SCHEDULE_GUARD = {
  participant: 'harness-server.schedule.guards',
  protocol: 'schedule-management-guards/1',
}
export const SCHEDULE_QUOTA_TABLE = 'harness_schedule_quota'
export const SCHEDULE_GUARD_MIGRATION = {
  owner: SCHEDULE_GUARD.participant,
  id: 'harness-server-schedule-guards-1',
}
/** Schedules not in a terminal state that one author may keep for one owner. */
export const SCHEDULE_CAPACITY = 100
export const SCHEDULE_PARTICIPANTS = ['schedule.management.persistence', SCHEDULE_GUARD.participant]

/** Dispatch commits go through the same guard: it stamps their decision time and frees quota on exhaustion. */
export const scheduleDispatchGuards = {
  participant: SCHEDULE_GUARD.participant,
  dispatch: (requirement: ScheduleDispatchRequirement) => ({
    participant: SCHEDULE_GUARD.participant,
    facts: { dispatch: JSON.parse(JSON.stringify(requirement)) },
  }),
}

export const scheduleGuards: ScheduleManagementSqlGuards = {
  participant: SCHEDULE_GUARD.participant,
  command: requirement => ({
    participant: SCHEDULE_GUARD.participant,
    facts: { requirement: JSON.parse(JSON.stringify(requirement)) },
  }),
}

function file(name: string) {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const url = new URL(`./${name}.${extension}`, import.meta.url)
  return { url, digest: createHash('sha256').update(readFileSync(url)).digest('hex') }
}

/** The schedule store and the application's guard participant, for the production storage catalog. */
export function scheduleStorageMaterials(): Pick<
  SqlMaterialCatalog,
  'participants' | 'migrations' | 'readHandlers'
> {
  const own = scheduleManagementSqlMaterials()
  const participant = file('guard-participant')
  participant.url.searchParams.set('capacity', String(SCHEDULE_CAPACITY))
  const migration = file('guard-migration')
  return {
    participants: [
      ...own.participants,
      {
        ...SCHEDULE_GUARD,
        moduleUrl: participant.url.href,
        codeDigest: participant.digest,
        ownedTables: [SCHEDULE_QUOTA_TABLE],
        readTables: [],
        requiresFacts: [],
        providesFacts: [scheduleManagementGuardsFact],
        allowedFunctions: [],
        grouping: 'groupable',
      },
    ],
    migrations: [
      ...own.migrations,
      {
        ...SCHEDULE_GUARD_MIGRATION,
        moduleUrl: migration.url.href,
        checksum: migration.digest,
        requires: [],
      },
    ],
    readHandlers: own.readHandlers,
  }
}
