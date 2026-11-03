import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { Piscina } from 'piscina'
import { StorageService } from '@omne-harness/sql-contract/cordis'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { CalendarQueryService } from '@omne-harness/calendar-cordis-contract/cordis'
import {
  scheduleCommandsKey,
  scheduleQueriesKey,
} from '@omne-harness/schedule-cordis-contract/cordis'
import { createScheduleLocalPlugin } from '@omne-harness/schedule-local/cordis'
import { openWorld } from '../storage/world.ts'
import { context, definition } from '../storage/data.ts'
import { localOptions, now } from './fixture.ts'

class FixtureStorage extends StorageService {
  readonly registerCombination: SqlStorage['registerCombination']
  readonly commit: SqlStorage['commit']
  readonly query: SqlStorage['query']
  readonly read: SqlStorage['read']
  constructor(ctx: Context, storage: SqlStorage) {
    super(ctx)
    this.registerCombination = storage.registerCombination
    this.commit = storage.commit
    this.query = storage.query
    this.read = storage.read
  }
}

class FixtureCalendar extends CalendarQueryService {
  readonly list = async (): Promise<never> => {
    throw new Error('Unexpected calendar list')
  }
  readonly get = async (): Promise<never> => {
    throw new Error('Unexpected calendar get')
  }
  readonly effective = async (): Promise<never> => {
    throw new Error('Unexpected calendar effective')
  }
  readonly resolve = async (): Promise<never> => {
    throw new Error('Unexpected calendar resolve')
  }
}

it('waits for injected dependencies, drains on withdrawal and restores without deleting facts', async () => {
  const world = await openWorld()
  const ctx = new Context()
  try {
    const options = localOptions(world)
    const { storage: _storage, ...sql } = options.sql
    const { calendar: _calendar, ...prediction } = options.prediction
    const local = ctx.plugin(createScheduleLocalPlugin(), { ...options, sql, prediction })
    expect(ctx.get(scheduleCommandsKey)).toBeUndefined()
    const storage = ctx.plugin(FixtureStorage, world.storage)
    await storage.await()
    expect(ctx.get(scheduleQueriesKey)).toBeUndefined()
    const calendar = ctx.plugin(FixtureCalendar)
    await calendar.await()
    await local.await()
    const consumer = ctx.inject([scheduleCommandsKey, scheduleQueriesKey], async child => {
      expect(
        await child.scheduleQueries.preview(context, {
          source: { kind: 'inline', definition },
          after: now,
          count: 1,
        }),
      ).toMatchObject({ kind: 'ok' })
    })
    await consumer.await()
    const commands = ctx.get(scheduleCommandsKey)
    const queries = ctx.get(scheduleQueriesKey)
    if (!commands || !queries) throw new Error('Missing injected services')
    const created = await commands.create(context, {
      definition,
      initial: { kind: 'active' },
      meta: { operationKey: 'cordis-create', expectedRevision: null, consentRef: null },
    })
    if (created.kind !== 'committed') throw new Error(JSON.stringify(created))
    await calendar.dispose()
    expect(ctx.get(scheduleQueriesKey)).toBeUndefined()
    expect(await queries.get(context, { scheduleId: created.value.scheduleId })).toMatchObject({
      kind: 'error',
      error: { code: 'dependency_blocked' },
    })
    expect(
      await commands.create(context, {
        definition,
        initial: { kind: 'active' },
        meta: { operationKey: 'after-close', expectedRevision: null, consentRef: null },
      }),
    ).toMatchObject({ kind: 'rejected', error: { code: 'dependency_blocked' } })
    const restored = ctx.plugin(FixtureCalendar)
    await restored.await()
    await local.await()
    const resumed = ctx.inject([scheduleQueriesKey], async child => {
      expect(
        await child.scheduleQueries.get(context, { scheduleId: created.value.scheduleId }),
      ).toMatchObject({ kind: 'ok', value: { scheduleId: created.value.scheduleId } })
    })
    await resumed.await()
    await local.dispose()
    await world.configure()
  } finally {
    await ctx.fiber.dispose()
    await world.close()
  }
})

it.each([false, true])(
  'releases the real application on binding failure, preserving cleanup failure=%s',
  async cleanupFails => {
    const world = await openWorld()
    const ctx = new Context()
    let bindingFault: ReturnType<typeof vi.spyOn> | undefined
    let cleanupFault: ReturnType<typeof vi.spyOn> | undefined
    try {
      await ctx.plugin(FixtureStorage, world.storage).await()
      await ctx.plugin(FixtureCalendar).await()
      const options = localOptions(world)
      const { storage: _storage, ...sql } = options.sql
      const { calendar: _calendar, ...prediction } = options.prediction
      const plugin = createScheduleLocalPlugin()
      expect(plugin.name).toBe('schedule-local')
      const binding = new Error('binding unavailable')
      const cleanup = new Error('reported cleanup failure')
      if (cleanupFails) {
        const destroy = Piscina.prototype.destroy
        cleanupFault = vi.spyOn(Piscina.prototype, 'destroy').mockImplementation(async function (
          this: Piscina,
        ) {
          await destroy.call(this)
          throw cleanup
        })
      }
      bindingFault = vi.spyOn(ctx, 'plugin').mockImplementation(() => {
        throw binding
      })
      const pending = plugin.apply(ctx, { ...options, sql, prediction })
      if (cleanupFails) {
        await expect(pending).rejects.toBeInstanceOf(AggregateError)
        await expect(pending).rejects.toMatchObject({
          message: 'Schedule binding and cleanup failed',
          errors: [binding, cleanup],
        })
      } else await expect(pending).rejects.toBe(binding)
      await world.configure()
    } finally {
      bindingFault?.mockRestore()
      cleanupFault?.mockRestore()
      await ctx.fiber.dispose()
      await world.close()
    }
  },
)
