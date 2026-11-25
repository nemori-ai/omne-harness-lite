// @module-tag slow
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { onReleaseTreeRuns, toolCallsByRequest } from '../support/release-tree.ts'
import { run, sessionIn } from '../support/workspace-guidance.ts'

it(
  'C5 server restart reuses intact bodies and refreshes a changed source in the durable working set',
  { tags: ['slow'], timeout: 360_000 },
  async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'guidance-restart-')))
    onTestFinished(() => rmSync(root, { recursive: true, force: true }))
    const pay = join(root, 'pay')
    mkdirSync(pay)
    writeFileSync(join(root, 'AGENTS.md'), 'ROOT_RETAINED_711')
    writeFileSync(join(pay, 'AGENTS.md'), 'PAY_ORIGINAL_485')
    const requests: string[] = []
    let session = ''
    const script = toolCallsByRequest(body => {
      requests.push(body)
      return requests.length === 1
        ? [
            {
              id: 'first_write',
              tool: 'Files',
              arguments: JSON.stringify({
                command: 'write',
                intent: 'record payment',
                params: { path: 'pay/note', mode: 'create', text: 'once' },
              }),
            },
          ]
        : []
    })
    await onReleaseTreeRuns(
      { script, permission: 'bypass-permissions', extraHistoryKinds: ['message.system_reminder'] },
      [
        async tree => {
          session = await sessionIn(tree, root)
          await run(tree, session)
          expect(requests).toHaveLength(2)
          expect(requests[1]).toContain('PAY_ORIGINAL_485')
        },
        async tree => {
          writeFileSync(join(pay, 'AGENTS.md'), 'PAY_REVISED_862')
          const entries = await run(tree, session, 2)
          expect(requests).toHaveLength(3)
          for (const marker of ['ROOT_RETAINED_711', 'PAY_ORIGINAL_485', 'PAY_REVISED_862'])
            expect(requests[2]!.split(marker).length - 1, marker).toBe(1)
          const reminders = entries.filter(e => e.kind === 'message.system_reminder')
          const revised = reminders.filter(e => JSON.stringify(e).includes('PAY_REVISED_862'))
          expect(revised).toHaveLength(1)
          expect(JSON.stringify(revised)).not.toMatch(/ROOT_RETAINED_711|PAY_ORIGINAL_485/u)
          expect(readFileSync(join(pay, 'note'), 'utf8')).toBe('once')
        },
      ],
    )
  },
)
