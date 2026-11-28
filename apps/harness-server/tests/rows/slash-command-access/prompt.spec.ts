import { describe, expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import { userMessageId } from '@omne-harness/session-protocol'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedTenant } from '../../r9/support.ts'
import { treeOf } from '../media-intake/support.ts'
import { sessionRef, tenantOf, type ProtocolClients } from '../../support/protocol-clients.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  type ReleaseTree,
  toolCallsThenText,
} from '../../support/release-tree.ts'

type Assets = ProtocolClients['assets']
type Send = Parameters<ReleaseTree['clients']['session']['send-input']>[0]

const promptFile = (head: string, prompt: string) => `---\n${head}\n---\n${prompt}\n`

async function publish(assets: Assets, tenant: TenantId, name: string, text: string) {
  const bytes = new TextEncoder().encode(text)
  const operation = `publish-prompt-${name}-${String(bytes.length)}`
  const begun = await assets['begin-asset-upload']({
    tenant,
    operation,
    category: 'prompt',
    name,
    manifest: [{ path: 'PROMPT.md', bytes: bytes.length }],
  })
  if (begun.outcome !== 'succeeded') return begun
  const sent = await assets['append-asset-upload']({
    tenant,
    upload: operation,
    path: 'PROMPT.md',
    offset: 0,
    bytes,
  })
  if (sent.outcome !== 'succeeded') return sent
  return assets['commit-asset-upload']({ tenant, upload: operation })
}

describe('a prompt command, on the release tree', () => {
  it(
    'is published as an asset, listed at the head, expanded after the words with its arguments, and refused when not whole',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const requests: string[] = []
      const script = toolCallsThenText(body => {
        requests.push(body)
        return []
      })
      const exitCode = await onReleaseTree({ script }, async tree => {
        const session = await settledSession(tree, 'hello')
        const tenant = tenantOf(savedTenant(tree.home))
        const made = await publish(
          tree.clients.assets,
          tenant,
          'commit',
          promptFile(
            'name: commit\ndescription: 写提交说明。\nargument-hint: <scope> [note]',
            '为 $1 写提交说明。备注：$ARGUMENTS',
          ),
        )
        expect(made).toMatchObject({ outcome: 'succeeded' })
        const holding = (made as { body: { holding: string } }).body.holding

        const listed = await tree.clients.slashCommand['read-catalog']({
          tenant,
          session: sessionRef(session),
        } as never)

        expect(listed).toMatchObject({ outcome: 'succeeded' })
        const entries = (listed as { body: { entries: readonly Record<string, unknown>[] } }).body
          .entries
        expect(entries.find(entry => entry['full'] === 'prompt:commit')).toEqual({
          full: 'prompt:commit',
          space: 'prompt',
          name: 'commit',
          kind: 'prompt',
          title: '写提交说明。',
          hint: '<scope> [note]',
          params: [{ name: 'scope' }, { name: 'note', optional: true }],
        })

        const send = async (input: string, words: string, seen?: unknown) =>
          tree.clients.session['send-input']({
            tenant,
            session: sessionRef(session),
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
            ...(seen === undefined ? {} : { seen }),
          } as unknown as Send)
        const words = '/commit core "fix the login" 再看 /review'
        expect(
          await send('in-1', words, { command: 'prompt:commit', references: [] }),
        ).toMatchObject({
          outcome: 'succeeded',
        })
        const entriesAfter = await pollUntil(
          'the run to end',
          () => historyOf(tree, session),
          found => found.filter(entry => entry.kind === 'run.terminal').length >= 2,
        )
        const user = JSON.stringify(
          entriesAfter.filter(entry => entry.kind === 'message.user').at(-1),
        )
        const expanded = '为 core 写提交说明。备注：core \\"fix the login\\" 再看 /review'
        expect(user).toContain('/commit core \\"fix the login\\" 再看 /review')
        expect(user).toContain(expanded)
        expect(user).toContain('prompt:commit')
        expect(user).not.toContain('skill:review')
        expect(requests.at(-1)).toContain('为 core 写提交说明')

        for (const [name, text, reason] of [
          ['half', promptFile('name: half', '写点什么'), 'description is missing'],
          ['taken', promptFile('name: omne-official:taken\ndescription: d', 'x'), 'omne-official'],
          ['empty', promptFile('name: empty\ndescription: d', ''), 'the prompt is missing'],
        ] as const) {
          const refused = await publish(tree.clients.assets, tenant, name, text)
          expect(refused.outcome, name).not.toBe('succeeded')
          expect(JSON.stringify(refused), name).toContain(reason)
        }

        expect(
          await tree.clients.assets['set-asset-enabled']({
            tenant,
            operation: 'disable-commit',
            holding,
            enabled: false,
          } as never),
        ).toMatchObject({ outcome: 'succeeded' })
        expect(await send('in-2', '/commit x')).toEqual({
          outcome: 'invalid',
          body: {
            field: 'value.message',
            reason: 'not usable now: /prompt:commit: This prompt command is disabled.',
          },
        })
      })
      expect(exitCode).toBe(0)
    },
  )
})
