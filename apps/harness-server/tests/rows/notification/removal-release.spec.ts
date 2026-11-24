// @module-tag slow
import { describe, expect, it } from 'vitest'
import { savedLoginProof, savedTenant } from '../../r9/support.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
  toolResults,
} from '../../support/release-tree.ts'

/** Whether the Run of a history ended as completed. */
const completed = (entries: readonly { kind: string }[]) =>
  JSON.stringify(entries.find(entry => entry.kind === 'run.terminal')).includes(
    '"outcome":"completed"',
  )
describe('the release tree without the two notification rows', () => {
  it(
    'starts, lets a session talk and call its other tools, and does not mount the notification protocol',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const script = toolCallsThenText(body =>
        body.includes('note it')
          ? [
              {
                id: 'call_todo',
                tool: 'TodoItems',
                arguments: JSON.stringify({ command: 'add', params: { text: '浇花' } }),
              },
            ]
          : [],
      )
      const options = { script, withoutRows: ['notification', 'notification-access'] }
      const exitCode = await onReleaseTree(options, async tree => {
        expect(tree.records.filter(r => r['kind'] === 'tree').map(r => r['id'])).not.toEqual(
          expect.arrayContaining(['notification']),
        )
        const ended = (session: string) =>
          pollUntil(
            'the Run to end',
            () => historyOf(tree, session),
            entries => entries.some(entry => entry.kind === 'run.terminal'),
          )

        const talking = await ended(await tree.startSession('hello'))
        expect(completed(talking)).toBe(true)

        const working = await ended(await tree.startSession('note it'))
        expect(completed(working)).toBe(true)

        expect(toolResults(working).join('\n')).toContain('"ok":{"receipt"')
        const response = await fetch(
          `http://127.0.0.1:${String(tree.port)}/api/notification/v2/list-sources`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${savedLoginProof(tree.home)}`,
              'omne-message-id': 'm-1',
            },
            body: JSON.stringify({ tenant: savedTenant(tree.home) }),
          },
        )
        expect(response.status).toBe(404)
      })
      expect(exitCode).toBe(0)
    },
  )
})
