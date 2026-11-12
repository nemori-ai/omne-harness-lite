import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { createCalendarQueries } from '@omne-harness/calendar'
import { calendarResolveSchema } from '@omne-harness/calendar-contract'
import { calendarQueryKey } from '@omne-harness/calendar-cordis-contract/cordis'
import { expect, it } from 'vitest'
import { CalendarLocalQueryProvider } from '../../src/cordis.ts'
import { command, openWorld } from '../world.ts'
import { context } from '../runner/fixture.ts'

it('runs the real query application over borrowed SQLite and leaves storage open on unload', async () => {
  const parent = fileURLToPath(
    new URL('../../../../../tmp/calendar-a1-bindings/databases/', import.meta.url),
  )
  mkdirSync(parent, { recursive: true })
  const world = await openWorld(realpathSync(mkdtempSync(`${parent}case-`)))
  const ctx = new Context()
  try {
    const publish = command()
    expect(await world.persistence.commitDisposition(publish)).toMatchObject({ kind: 'recorded' })
    const queries = createCalendarQueries({
      repository: world.repository,
      authority: {
        async check() {
          return { kind: 'allowed' }
        },
      },
      environment: {
        async read() {
          return { kind: 'missing' }
        },
      },
      clock: { now: () => 1767225600000 },
      catalog: [],
    })
    const provider = ctx.plugin(CalendarLocalQueryProvider, {
      binding: { kind: 'borrowed', queries },
      drainTimeoutMs: 100,
      observer: { name: 'sql-test', observe() {} },
    })
    await provider.await()
    const old = ctx.get(calendarQueryKey)
    const input = calendarResolveSchema.parse({
      selection: { kind: 'explicit', calendarId: publish.address.calendarId },
      version: { kind: 'latest' },
      query: { kind: 'day', date: '2026-01-02' },
    })
    expect(await old?.resolve(context, input)).toMatchObject({
      kind: 'ok',
      value: { versionId: 'v1' },
    })
    await provider.dispose()
    expect(await old?.resolve(context, input)).toMatchObject({
      kind: 'error',
      error: { code: 'provider_failure' },
    })
    expect(await queries.resolve(context, input)).toMatchObject({
      kind: 'ok',
      value: { versionId: 'v1' },
    })
    expect(await world.persistence.commitDisposition(command('v2', 1))).toMatchObject({
      kind: 'recorded',
    })
  } finally {
    await ctx.fiber.dispose()
    await world.close()
  }
})
