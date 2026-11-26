// @module-tag slow
// Starts the release tree: the operator swaps the calendar row; what was written before is read after, and nothing is done twice.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { askControl } from '../../../src/control-port.ts'
import { bodyOf, type CliRun } from '../../r9/support.ts'
import { officialLayer } from '../../support/official-layer.ts'
import { onReleaseTree, toolCallsThenText, type ReleaseTree } from '../../support/release-tree.ts'
import { publisher, versionDirectory } from '../../support/version-directory.ts'

const SHIPPED = (mark: string) => `// ${mark}\nexport const row = kit => kit.shipped('calendar')\n`
const BAD = `export function row(kit) {
  return {
    declaration: kit.shipped('calendar').declaration,
    plugin: { apply() { throw new Error('this calendar cannot start') } },
  }
}
`

/** A schedule that follows the calendar of the person: every working day at nine. */
const WORKDAYS = {
  label: '每个工作日九点',
  recurrence: { kind: 'cron', expression: '0 9 * * *', begin: '2026-11-01T00:00:00', until: null },
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

function succeeded(run: CliRun): Record<string, unknown> {
  expect(run.result?.['outcome'], run.stdout + run.stderr).toBe('succeeded')
  return bodyOf(run) as Record<string, unknown>
}

/** What the person reads of the calendar and of their schedules, by the commands they would run. */
async function read(tree: ReleaseTree, schedule: string) {
  const day = ['calendar', 'day', '--date', '2026-12-25']
  return {
    calendars: succeeded(await tree.cli(['calendar', 'list'])),
    environment: succeeded(await tree.cli(['calendar', 'environment'])),
    health: succeeded(await tree.cli(['calendar', 'health'])),
    day: succeeded(await tree.cli(day)),
    schedule: succeeded(await tree.cli(['schedule', 'show', '--schedule', schedule])),
    schedules: succeeded(await tree.cli(['schedule', 'list'])),
  }
}

describe('发行树：服务不停换 calendar（C18）', () => {
  it(
    '换之前写下的换之后读得到；新的一代没有重做旧的一代做过的事；依赖它的行没有重跑；起不来的一版被拒',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const key = publisher()
      const second = versionDirectory(SHIPPED('second'), key)
      const third = versionDirectory(SHIPPED('third'), key)
      const bad = versionDirectory(BAD, key)
      const script = toolCallsThenText(() => [])
      await onReleaseTree({ script, publisherKeys: [key.publicKey] }, async tree => {
        const file = join(dirname(tree.home), 'workdays.json')
        writeFileSync(file, JSON.stringify(WORKDAYS))
        const created = succeeded(
          await tree.cli(['schedule', 'create', '--definition-file', file, '--create-id', 'w-1']),
        )
        const schedule = String(created['schedule'])
        const before = await read(tree, schedule)
        const layer = officialLayer(tree)

        const swap = (directory: string) =>
          askControl(tree.env.stateRoot, { op: 'swap', row: 'calendar', directory })
        for (const directory of [second, third]) {
          const answer = await swap(directory)
          expect(answer[0]).toMatchObject({ kind: 'impact', way: 'implementation', reruns: [] })
          expect(answer.at(-1)).toMatchObject({ outcome: 'swapped' })
          // The same facts, read by the same commands: nothing lost, nothing written again.
          expect(await read(tree, schedule)).toEqual(before)
        }
        const refused = await swap(bad)
        expect(refused.at(-1)).toMatchObject({
          outcome: 'refused',
          reason: 'did-not-start',
          detail: 'this calendar cannot start',
        })
        expect(await read(tree, schedule)).toEqual(before)

        const now = officialLayer(tree)
        const changed = [...layer].filter(([row, was]) => now.get(row)?.fiber !== was.fiber)
        expect(changed.map(([row]) => row)).toEqual(['calendar'])
        await new Promise(resolve => setTimeout(resolve, 200))
        const stray = ['swap-mismatch', 'row-supervision', 'supervision-exit']
        expect(tree.records.filter(r => stray.includes(r.kind))).toEqual([])
      })
    },
  )
})
