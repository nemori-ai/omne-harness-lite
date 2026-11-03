import type { ScheduleLocalOptions } from '@omne-harness/schedule-local'
import { now, readAccess } from '../storage/data.ts'
import type { World } from '../storage/world.ts'

async function unused(): Promise<never> {
  throw new Error('Unexpected external operation')
}

export function localOptions(world: World): ScheduleLocalOptions {
  return {
    sql: {
      storage: world.storage,
      scope: world.scope,
      combinationVersion: world.combination.combinationVersion,
      manifestDigest: world.combination.manifestDigest,
      guards: world.guards,
    },
    worker: { maxConcurrent: 1, maxQueued: 2 },
    management: world.dependencies,
    prediction: {
      calendar: { list: unused, get: unused, effective: unused, resolve: unused },
      environment: { observe: unused },
      basisGuards: { prepare: async () => ({ kind: 'ok', value: { guardRef: 'basis:guard' } }) },
      monotonicClock: { now: () => performance.now() },
      versions: { tzdbVersion: `node-${process.versions.tz}`, ruleEngineVersion: 'schedule-a2/1' },
      limits: {
        maxCandidates: 10000,
        maxYears: 10,
        maxExplanations: 10000,
        maxCalendarCalls: 10000,
        timeoutMs: 10000,
      },
    },
    query: {
      authorizer: {
        observe: async () => ({ kind: 'ok', value: readAccess() }),
        confirm: async () => ({ kind: 'ok', value: readAccess() }),
      },
      history: {
        observe: async () => ({ kind: 'ok', value: { observationRevision: 'history:empty' } }),
        confirm: async () => ({ kind: 'ok', value: { observationRevision: 'history:empty' } }),
        read: async () => ({
          kind: 'ok',
          value: {
            items: [],
            nextCursor: null,
            total: { kind: 'exact', value: 0 },
            complete: true,
            observationRevision: 'history:empty',
          },
        }),
      },
      limits: {
        timeoutMs: 10000,
        maxDependencyCalls: 1000,
        maxAgendaSchedules: 10000,
        maxAgendaRows: 5000,
      },
    },
  }
}

export { now }
