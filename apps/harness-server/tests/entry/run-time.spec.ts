// @module-tag slow
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { simulatedTime } from '@omne-harness/time-source/simulated'
import { describe, expect, it } from 'vitest'
import { bodyOf, type CliRun } from '../r9/support.ts'
import { onReleaseTreeRuns, toolCallsThenText } from '../support/release-tree.ts'

const DAY = 86_400_000
const START = Date.parse('2027-01-15T01:00:00.000Z')

const DAILY = {
  label: '每天九点',
  recurrence: {
    kind: 'cron',
    expression: '0 9 * * *',
    begin: '2026-11-01T00:00:00',
    until: null,
  },
  limits: { eligibleLimit: null, jobLimit: null, excludeDates: [] },
  binding: { kind: 'followUserEnvironment' },
  calendarOverlay: null,
  purpose: {
    kind: 'reminder',
    content: { title: '九点', body: '到九点了' },
    admissionPolicy: 'reminder-window-v1',
    overlap: 'parallel',
  },
}

function succeeded(run: CliRun): Record<string, any> {
  expect(run.result?.['outcome'], run.stdout + run.stderr).toBe('succeeded')
  return bodyOf(run) as Record<string, any>
}

describe('one time per run', () => {
  it(
    'a release tree on a simulated time: the rows read it, and a wall clock moved a day ahead is a stop the server wakes from',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const time = simulatedTime({ wall: START })
      time.run({ speed: 1 })
      const exitCodes = await onReleaseTreeRuns(
        {
          script: toolCallsThenText(() => []),
          time: { source: time.source, protocol: 'simulated-clock' },
        },
        [
          async tree => {
            const file = join(dirname(tree.home), 'daily.json')
            writeFileSync(file, JSON.stringify(DAILY))
            const created = succeeded(
              await tree.cli([
                'schedule',
                'create',
                '--definition-file',
                file,
                '--create-id',
                'd-1',
              ]),
            )
            expect(
              Date.parse(created['createdAt'] ?? created['next']['at']),
            ).toBeGreaterThanOrEqual(START)
            const read = succeeded(
              await tree.cli(['schedule', 'show', '--schedule', created['schedule']]),
            )
            expect(Date.parse(read['createdAt'])).toBeGreaterThanOrEqual(START)
            expect(Date.parse(read['createdAt'])).toBeLessThan(START + DAY)
            expect(Date.parse(read['next']['at'])).toBeGreaterThan(Date.parse(read['createdAt']))
            expect(Date.parse(read['next']['at'])).toBeLessThanOrEqual(START + DAY)

            const elapsed = time.source.elapsed()
            time.setWall(time.source.now() + DAY)
            expect(time.source.elapsed() - elapsed).toBeLessThan(1000)
            const preview = succeeded(
              await tree.cli(['schedule', 'preview', '--definition-file', file, '--count', '1']),
            )
            expect(Date.parse(preview['upcoming'][0]['at'])).toBeGreaterThan(START + DAY)
          },
        ],
      )
      expect(exitCodes).toEqual([0])
    },
  )
})
