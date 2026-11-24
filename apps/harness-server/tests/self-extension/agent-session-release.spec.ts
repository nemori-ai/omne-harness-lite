// @module-tag slow
// Starts the release tree: sessions are made with an Agent definition a tenant published, and follow its versions.
import { describe, expect, it } from 'vitest'
import { cliOk, extensions, files } from '../support/planned-model.ts'
import { historyOf, pollUntil } from '../support/release-tree.ts'
import { inWorkspace, otherTenant, recordingModel, write } from './support.ts'

const agentMd = (line: string) => `---
name: reviewer
summary: Reviews one file and reports what it found.
---
You review code. ${line}
`

const publish = (id: string) =>
  extensions('publish', { id, category: 'AgentDefinition', name: 'reviewer', dir: 'work/reviewer' })

describe('a session made with a definition the tenant published, on the release tree', () => {
  it(
    'is created by name, works by the instructions of the definition, takes a new version at the next run, and stops when the definition is removed',
    { tags: ['slow'], timeout: 120_000 },
    async () => {
      const model = recordingModel()
      await inWorkspace(
        async (ask, tree) => {
          const published = await ask(
            [write('work/reviewer/AGENT.md', agentMd('MARK-ONE'))],
            [publish('op-1')],
          )
          expect(published).toContain('done OmneExtensions publish')

          // Created by name; the first request carries the instructions of the definition and not coding's.
          const made = await cliOk(tree, ['create-session', '--definition', 'reviewer'])
          expect(made.outcome).toBe('succeeded')
          const session = String(made.body['session'])
          const runs = async (wanted: number) =>
            pollUntil(
              `run ${String(wanted)} of the reviewer session to end`,
              () => historyOf(tree, session),
              seen => seen.filter(entry => entry.kind === 'run.terminal').length >= wanted,
            )
          const before = model.systems.length
          await cliOk(tree, ['send-input', '--session', session, '--text', 'look at this'])
          const first = await runs(1)
          const own = model.systems.slice(before)
          expect(own.length).toBeGreaterThan(0)
          expect(own.every(system => system.includes('MARK-ONE'))).toBe(true)
          expect(own.some(system => system.includes('OmneExtensions'))).toBe(false)
          // The creation itself records the adoption the session starts with; nothing more is recorded here.
          const adoptions = (entries: typeof first) =>
            entries.filter(entry => entry.kind === 'session.adoption').length
          const initial = adoptions(first)
          expect(initial).toBeLessThanOrEqual(1)

          // A run with the same version records no adoption.
          await cliOk(tree, ['send-input', '--session', session, '--text', 'once more'])
          expect(adoptions(await runs(2))).toBe(initial)

          // A new version: the next run of the session that stands at the old one takes it, once.
          const again = await ask(
            [
              files('write', {
                path: 'work/reviewer/AGENT.md',
                text: agentMd('MARK-TWO'),
                mode: 'replace',
              }),
            ],
            [publish('op-2')],
          )
          expect(again).toContain('done OmneExtensions publish')
          const mid = model.systems.length
          await cliOk(tree, ['send-input', '--session', session, '--text', 'and now'])
          const third = await runs(3)
          const later = model.systems.slice(mid)
          expect(later.every(system => system.includes('MARK-TWO'))).toBe(true)
          expect(adoptions(third)).toBe(initial + 1)
          await cliOk(tree, ['send-input', '--session', session, '--text', 'again'])
          expect(adoptions(await runs(4))).toBe(initial + 1)

          // Another tenant has no definition of that name.
          const other = await otherTenant(tree)
          const refused = await other.cli(['create-session', '--definition', 'reviewer'])
          expect(JSON.parse(refused.stdout), 'another tenant').toMatchObject({ outcome: 'invalid' })
          const unknown = await tree.cli(['create-session', '--definition', 'no-such-definition'])
          expect(JSON.parse(unknown.stdout), 'an unknown name').toMatchObject({
            outcome: 'invalid',
          })
          const assistant = await other.cli(['create-session', '--definition', 'assistant'])
          expect(JSON.parse(assistant.stdout)).toMatchObject({ outcome: 'succeeded' })

          // Removed: no session is made with it, and the session that stands at it starts no run.
          const removed = await ask([
            extensions('remove', { id: 'op-3', category: 'AgentDefinition', name: 'reviewer' }),
          ])
          expect(removed).toContain('done OmneExtensions remove')
          const gone = await tree.cli(['create-session', '--definition', 'reviewer'])
          expect(JSON.parse(gone.stdout), 'after the removal').toMatchObject({ outcome: 'invalid' })
          const sent = model.systems.length
          await cliOk(tree, ['send-input', '--session', session, '--text', 'still there?'])
          // The run cannot start: the input stays accepted and not taken, and no request is made.
          await new Promise(resolve => setTimeout(resolve, 3000))
          const pending = await cliOk(tree, ['read-pending', '--session', session])
          expect(JSON.stringify(pending.body)).toContain('still there?')
          expect(model.systems.slice(sent).some(system => system.includes('MARK-'))).toBe(false)
          expect(
            (await historyOf(tree, session)).filter(entry => entry.kind === 'run.terminal'),
          ).toHaveLength(4)
        },
        { script: model.script, extraHistoryKinds: ['session.adoption'] },
      )
    },
  )
})
