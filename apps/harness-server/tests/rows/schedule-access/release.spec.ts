// @module-tag slow
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bodyOf, runOmne, type CliRun } from '../../r9/support.ts'
import {
  onReleaseTreeRuns,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'

const MONTHLY_REPORT = {
  label: '交月报',
  recurrence: {
    kind: 'position',
    period: 'month',
    interval: 1,
    begin: '2026-11-01T00:00:00',
    until: null,
    ordinal: 'last',
    selector: { kind: 'workingDay' },
    times: ['17:00:00'],
  },
  limits: { eligibleLimit: null, jobLimit: null, excludeDates: [] },
  binding: { kind: 'followUserEnvironment' },
  calendarOverlay: null,
  purpose: {
    kind: 'reminder',
    content: { title: '月报', body: '交本月的月报' },
    admissionPolicy: 'reminder-window-v1',
    overlap: 'parallel',
  },
}

function succeeded(run: CliRun): Record<string, any> {
  expect(run.result?.['outcome'], run.stdout + run.stderr).toBe('succeeded')
  return bodyOf(run) as Record<string, any>
}

/** A second account on its own client state, registered and logged in against the same server. */
async function stranger(tree: ReleaseTree) {
  const base = dirname(tree.home)
  const home = join(base, 'frank')
  const credential = 'frank-pw-schedule-release-5c2e'
  const cli = (args: readonly string[], secret?: string) =>
    runOmne({
      args,
      home,
      server: `http://127.0.0.1:${String(tree.port)}`,
      cwd: base,
      ...(secret === undefined ? {} : { credential: secret }),
    })
  expect((await cli(['register', '--login-identifier', 'frank'], credential)).status).toBe(0)
  expect((await cli(['login', '--login-identifier', 'frank'], credential)).status).toBe(0)
  return cli
}

describe('schedule and schedule-access rows', () => {
  it(
    'keep an owner schedule across a restart, change it only at its revision, and show it to nobody else',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      let schedule = ''
      const exitCodes = await onReleaseTreeRuns({ script: toolCallsThenText(() => []) }, [
        async tree => {
          const file = join(dirname(tree.home), 'monthly-report.json')
          writeFileSync(file, JSON.stringify(MONTHLY_REPORT))
          const preview = succeeded(
            await tree.cli(['schedule', 'preview', '--definition-file', file, '--count', '3']),
          )
          expect(preview['upcoming']).toHaveLength(3)
          expect(preview['upcoming'][0]).toMatchObject({
            calendar: 'cn-legal-holidays',
            version: expect.any(String),
          })

          const created = succeeded(
            await tree.cli(['schedule', 'create', '--definition-file', file, '--create-id', 'c-1']),
          )
          schedule = created['schedule']
          expect(created).toMatchObject({
            label: '交月报',
            control: 'active',
            author: { kind: 'human' },
            basis: { kind: 'owner' },
            revision: 1,
            next: { calendar: 'cn-legal-holidays' },
          })
          const recalled = succeeded(
            await tree.cli([
              'schedule',
              'create',
              '--definition-file',
              file,
              '--create-id',
              'c-1',
              '--query',
            ]),
          )
          expect(recalled['schedule']).toBe(schedule)

          const renamed = succeeded(
            await tree.cli([
              'schedule',
              'rename',
              '--schedule',
              schedule,
              '--revision',
              '1',
              '--label',
              '月报',
            ]),
          )
          expect(renamed).toMatchObject({ label: '月报', revision: 2 })
          const stale = await tree.cli([
            'schedule',
            'pause',
            '--schedule',
            schedule,
            '--revision',
            '1',
          ])
          expect(stale.result).toMatchObject({ outcome: 'conflict' })
          expect(
            succeeded(
              await tree.cli(['schedule', 'pause', '--schedule', schedule, '--revision', '2']),
            ),
          ).toMatchObject({ control: 'paused', revision: 3 })

          const other = await stranger(tree)
          expect(succeeded(await other(['schedule', 'list', '--all']))['items']).toEqual([])
          expect((await other(['schedule', 'show', '--schedule', schedule])).result).toMatchObject({
            outcome: 'not-visible',
          })
          expect(
            (await other(['schedule', 'resume', '--schedule', schedule, '--revision', '3'])).result,
          ).toMatchObject({ outcome: 'not-visible' })
        },
        async tree => {
          await tree.relogin()
          const listed = succeeded(await tree.cli(['schedule', 'list']))
          expect(listed['items']).toEqual([
            expect.objectContaining({ schedule, label: '月报', control: 'paused', revision: 3 }),
          ])
          const history = succeeded(await tree.cli(['schedule', 'history', '--schedule', schedule]))
          expect(history['items'].map((item: { revision: number }) => item.revision)).toEqual([
            1, 2, 3,
          ])
          expect(
            succeeded(
              await tree.cli(['schedule', 'resume', '--schedule', schedule, '--revision', '3']),
            ),
          ).toMatchObject({ control: 'active', revision: 4 })
        },
      ])
      expect(exitCodes).toEqual([0, 0])
    },
  )
})
