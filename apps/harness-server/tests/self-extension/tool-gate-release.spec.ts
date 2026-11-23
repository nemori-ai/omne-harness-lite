// @module-tag slow
// Starts the release tree: the gate of a tool a tenant published asks a person, as the gate of any tool does.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { answerCard, pendingCard } from '../rows/authorization/release-flow-support.ts'
import { extensions, follow, tools } from '../support/planned-model.ts'
import { toolCalls } from '../support/release-tree.ts'
import { COUNT_PY, inWorkspace, WORDCOUNT } from './support.ts'

const count = (text: string) =>
  tools('execute', { name: 'wordcount', command: null, arguments: { text } })
const publish = extensions('publish', {
  id: 'op-1',
  category: 'tool',
  name: 'wordcount',
  dir: 'work/wordcount',
})

describe('the gate of a tool a tenant published, where gates ask, on the release tree', () => {
  it(
    'shows a release card that names the tool; a refusal starts nothing, and a release for the one call runs it',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      await inWorkspace(
        async (ask, tree, project, session) => {
          mkdirSync(join(project, 'work/wordcount'), { recursive: true })
          writeFileSync(join(project, 'work/wordcount/tool.json'), JSON.stringify(WORDCOUNT))
          writeFileSync(join(project, 'work/wordcount/count.py'), COUNT_PY)
          expect(await ask([publish])).toContain('done OmneExtensions publish')
          const ran = () => toolCalls(tree.storageRoot).filter(row => row.tool === 'wordcount')

          const refused = ask([count('one two')])
          const first = await pendingCard(tree, session, 'the refused call')
          expect(first.question).toMatchObject({
            kind: 'release',
            target: { tool: 'wordcount', command: null },
            gateTitle: '调用',
          })
          await answerCard(tree, first, ['--option', 'deny-once'], 'reply-deny')
          const said = await refused
          expect(said).not.toMatch(/^2$/mu)
          expect(ran()).toEqual([])

          const released = ask([count('one two three')], [follow], [follow])
          const second = await pendingCard(tree, session, 'the released call')
          await answerCard(tree, second, ['--option', 'allow-once'], 'reply-allow')
          expect(await released).toMatch(/^3$/mu)
          expect(ran()).toHaveLength(1)

          // A release for one call is spent by it: the next call asks again.
          const again = ask([count('one')])
          const third = await pendingCard(tree, session, 'the call after the released one')
          await answerCard(tree, third, ['--option', 'deny-once'], 'reply-deny-again')
          await again
          expect(ran()).toHaveLength(1)
        },
        { permission: 'auto_permission' },
      )
    },
  )
})
