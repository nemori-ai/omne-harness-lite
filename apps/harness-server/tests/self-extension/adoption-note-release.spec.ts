// @module-tag slow
// Starts the release tree: a run whose new definition cannot be used goes on with the one it stood at, or waits, and says why.
import { tenantCodec } from '@omne-harness/legal-identity'
import { describe, expect, it } from 'vitest'
import { agents, cliOk, extensions, files, plan } from '../support/planned-model.ts'
import { history, pollUntil, type ReleaseTree } from '../support/release-tree.ts'
import { inWorkspace, recordingModel, write } from './support.ts'

const definition = (references: string) => `---
name: noter
summary: Says back what it is told.
references:
${references}
---
You say back what you are told. MARK-NOTER
`
const FILES = '  - { category: tool, name: Files, resident: true }'
const VALID = definition(FILES)
const UNHELD = definition(`${FILES}\n  - { category: tool, name: nosuchtool, resident: true }`)

const publish = (id: string) =>
  extensions('publish', { id, category: 'AgentDefinition', name: 'noter', dir: 'work/noter' })
const replace = (path: string, text: string) => files('write', { path, text, mode: 'replace' })

type Ask = Parameters<Parameters<typeof inWorkspace>[0]>[0]
type Entry = Awaited<ReturnType<typeof history>>[number]

const say = (tree: ReleaseTree, session: string, text: string) => {
  const owner = tenantCodec.encode(tree.registrar().tenant)
  if (!owner.ok) throw new Error('the tenant of the tree has no text')
  return cliOk(tree, ['send-input', '--session', session, '--text', text, '--tenant', owner.value])
}
const of = (entries: readonly Entry[], kind: string) => entries.filter(item => item.kind === kind)

async function noterSession(ask: Ask, tree: ReleaseTree): Promise<string> {
  const made = await ask([write('work/noter/AGENT.md', VALID)], [publish('op-1')])
  expect(made).toContain('done OmneExtensions publish')
  await ask([agents('dispatch', { mode: 'delegate', agent: 'noter', instruction: plan() })])
  const listed = await pollUntil(
    'the session of the noter to be listed',
    async () => (await cliOk(tree, ['list-sessions', '--definition', 'noter'])).body,
    body => JSON.stringify(body).includes('"definition":"noter"'),
  )
  const child = /"session":"([0-9a-f]{64})"/u.exec(JSON.stringify(listed))?.[1] ?? ''
  await pollUntil(
    'the first run of the noter to end',
    () => history(tree.port, tree.home, child),
    seen => of(seen, 'run.terminal').length >= 1,
  )
  return child
}

describe('a run whose new definition cannot be used, on the release tree', () => {
  it(
    'starts on the definition it stood at when the new version is refused, and says why where a person reads it',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const model = recordingModel()
      await inWorkspace(
        async (ask, tree) => {
          const child = await noterSession(ask, tree)
          const before = (await history(tree.port, tree.home, child)).find(
            item => item.kind === 'run.started',
          )
          expect(await ask([replace('work/noter/AGENT.md', UNHELD)], [publish('op-2')])).toContain(
            'done OmneExtensions publish',
          )
          await say(tree, child, plan())
          const after = await pollUntil(
            'the second run of the noter to end',
            () => history(tree.port, tree.home, child),
            seen => of(seen, 'run.terminal').length >= 2,
          )
          const started = of(after, 'run.started')
          expect(started).toHaveLength(2)
          const adoptionOf = (item: Entry | undefined) =>
            (item?.payload as { adoption?: unknown } | undefined)?.adoption
          expect(adoptionOf(started[1])).toEqual(adoptionOf(before))
          expect(adoptionOf(before)).toBeDefined()
          const notes = of(after, 'session.adoption-noted')
          expect(notes).toHaveLength(1)
          expect(notes[0]?.payload).toMatchObject({ note: { kind: 'kept' } })
          expect(JSON.stringify(notes[0]?.payload)).toContain('the new version of noter')
          expect(JSON.stringify(notes[0]?.payload)).toContain('nosuchtool')
          const own = model.bodies.filter((_, at) => model.systems[at]?.includes('MARK-NOTER'))
          for (const body of own) expect(body).not.toContain('the new version of noter')
        },
        { script: model.script },
      )
    },
  )

  it(
    'does not start while the definition is turned off, keeps the words, says what it waits for, and starts once it is on again without the words sent again',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const model = recordingModel()
      await inWorkspace(
        async (ask, tree) => {
          const child = await noterSession(ask, tree)
          const off = { category: 'AgentDefinition', name: 'noter' }
          expect(await ask([extensions('disable', { id: 'op-2', ...off })])).toContain(
            'done OmneExtensions disable',
          )
          await say(tree, child, plan())
          const waiting = await pollUntil(
            'the noter to say what it waits for',
            () => history(tree.port, tree.home, child),
            seen => of(seen, 'session.adoption-noted').length >= 1,
          )
          expect(of(waiting, 'run.started')).toHaveLength(1)
          expect(of(waiting, 'session.adoption-noted')[0]?.payload).toMatchObject({
            note: { kind: 'waiting' },
          })
          expect(await ask([extensions('enable', { id: 'op-3', ...off })])).toContain(
            'done OmneExtensions enable',
          )
          const resumed = await pollUntil(
            'the noter to start its second run by itself',
            () => history(tree.port, tree.home, child),
            seen => of(seen, 'run.terminal').length >= 2,
          )
          expect(of(resumed, 'run.started')).toHaveLength(2)
          expect(of(resumed, 'message.user')).toHaveLength(1)
        },
        { script: model.script },
      )
    },
  )
})
