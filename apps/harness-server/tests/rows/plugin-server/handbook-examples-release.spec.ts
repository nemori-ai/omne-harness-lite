import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { OFFICIAL_SKILLS } from '@omne-harness/plugin-host-local'
import { describe, expect, it } from 'vitest'
import { savedTenant } from '../../r9/support.ts'
import { uploadPlugin } from '../../support/plugin-packages.ts'
import { tenantOf } from '../../support/protocol-clients.ts'
import { onReleaseTree, toolCallsByRequest, toolResults } from '../../support/release-tree.ts'
import { lastMessageOf } from '../../support/tools-flow.ts'
import { endedRuns, sendInput } from '../authorization/release-flow-support.ts'

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
  const [verb, arg = ''] = said(body).split(' ')
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
      const exitCode = await onReleaseTree({ script }, async tree => {
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
        ])
          expect(listed, path).toContain(path)
        const file = 'examples/weather-protocol/protocol.js'
        expect(await ask(`file ${file}`)).toContain(
          readFileSync(join(directory, file), 'utf8').trim(),
        )

        const dir = example('weather-protocol')
        const files = Object.fromEntries(
          readdirSync(dir).map(name => [name, readFileSync(join(dir, name), 'utf8')]),
        )
        const tenant = tenantOf(savedTenant(tree.home))
        const made = await uploadPlugin(tree.clients.assets, tenant, 'weather-protocol', files)
        expect(made.outcome, JSON.stringify(made)).toBe('succeeded')
        let shown = ''
        for (let turn = 0; turn < 8 && !shown.includes('plugin:weather-protocol@'); turn += 1)
          shown = await ask('show access.protocols')
        expect(shown).toMatch(
          /^\s+weather\/v1\s+plugin:weather-protocol@\S+ this tenant\s+\[in effect\]$/mu,
        )
      })
      expect(exitCode).toBe(0)
    },
  )
})
