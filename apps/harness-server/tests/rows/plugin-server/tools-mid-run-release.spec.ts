// @module-tag slow
// A plugin's tool installed while a turn runs: Tools finds it in that turn, whose request prefix stays the same (C24).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { OFFICIAL_SKILLS } from '@omne-harness/plugin-host-local'
import { describe, expect, it } from 'vitest'
import { savedTenant } from '../../r9/support.ts'
import { uploadPlugin } from '../../support/plugin-packages.ts'
import { tenantOf } from '../../support/protocol-clients.ts'
import {
  onReleaseTree,
  pollUntil,
  toolCallsByRequest,
  toolResults,
} from '../../support/release-tree.ts'
import { lastMessageOf, prefixOf } from '../../support/tools-flow.ts'
import { endedRuns, sendInput } from '../authorization/release-flow-support.ts'

const handbook = OFFICIAL_SKILLS.find(skill => skill.name === 'extending-the-app')?.directory ?? ''
const READER = join(handbook, 'examples', 'page-reader')
const HELD = /^\s+reader__\s+plugin:page-reader@\S+ this tenant\s+\[in effect\]$/mu

const textOf = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : (content as { text?: string }[]).map(part => part.text ?? '').join('')

const bodies: string[] = []
let step = 0
const call = (tool: string, command: string, params: object) => ({
  id: `c_${String((step += 1))}`,
  tool,
  arguments: JSON.stringify({ command, params }),
})

/** One turn: it reads the entry sources until the plugin's tools are there, then searches for them once, then ends. */
const script = toolCallsByRequest(body => {
  bodies.push(body)
  const last = lastMessageOf(body)
  const said = last?.role === 'tool' ? textOf(last.content) : ''
  if (said.includes('"tools":[')) return []
  if (HELD.test(said))
    return [
      call('Tools', 'search', { query: 'reads the text of the page', after: null, limit: 10 }),
    ]
  return [call('OmneExtensionPoints', 'show', { name: 'tool.entry-sources' })]
})

describe("a plugin's tool installed while a turn runs, on the release tree", () => {
  it(
    'Tools finds it in the same turn, and every request of that turn gives the model the same prefix',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree({ script }, async tree => {
        const session = await tree.startSession('hello')
        await endedRuns(tree, session, 1)
        const from = bodies.length
        await sendInput(tree, session, 'go')
        await pollUntil(
          'the turn to have asked the model',
          () => Promise.resolve(bodies.length),
          seen => seen > from,
        )
        const files = Object.fromEntries(
          readdirSync(READER).map(each => [each, readFileSync(join(READER, each), 'utf8')]),
        )
        const tenant = tenantOf(savedTenant(tree.home))
        const made = await uploadPlugin(tree.clients.assets, tenant, 'page-reader', files)
        expect(made.outcome, JSON.stringify(made)).toBe('succeeded')

        const results = toolResults(await endedRuns(tree, session, 2))
        expect(results.at(-1)).toContain('reader__read')
        const turn = bodies.slice(from)
        expect(turn.length).toBeGreaterThanOrEqual(3)
        expect(new Set(turn.map(prefixOf)).size).toBe(1)
        expect(turn.at(0)).not.toContain('reader__read')
      })
      expect(exitCode).toBe(0)
    },
  )
})
