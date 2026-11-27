// @module-tag slow
// A plugin's directory member on a directory category and data member on a data category, on the release tree (C25, C26).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { capabilityId, evaluate } from '@omne-harness/assets'
import { describe, expect, it } from 'vitest'
import { askerLayersOf } from '../../../src/rows/tenant-assets/asker-layers.ts'
import { answerCard, pendingCard } from '../authorization/release-flow-support.ts'
import { COUNT_PY, inWorkspace, points, WORDCOUNT } from '../../self-extension/support.ts'
import { extensions, follow, tools } from '../../support/planned-model.ts'
import { toolCalls } from '../../support/release-tree.ts'

const MANIFEST = {
  schema: 1,
  name: 'counter',
  summary: 'Counts words, and names a shop endpoint.',
  server: {
    members: [
      { point: 'tool.tools', key: 'wordcount', directory: 'tools/wordcount' },
      {
        point: 'mcp.endpoints',
        key: 'shop',
        data: { name: 'shop', transport: 'streamable-http', auth: 'none' },
      },
    ],
  },
}

const linesOf = (text: string, word: string) =>
  text
    .split('\n')
    .filter(line => line.includes(word))
    .join('\n')

const count = (text: string) =>
  tools('execute', { name: 'wordcount', command: null, arguments: { text } })

describe("a plugin's members on the categories of the release", () => {
  it(
    'its script tool is held for the tenant and its first call shows a release card; its data member is held on the data category',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      await inWorkspace(
        async (ask, tree, project, session) => {
          const dir = join(project, 'work/counter')
          mkdirSync(join(dir, 'tools/wordcount'), { recursive: true })
          writeFileSync(join(dir, 'plugin.json'), JSON.stringify(MANIFEST))
          writeFileSync(join(dir, 'tools/wordcount/tool.json'), JSON.stringify(WORDCOUNT))
          writeFileSync(join(dir, 'tools/wordcount/count.py'), COUNT_PY)
          const published = await ask([
            extensions('publish', {
              id: 'op-counter',
              category: 'plugin',
              name: 'counter',
              dir: 'work/counter',
            }),
          ])
          expect(published).toContain('done OmneExtensions publish')

          let held = ''
          for (let turn = 0; turn < 8 && !held.includes('plugin:counter@'); turn += 1)
            held = await ask([points('show', { name: 'tool.tools' })])
          expect(linesOf(held, 'counter')).toMatch(
            /^\s+wordcount\s+plugin:counter@\S+ this tenant\s+\[in effect\]$/mu,
          )
          const endpoints = await ask([points('show', { name: 'mcp.endpoints' })])
          expect(linesOf(endpoints, 'counter')).toMatch(
            /^\s+shop\s+plugin:counter@\S+ this tenant\s+\[in effect\]$/mu,
          )
          // Read as the category reads it: the held item names the member's data, and that data is its body.
          const layers = await askerLayersOf(tree.scope, 'mcp')({ tenant: tree.registrar().tenant })
          const shop = capabilityId('mcp', 'shop')
          if (layers === undefined || !shop.ok) throw new Error('the layers of mcp are not there')
          const inputs = await Promise.all(layers.sources.map(each => each.candidates(shop.id)))
          const answer = evaluate({ layers: inputs, eligible: () => 'yes' })
          if (answer.kind !== 'winner') throw new Error(JSON.stringify(answer))
          expect([answer.layer, answer.candidate.valueAt]).toEqual([
            'tenant',
            'plugin.json#/server/members/1/data',
          ])
          const text = (value: string) => ({ kind: 'string', value })
          expect(await layers.body(answer.candidate)).toEqual({
            kind: 'object',
            entries: [
              { key: 'name', value: text('shop') },
              { key: 'transport', value: text('streamable-http') },
              { key: 'auth', value: text('none') },
            ],
          })

          const ran = () => toolCalls(tree.storageRoot).filter(row => row.tool === 'wordcount')
          const released = ask([count('one two three')], [follow], [follow])
          const card = await pendingCard(tree, session, 'the first call of the plugin tool')
          expect(card.question).toMatchObject({
            kind: 'release',
            target: { tool: 'wordcount', command: null },
            gateTitle: '调用',
          })
          await answerCard(tree, card, ['--option', 'allow-once'], 'reply-allow')
          expect(await released).toMatch(/^3$/mu)
          expect(ran()).toHaveLength(1)
        },
        { permission: 'auto_permission' },
      )
    },
  )
})
