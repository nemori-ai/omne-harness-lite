// @module-tag slow
import { readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { simulatedTime } from '@omne-harness/time-source/simulated'
import { describe, expect, it } from 'vitest'
import { bodyOf, type CliRun } from '../../r9/support.ts'
import { onReleaseTreeRuns, pollUntil, toolCallsThenText } from '../../support/release-tree.ts'

const EVERY_MINUTE = {
  label: '每分钟',
  recurrence: { kind: 'cron', expression: '* * * * *', begin: '2027-01-01T00:00:00', until: null },
  limits: { eligibleLimit: null, jobLimit: null, excludeDates: [] },
  binding: { kind: 'explicit', timezone: 'UTC', calendar: null },
  calendarOverlay: null,
  purpose: {
    kind: 'execution',
    work: { kind: 'program', programRef: 'probe', input: {} },
    scope: { kind: 'fleet' },
    catchUp: { kind: 'none' },
    overlap: 'parallel',
    misfire: null,
    notifications: [],
  },
}

function succeeded(run: CliRun): Record<string, unknown> {
  expect(run.result?.['outcome'], run.stdout + run.stderr).toBe('succeeded')
  return bodyOf(run) as Record<string, unknown>
}

/** The dispatch rows of the one tenant domain that holds them. */
function dispatchRows(storageRoot: string, sql: string): Record<string, unknown>[] {
  const domains = join(storageRoot, 'domains')
  for (const file of readdirSync(domains).filter(name => name.endsWith('.sqlite'))) {
    const db = new DatabaseSync(join(domains, file), { readOnly: true })
    try {
      const has = db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'sc_watch'").get()
      if (has !== undefined) return db.prepare(sql).all() as Record<string, unknown>[]
    } finally {
      db.close()
    }
  }
  return []
}

describe('the schedule row on the release tree', () => {
  it(
    'after a restart every tenant has a dispatcher without any schedule call: its heartbeat moves and a missing executor is written on the schedule',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const time = simulatedTime({ wall: Date.parse('2027-03-01T00:00:10.000Z') })
      time.run({ speed: 60 })
      let schedule = ''
      let restartedAt = 0
      const exitCodes = await onReleaseTreeRuns(
        {
          script: toolCallsThenText(() => []),
          time: { source: time.source, protocol: 'simulated-clock' },
          rowConfig: {
            schedule: { dispatch: { intervalMs: 5_000, gapMs: 60_000, roundLimit: 20 } },
          },
        },
        [
          async tree => {
            const file = join(dirname(tree.home), 'every-minute.json')
            writeFileSync(file, JSON.stringify(EVERY_MINUTE))
            const created = succeeded(
              await tree.cli([
                'schedule',
                'create',
                '--definition-file',
                file,
                '--create-id',
                'm-1',
              ]),
            )
            schedule = String(created['schedule'])
          },
          async tree => {
            restartedAt = time.source.now()
            const beat = await pollUntil(
              'a heartbeat after the restart',
              () => {
                const watch = dispatchRows(tree.storageRoot, 'SELECT beat_at FROM sc_watch')[0]
                return Date.parse(String(watch?.['beat_at'] ?? ''))
              },
              at => at > restartedAt,
            )
            expect(beat).toBeGreaterThan(restartedAt)
            const blocked = await pollUntil(
              'the missing executor written on the schedule',
              () => {
                const row = dispatchRows(
                  tree.storageRoot,
                  `SELECT state FROM sc_dispatch WHERE schedule_id = '${schedule}'`,
                )[0]
                return row === undefined ? null : (JSON.parse(String(row['state'])).block ?? null)
              },
              block => block !== null,
            )
            expect(blocked).toEqual({
              kind: 'blocked',
              reasons: ['carrier-missing:executor:program'],
            })
            expect(
              dispatchRows(tree.storageRoot, 'SELECT count(*) AS n FROM sc_receipts')[0]?.['n'],
            ).toBe(0)
          },
        ],
      )
      expect(exitCodes).toEqual([0, 0])
    },
  )
})
