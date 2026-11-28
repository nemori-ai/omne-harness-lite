import { readdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { OFFICIAL_SKILLS } from '@omne-harness/plugin-host-local'
import { describe, expect, it } from 'vitest'
import { savedTenant } from '../../r9/support.ts'
import { uploadPlugin } from '../../support/plugin-packages.ts'
import { tenantOf } from '../../support/protocol-clients.ts'
import { onReleaseTree, toolCallsByRequest, toolResults } from '../../support/release-tree.ts'
import { lastMessageOf, recoveryOf } from '../../support/tools-flow.ts'
import {
  answerCard,
  endedRuns,
  pendingCard,
  sendInput,
} from '../authorization/release-flow-support.ts'

const HANDBOOK = 'extending-the-app'
const directory = OFFICIAL_SKILLS.find(skill => skill.name === HANDBOOK)?.directory ?? ''
const example = (name: string) => join(directory, 'examples', name)

function said(body: string): string {
  const last = lastMessageOf(body)
  if (last?.role !== 'user') return ''
  const content = last.content
  return typeof content === 'string'
    ? content
    : (content as { text?: string }[]).map(part => part.text ?? '').join('')
}

const call = (tool: string, command: string, params: object) => ({
  id: `c_${tool}_${command}_${Date.now()}`,
  tool,
  arguments: JSON.stringify({ command, params }),
})

const script = toolCallsByRequest(body => {
  const recovery = recoveryOf(lastMessageOf(body))
  if (recovery !== undefined) return [call('Tools', recovery.command, recovery.params as object)]
  const [verb, arg = ''] = said(body).split(' ')
  if (verb === 'read')
    return [
      call('Tools', 'execute', { name: 'reader__read', command: 'run', arguments: { url: arg } }),
    ]
  if (verb === 'list') return [call('Skills', 'list', { skill: HANDBOOK })]
  if (verb === 'file') return [call('Skills', 'read_file', { skill: HANDBOOK, path: arg })]
  if (verb === 'show') return [call('OmneExtensionPoints', 'show', { name: arg })]
  return []
})

describe('the developer handbook the release brings (extending-the-app)', () => {
  it(
    'an agent reads its examples with Skills, and its server example, published as it is, is in effect for the tenant',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree(
        { script, permission: 'auto_permission' },
        async tree => {
          const session = await tree.startSession('hello')
          let runs = 1
          await endedRuns(tree, session, runs)
          const ask = async (text: string): Promise<string> => {
            await sendInput(tree, session, text)
            runs += 1
            return toolResults(await endedRuns(tree, session, runs)).at(-1) ?? ''
          }

          const listed = await ask('list')
          for (const path of [
            'examples/weather-protocol/plugin.json',
            'examples/send-button-look/plugin.json',
            'examples/notes-page/plugin.json',
            'examples/notes-page/page.js',
            'examples/notes-page/protocol.js',
            'examples/page-reader/plugin.json',
            'examples/page-reader/tools.js',
          ])
            expect(listed, path).toContain(path)
          const file = 'examples/weather-protocol/protocol.js'
          expect(await ask(`file ${file}`)).toContain(
            readFileSync(join(directory, file), 'utf8').trim(),
          )

          const tenant = tenantOf(savedTenant(tree.home))
          for (const name of ['weather-protocol', 'notes-page', 'page-reader']) {
            const dir = example(name)
            const files = Object.fromEntries(
              readdirSync(dir).map(each => [each, readFileSync(join(dir, each), 'utf8')]),
            )
            const made = await uploadPlugin(tree.clients.assets, tenant, name, files)
            expect(made.outcome, JSON.stringify(made)).toBe('succeeded')
          }
          let shown = ''
          for (let turn = 0; turn < 8 && !shown.includes('plugin:notes-page@'); turn += 1)
            shown = await ask('show access.protocols')
          expect(shown).toMatch(
            /^\s+weather\/v1\s+plugin:weather-protocol@\S+ this tenant\s+\[in effect\]$/mu,
          )
          expect(shown).toMatch(
            /^\s+notes\/v1\s+plugin:notes-page@\S+ this tenant\s+\[in effect\]$/mu,
          )

          let sources = ''
          for (let turn = 0; turn < 8 && !sources.includes('plugin:page-reader@'); turn += 1)
            sources = await ask('show tool.entry-sources')
          expect(sources).toMatch(
            /^\s+reader__\s+plugin:page-reader@\S+ this tenant\s+\[in effect\]$/mu,
          )

          // The tool example in a session: the first call asks the person, then the page comes back through web.
          const outside = createServer((_request, response) => {
            response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
            response.end('a page outside the app')
          })
          await new Promise<void>(resolve => outside.listen(0, '127.0.0.1', resolve))
          try {
            const address = `http://127.0.0.1:${String((outside.address() as AddressInfo).port)}/page`
            await sendInput(tree, session, `read ${address}`)
            const card = await pendingCard(tree, session, 'the first read of the page')
            expect(JSON.stringify(card.question)).toContain('reader__read')
            await answerCard(tree, card, ['--option', 'allow-once'], 'reply-read')
            runs += 1
            const results = toolResults(await endedRuns(tree, session, runs)).join('\n')
            expect(results).toContain('done reader__read')
            expect(results).toContain('"text":"a page outside the app"')
          } finally {
            await new Promise<void>(resolve => outside.close(() => resolve()))
          }
        },
      )
      expect(exitCode).toBe(0)
    },
  )
})
