import { expect, it } from 'vitest'
import { userMessageId } from '@omne-harness/session-protocol'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedTenant } from '../../r9/support.ts'
import { treeOf } from '../media-intake/support.ts'
import { sessionRef, tenantOf } from '../../support/protocol-clients.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  type ReleaseTree,
  toolCallsThenText,
} from '../../support/release-tree.ts'

type Send = Parameters<ReleaseTree['clients']['session']['send-input']>[0]

it(
  'an input sent to wait for this run is not in this run, and starts the next one when this run completes (C12)',
  { tags: ['slow'], timeout: 300_000 },
  async () => {
    const requests: string[] = []
    let release: () => void = () => {}
    const held = new Promise<void>(resolve => (release = resolve))
    const answer = toolCallsThenText(() => [])
    const script: typeof answer = async request => {
      requests.push(request.body)
      if (request.body.includes('FIRST-WORDS') && !request.body.includes('LATER-WORDS')) await held
      return answer(request)
    }
    const exitCode = await onReleaseTree({ script }, async tree => {
      const session = await settledSession(tree, 'hello')
      const tenant = tenantOf(savedTenant(tree.home))
      const send = async (input: string, words: string, afterRun?: 'yes') =>
        tree.clients.session['send-input']({
          tenant,
          session: sessionRef(session),
          acceptId: `accept-${input}`,
          inputId: input,
          message: treeOf({
            id: await userMessageId(input),
            role: 'user',
            blocks: [
              { kind: 'text', id: 'b1', visibility: { toHuman: true, toModel: true }, text: words },
            ],
          }),
          ...(afterRun === undefined ? {} : { afterRun }),
        } as unknown as Send)
      expect(await send('in-1', 'FIRST-WORDS')).toMatchObject({ outcome: 'succeeded' })
      await pollUntil(
        'the run of the first words to ask the model',
        async () => requests.filter(body => body.includes('FIRST-WORDS')).length,
        count => count > 0,
      )
      expect(await send('in-2', 'LATER-WORDS', 'yes')).toMatchObject({ outcome: 'succeeded' })
      const pending = await tree.clients.session['read-pending']({
        tenant,
        session: sessionRef(session),
        after: null,
        limit: 10,
      } as never)
      expect(JSON.stringify(pending)).toContain('"preview":"LATER-WORDS"')
      release()
      const entries = await pollUntil(
        'the run of the later words to end',
        () => historyOf(tree, session),
        found => found.filter(entry => entry.kind === 'run.terminal').length >= 3,
      )
      const terminals = entries.filter(entry => entry.kind === 'run.terminal')
      expect(JSON.stringify(terminals.at(-2)?.payload)).toContain('completed')
      const firstRun = requests.filter(body => body.includes('FIRST-WORDS'))[0] ?? ''
      expect(firstRun).not.toContain('LATER-WORDS')
      expect(requests.at(-1)).toContain('LATER-WORDS')
    })
    expect(exitCode).toBe(0)
  },
)
