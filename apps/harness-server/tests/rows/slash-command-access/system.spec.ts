import { describe, expect, it } from 'vitest'
import { userMessageId } from '@omne-harness/session-protocol'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedTenant } from '../../r9/support.ts'
import { treeOf } from '../media-intake/support.ts'
import { sessionRef, tenantOf } from '../../support/protocol-clients.ts'
import {
  type Entry,
  historyOf,
  onReleaseTree,
  type ReleaseTree,
  toolCallsThenText,
} from '../../support/release-tree.ts'

type Send = Parameters<ReleaseTree['clients']['session']['send-input']>[0]

const kinds = (entries: readonly Entry[], kind: string) =>
  entries.filter(entry => entry.kind === kind)

describe('a system command, on the release tree', () => {
  it(
    'does the operation of the session protocol it names, under its own access, and leaves the command in the session',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const requests: string[] = []
      const script = toolCallsThenText(body => {
        requests.push(body)
        return []
      })
      const options = { script, extraHistoryKinds: ['session.command-recorded'] }
      const exitCode = await onReleaseTree(options, async tree => {
        const session = await settledSession(tree, 'hello')
        const tenant = tenantOf(savedTenant(tree.home))
        const target = { tenant, session: sessionRef(session) }
        const client = tree.clients.session
        const send = async (input: string, words: string) =>
          client['send-input']({
            ...target,
            acceptId: `accept-${input}`,
            inputId: input,
            message: treeOf({
              id: await userMessageId(input),
              role: 'user',
              blocks: [
                {
                  kind: 'text',
                  id: 'b1',
                  visibility: { toHuman: true, toModel: true },
                  text: words,
                },
              ],
            }),
          } as unknown as Send)

        const listed = await tree.clients.slashCommand['read-catalog'](target as never)
        const entries = (listed as { body: { entries: readonly Record<string, unknown>[] } }).body
          .entries
        expect(entries.filter(entry => entry['kind'] === 'system')).toEqual([
          expect.objectContaining({
            full: 'omne-official:archive',
            whileRunning: 'now',
            takesEffect: 'now',
          }),
          expect.objectContaining({
            full: 'omne-official:model',
            whileRunning: 'now',
            takesEffect: 'next-request',
          }),
          expect.objectContaining({
            full: 'omne-official:permission',
            whileRunning: 'now',
            takesEffect: 'now',
          }),
          expect.objectContaining({
            full: 'omne-official:reload',
            whileRunning: 'now',
            takesEffect: 'next-request',
          }),
        ])

        const before = await client['read-model-selection'](target)
        const current = (before as { body: { model: string } }).body.model
        const other = current === 'z-ai/glm-5.3' ? 'z-ai/glm-5.2' : 'z-ai/glm-5.3'
        const asked = requests.length
        const changed = await send('in-1', `/model ${other}`)
        expect(changed).toEqual({
          outcome: 'succeeded',
          body: {
            recovered: false,
            operation: { name: 'omne-official:model', outcome: 'succeeded', detail: other },
          },
        })
        expect(await client['read-model-selection'](target)).toMatchObject({
          body: { model: other },
        })
        expect(await send('in-1', `/model ${other}`)).toMatchObject({
          outcome: 'succeeded',
          body: { recovered: true, operation: { outcome: 'succeeded' } },
        })
        expect(await send('in-2', '/model no/such-model')).toMatchObject({
          outcome: 'invalid',
          body: {
            field: 'value.message',
            reason: expect.stringContaining('omne-official:model: invalid'),
          },
        })

        expect(await send('in-3', '/permission never')).toMatchObject({
          outcome: 'succeeded',
          body: { operation: { name: 'omne-official:permission', outcome: 'succeeded' } },
        })
        expect(await client['read-permission-mode'](target)).toMatchObject({
          body: { mode: 'never' },
        })
        expect(await send('in-4', '/permission everything')).toMatchObject({
          outcome: 'invalid',
          body: { reason: expect.stringContaining('name one mode') },
        })

        const pending = await client['read-pending']({ ...target, after: null, limit: 10 } as never)
        expect(pending).toMatchObject({ outcome: 'succeeded', body: { inputs: [] } })
        let history = await historyOf(tree, session)
        expect(requests.length).toBe(asked)
        expect(kinds(history, 'message.user')).toHaveLength(1)
        const recorded = kinds(history, 'session.command-recorded').map(entry => entry.payload)
        expect(recorded).toEqual([
          expect.objectContaining({ name: 'omne-official:model', args: other }),
          expect.objectContaining({ name: 'omne-official:model', args: 'no/such-model' }),
          expect.objectContaining({ name: 'omne-official:permission', args: 'never' }),
          expect.objectContaining({ name: 'omne-official:permission', args: 'everything' }),
        ])

        expect(await send('in-5', '/archive')).toMatchObject({
          outcome: 'succeeded',
          body: {
            operation: { name: 'omne-official:archive', outcome: 'succeeded', detail: 'archived' },
          },
        })
        history = await historyOf(tree, session)
        expect(kinds(history, 'session.command-recorded').at(-1)?.payload).toMatchObject({
          name: 'omne-official:archive',
          args: '',
        })
        expect(await send('in-6', '你好')).toMatchObject({ outcome: 'archived' })
      })
      expect(exitCode).toBe(0)
    },
  )
})
