import { createHash } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { createCalendarQueries, type CalendarDispositionCommand } from '@omne-harness/calendar'
import { calendarSeedPackSchema } from '@omne-harness/calendar-contract'
import {
  createShippedCalendarSeedRegistry,
  shippedCalendarSeedRelease,
} from '@omne-harness/calendar-local'
import { CalendarLocalQueryProvider } from '@omne-harness/calendar-local/cordis'
import { createScheduleLocalPlugin } from '@omne-harness/schedule-local/cordis'
import {
  scheduleCommandsKey,
  scheduleQueriesKey,
} from '@omne-harness/schedule-cordis-contract/cordis'
import { StorageService } from '@omne-harness/sql-contract/cordis'
import { openWorld as openCalendar } from '../../../../calendar/calendar-local/tests/world.ts'
import { openWorld as openSchedule } from '../storage/world.ts'
import { context } from '../storage/data.ts'
import { localOptions } from './fixture.ts'

export async function seededWorld(calendarId = 'cn-legal-holidays') {
  const source = createShippedCalendarSeedRegistry().get(shippedCalendarSeedRelease.packRef)
  if (source?.kind !== 'bytes') throw new Error('Shipped seed reader missing')
  const pack = calendarSeedPackSchema.parse(
    JSON.parse(Buffer.from(await source.read()).toString('utf8')),
  )
  const entry = pack.calendars.find(item => item.snapshot.calendarId === calendarId)
  if (!entry) throw new Error(`No shipped seed for ${calendarId}`)
  const calendar = await openCalendar()
  const cleanup: (() => Promise<void>)[] = [calendar.close]
  async function close() {
    const failures: unknown[] = []
    for (const dispose of cleanup.reverse()) {
      try {
        await dispose()
      } catch (error) {
        failures.push(error)
      }
    }
    cleanup.length = 0
    if (failures.length) throw new AggregateError(failures, 'Acceptance cleanup failed')
  }
  try {
    const schedule = await openSchedule()
    cleanup.push(schedule.close)
    const { publicationGeneration: _generation, ...snapshot } = entry.snapshot
    const publication: CalendarDispositionCommand = {
      address: {
        protocol: 'omne.calendar-schedule/1',
        systemScopeRef: 'acceptance-only',
        operation: 'importSeed',
        calendarId: snapshot.calendarId,
        operationKey: 'acceptance-seed',
      },
      expectedFingerprint: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
      expectedGeneration: 0,
      authorityGuardRefs: ['fixture-grant'],
      policyHash: entry.policyHash,
      candidate: {
        snapshot,
        semanticBoundary: 'Fixed released seed used by acceptance',
        differences: [],
        reasons: [],
        sources: entry.materials.map(material => ({
          sourceId: material.sourceId,
          role: 'truth',
          lineageRef: material.lineageRef,
          authorityRef: material.authorityRef,
          acquiredAt: material.acquiredAt,
          knowledgeAsOf: material.knowledgeAsOf,
          rawHash: material.rawHash,
          rawReference: `acceptance:${material.rawHash}`,
        })),
      },
      disposition: { kind: 'publish', snapshot },
    }
    const committed = await calendar.persistence.commitDisposition(publication)
    if (committed.kind !== 'recorded') throw new Error(JSON.stringify(committed))
    const queries = createCalendarQueries({
      repository: calendar.repository,
      authority: { check: async () => ({ kind: 'allowed' }) },
      environment: {
        read: async () => ({
          kind: 'found',
          value: {
            owner: context.owner,
            revision: 'fixture-environment:1',
            timezone: snapshot.timezone,
            calendarId: snapshot.calendarId,
          },
        }),
      },
      clock: { now: () => Date.parse('2026-11-04T00:00:00Z') },
      catalog: [],
    })
    const options = localOptions(schedule)
    const root = new Context()
    cleanup.push(() => root.fiber.dispose())
    class AcceptanceStorage extends StorageService {
      readonly registerCombination = schedule.storage.registerCombination
      readonly commit = schedule.storage.commit
      readonly query = schedule.storage.query
      readonly read = schedule.storage.read
    }
    await root.plugin(AcceptanceStorage).await()
    await root
      .plugin(CalendarLocalQueryProvider, {
        binding: { kind: 'borrowed', queries },
        drainTimeoutMs: 10000,
        observer: { name: 'acceptance', observe() {} },
      })
      .await()
    const { storage: _storage, ...sql } = options.sql
    const { calendar: _calendar, ...prediction } = options.prediction
    await root
      .plugin(createScheduleLocalPlugin(), {
        ...options,
        sql,
        prediction: {
          ...prediction,
          environment: {
            observe: async () => ({
              kind: 'ok',
              value: {
                owner: context.owner,
                revision: 'fixture-environment:1',
                timezone: snapshot.timezone,
                calendar: { calendarId: snapshot.calendarId, version: { kind: 'latest' } },
              },
            }),
          },
        },
      })
      .await()
    const commands = root.get(scheduleCommandsKey)
    const scheduleQueries = root.get(scheduleQueriesKey)
    if (!commands || !scheduleQueries) throw new Error('Schedule Cordis services unavailable')
    const app = { commands, queries: scheduleQueries }
    return {
      app,
      queries,
      context,
      calendar,
      schedule,
      snapshot,
      publication,
      close,
      evidenceScope: {
        real: [
          'released calendar bytes with hash check',
          'CalendarQueries',
          'Calendar SQL',
          'Schedule SQL',
          'Schedule worker',
          'Schedule application',
          'Calendar and Schedule Cordis providers',
        ],
        fixtures: [
          'identity and authorization',
          'settings environment',
          'consent/quota/basis SQL guard',
          'empty execution history',
        ],
        notExercised: [
          'Tool host/runtime',
          'live supply refresh',
          'Job execution',
          'production current-qualification coordination',
        ],
        release: shippedCalendarSeedRelease,
      },
    }
  } catch (error) {
    try {
      await close()
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Acceptance initialization failed')
    }
    throw error
  }
}
