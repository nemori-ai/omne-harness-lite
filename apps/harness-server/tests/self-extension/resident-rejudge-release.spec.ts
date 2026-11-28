// @module-tag slow
// Starts the release tree: a resident tool is judged again at the start of every run, the definition unchanged.
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tenantCodec } from '@omne-harness/legal-identity'
import { describe, expect, it } from 'vitest'
import {
  agents,
  cliOk,
  direct,
  extensions,
  files,
  plan,
  planner,
} from '../support/planned-model.ts'
import {
  history,
  onReleaseTreeRuns,
  pollUntil,
  type ReleaseTree,
  toolResults,
} from '../support/release-tree.ts'
import { COUNT_PY, inWorkspace, recordingModel, WORDCOUNT, write } from './support.ts'

const AGENT_MD = `---
name: counter
summary: Counts the words of what it is given.
references:
  - { category: tool, name: wordcount, resident: true }
---
You count words. MARK-COUNTER
`

const replace = (path: string, text: string) => files('write', { path, text, mode: 'replace' })

const publish = (id: string, name: string, category = 'tool') =>
  extensions('publish', { id, category, name, dir: `work/${name}` })

type Ask = Parameters<Parameters<typeof inWorkspace>[0]>[0]

/** Publishes the tool and the definition, hands the counter one count, and gives its session once the run ended. */
async function counterSession(ask: Ask, tree: ReleaseTree): Promise<string> {
  const made = await ask(
    [
      write('work/wordcount/tool.json', JSON.stringify(WORDCOUNT)),
      write('work/wordcount/count.py', COUNT_PY),
      write('work/counter/AGENT.md', AGENT_MD),
    ],
    [publish('op-1', 'wordcount')],
    [publish('op-2', 'counter', 'AgentDefinition')],
  )
  expect(made.match(/done OmneExtensions publish/gu)).toHaveLength(2)
  const work = plan([direct('wordcount', { text: 'one two three' })])
  await ask([agents('dispatch', { mode: 'delegate', agent: 'counter', instruction: work })])
  const listed = await pollUntil(
    'the session of the counter to be listed',
    async () => (await cliOk(tree, ['list-sessions', '--definition', 'counter'])).body,
    body => JSON.stringify(body).includes('"definition":"counter"'),
  )
  const child = /"session":"([0-9a-f]{64})"/u.exec(JSON.stringify(listed))?.[1] ?? ''
  const first = await pollUntil(
    'the first run of the counter to end',
    () => history(tree.port, tree.home, child),
    seen => seen.some(entry => entry.kind === 'run.terminal'),
  )
  expect(toolResults(first).join('\n')).toMatch(/^3$/mu)
  return child
}

const say = (tree: ReleaseTree, session: string, text: string) => {
  const owner = tenantCodec.encode(tree.registrar().tenant)
  if (!owner.ok) throw new Error('the tenant of the tree has no text')
  return tree.cli(['send-input', '--session', session, '--text', text, '--tenant', owner.value])
}

describe('a resident tool judged again at the start of each run, on the release tree', () => {
  it(
    'takes a new version of the same shape at the next run, the definition unchanged',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const model = recordingModel()
      await inWorkspace(
        async (ask, tree) => {
          const child = await counterSession(ask, tree)
          const newer =
            'import json, sys\nprint("words:", len(json.load(sys.stdin)["text"].split()))\n'
          expect(
            await ask([replace('work/wordcount/count.py', newer)], [publish('op-3', 'wordcount')]),
          ).toContain('done OmneExtensions publish')
          await say(tree, child, plan([direct('wordcount', { text: 'one two' })]))
          const second = await pollUntil(
            'the second run of the counter to end',
            () => history(tree.port, tree.home, child),
            seen => seen.filter(entry => entry.kind === 'run.terminal').length >= 2,
          )
          expect(toolResults(second).join('\n')).toContain('words: 2')
          expect(second.some(entry => entry.kind === 'session.frozen')).toBe(false)
        },
        { script: model.script },
      )
    },
  )

  it(
    'keeps the declaration and answers a call as unavailable while the tool cannot be had, and does not freeze',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const model = recordingModel()
      await inWorkspace(
        async (ask, tree) => {
          const child = await counterSession(ask, tree)
          expect(
            await ask([extensions('disable', { id: 'op-3', category: 'tool', name: 'wordcount' })]),
          ).toContain('done OmneExtensions disable')
          await say(tree, child, plan([direct('wordcount', { text: 'one two' })]))
          const second = await pollUntil(
            'the second run of the counter to end',
            () => history(tree.port, tree.home, child),
            seen => seen.filter(entry => entry.kind === 'run.terminal').length >= 2,
          )
          expect(toolResults(second).join('\n')).toContain('wordcount is not available now')
          expect(second.some(entry => entry.kind === 'session.frozen')).toBe(false)
        },
        { script: model.script },
      )
    },
  )

  it(
    'freezes at the next run after a restart when the version kept is no longer held and the one held has another shape, says which tool, and freezes once',
    { tags: ['slow'], timeout: 420_000 },
    async () => {
      const model = recordingModel()
      const project = realpathSync(mkdtempSync(join(tmpdir(), 'self-extension-')))
      const state = { child: '', requests: 0 }
      const exitCodes = await onReleaseTreeRuns(
        { script: model.script, permission: 'bypass-permissions' },
        [
          async tree => {
            const { workspace, instance } = (await cliOk(tree, ['workspace', 'register', project]))
              .body
            const at = ['--workspace', String(workspace), '--instance', String(instance)]
            const created = await cliOk(tree, ['create-session', '--definition', 'coding', ...at])
            const send = planner(tree)
            const ask: Ask = (...steps) => send(String(created.body['session']), ...steps)
            state.child = await counterSession(ask, tree)
            const other = {
              ...WORDCOUNT,
              parameters: {
                type: 'object',
                properties: {
                  text: { type: 'string', description: 'The text to count.' },
                  unit: { type: 'string', description: 'What to count.' },
                },
                required: ['text', 'unit'],
              },
            }
            expect(
              await ask(
                [replace('work/wordcount/tool.json', JSON.stringify(other))],
                [publish('op-3', 'wordcount')],
              ),
            ).toContain('done OmneExtensions publish')
          },
          async tree => {
            const { child } = state
            state.requests = model.bodies.length
            await say(tree, child, plan([direct('wordcount', { text: 'one two' })]))
            const frozen = await pollUntil(
              'the counter session to freeze',
              () => history(tree.port, tree.home, child),
              seen => seen.some(entry => entry.kind === 'session.frozen'),
            )
            const entry = frozen.find(item => item.kind === 'session.frozen')
            expect(entry?.payload).toMatchObject({ capability: 'wordcount' })
            expect(frozen.filter(item => item.kind === 'run.started')).toHaveLength(1)
            const again = await say(tree, child, 'once more')
            expect(again.stdout + again.stderr).toMatch(/frozen/u)
            const later = await history(tree.port, tree.home, child)
            expect(later.filter(item => item.kind === 'session.frozen')).toHaveLength(1)
            expect(later.filter(item => item.kind === 'run.started')).toHaveLength(1)
            expect(model.bodies.length).toBe(state.requests)
            const listed = await cliOk(tree, ['list-sessions', '--definition', 'counter'])
            expect(JSON.stringify(listed.body)).toContain('"lifecycle":"frozen"')
          },
        ],
      )
      expect(exitCodes).toEqual([0, 0])
    },
  )
})
