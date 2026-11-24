// @module-tag slow
// Starts the release tree: a tool and an Agent definition kept in the workspace, never published.
import { describe, expect, it } from 'vitest'
import {
  agents,
  cliOk,
  extensions,
  files,
  follow,
  plan,
  planner,
  tools,
} from '../support/planned-model.ts'
import { history, pollUntil, toolResults } from '../support/release-tree.ts'
import { COUNT_PY, inWorkspace, WORDCOUNT, write } from './support.ts'

const HELPER_MD = `---
name: helper
summary: Reads what it is pointed at and says what is there. MARK-HELPER-SUMMARY
references:
  - { category: tool, name: Files, resident: true }
---
You read files. MARK-HELPER
`

const BOSS_MD = `---
name: boss
summary: Says it is a master. MARK-BOSS
type: master
---
You are in charge.
`

const search = (query: string) => tools('search', { query, after: null, limit: 10 })
const count = (text: string) =>
  tools('execute', { name: 'wordcount', command: null, arguments: { text } })
const hand = (instruction: string) =>
  agents('dispatch', { mode: 'delegate', agent: 'helper', instruction })

describe('a tool and a definition kept in the workspace, on the release tree', () => {
  it(
    'are not there in the turn that wrote them, are there from the next turn on, and are not there for a session elsewhere',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      await inWorkspace(async (ask, tree) => {
        const wrote = await ask(
          [
            write('.omne/tools/wordcount/tool.json', JSON.stringify(WORDCOUNT)),
            write('.omne/tools/wordcount/count.py', COUNT_PY),
            write('.omne/agents/helper/AGENT.md', HELPER_MD),
            write('.omne/agents/boss/AGENT.md', BOSS_MD),
            write('notes.txt', 'the word is plover\n'),
          ],
          [search('count words'), agents('targets', {})],
          [count('one two')],
        )
        expect(wrote).not.toContain('Count the words of a text')
        expect(wrote).not.toContain('"agent":"helper"')
        expect(wrote).not.toMatch(/^2$/mu)

        // The next turn reads the workspace again: both are there, and both work.
        const next = await ask(
          [search('count words'), agents('targets', {})],
          [count('one two three four')],
          [follow],
          [follow],
          [hand(plan([files('read', { path: 'notes.txt' })]))],
        )
        expect(next).toContain('Count the words of a text')
        expect(next).toMatch(/^4$/mu)
        expect(next).toContain('"agent":"helper","type":"non-master"')
        // A definition that says it is a master is not one a workspace can bring: it is not there.
        expect(next).not.toContain('"agent":"boss"')
        expect(next).toContain('started in the background')
        const listed = await pollUntil(
          'the session of the helper to be listed',
          async () => (await cliOk(tree, ['list-sessions', '--definition', 'helper'])).body,
          body => JSON.stringify(body).includes('"definition":"helper"'),
        )
        const child = /"session":"([0-9a-f]{64})"/u.exec(JSON.stringify(listed))?.[1] ?? ''
        const entries = await pollUntil(
          'the helper session to end its run',
          () => history(tree.port, tree.home, child),
          seen => seen.some(entry => entry.kind === 'run.terminal'),
        )
        expect(toolResults(entries).join('\n')).toContain('the word is plover')

        // A session of the same tenant that stands at no workspace sees neither.
        const plain = await cliOk(tree, ['create-session', '--definition', 'coding'])
        const there = planner(tree)
        const elsewhere = await there(
          String(plain.body['session']),
          [search('count words'), agents('targets', {})],
          [count('one two')],
          [follow],
          [follow],
        )
        expect(elsewhere).not.toContain('Count the words of a text')
        expect(elsewhere).not.toContain('"agent":"helper"')
        expect(elsewhere).not.toMatch(/^2$/mu)

        // By its name alone no session is made with it; how to write one says it has to be published first.
        const made = await tree.cli(['create-session', '--definition', 'helper'])
        expect(made.status).not.toBe(0)
        expect(made.stdout).toContain('"outcome":"invalid"')
        // (Asked in the other session: the report of the helper starts a run of its own in the first one.)
        const told = await there(String(plain.body['session']), [
          extensions('help', { name: 'publish', category: 'AgentDefinition' }),
        ])
        expect(told).toContain('a session is made with it by its name only once it is published')
      })
    },
  )
})
