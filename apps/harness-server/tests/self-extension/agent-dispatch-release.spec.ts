// @module-tag slow
// Starts the release tree: an agent publishes an Agent definition and hands work to it.
import { describe, expect, it } from 'vitest'
import { agents, cliOk, extensions, files, planner, plan } from '../support/planned-model.ts'
import { history, pollUntil, toolResults } from '../support/release-tree.ts'
import { inWorkspace, otherTenant, recordingModel, write } from './support.ts'

const AGENT_MD = `---
name: reviewer
summary: Reviews one file and reports what it found. MARK-SUMMARY
references:
  - { category: tool, name: Files, resident: true }
---
You review code. MARK-REVIEWER
`

const toolNamesOf = (body: string): string[] =>
  ((JSON.parse(body) as { tools?: { function?: { name?: string } }[] }).tools ?? []).map(
    tool => tool.function?.name ?? '',
  )

describe('work handed to a definition the tenant published, on the release tree', () => {
  it(
    'is among the targets of this tenant and not of another, and the session it starts works by the definition and its resident tools',
    { tags: ['slow'], timeout: 120_000 },
    async () => {
      const model = recordingModel()
      await inWorkspace(
        async (ask, tree) => {
          const published = await ask(
            [write('work/reviewer/AGENT.md', AGENT_MD), write('notes.txt', 'the word is plover\n')],
            [
              extensions('publish', {
                id: 'op-1',
                category: 'AgentDefinition',
                name: 'reviewer',
                dir: 'work/reviewer',
              }),
            ],
            [agents('targets', {})],
          )
          expect(published).toContain('done OmneExtensions publish')
          expect(published).toContain('"agent":"reviewer","type":"non-master"')
          expect(published).toContain('MARK-SUMMARY')
          expect(published).toContain('"agent":"coding","type":"master"')

          // The work goes to the reviewer: its session reads a file with its resident tool; its last reply is the report.
          const work = plan([files('read', { path: 'notes.txt' })])
          const handed = await ask([
            agents('dispatch', { mode: 'delegate', agent: 'reviewer', instruction: work }),
          ])
          expect(handed).toContain('started in the background')
          const listed = await pollUntil(
            'the session of the reviewer to be listed',
            async () => (await cliOk(tree, ['list-sessions', '--definition', 'reviewer'])).body,
            body => JSON.stringify(body).includes('"definition":"reviewer"'),
          )
          const child = /"session":"([0-9a-f]{64})"/u.exec(JSON.stringify(listed))?.[1] ?? ''
          const entries = await pollUntil(
            'the reviewer session to end its run',
            () => history(tree.port, tree.home, child),
            seen => seen.some(entry => entry.kind === 'run.terminal'),
          )
          const results = toolResults(entries).join('\n')
          const ofReviewer = model.bodies.filter((_, at) =>
            model.systems[at]?.includes('MARK-REVIEWER'),
          )
          expect(results).toContain('the word is plover')

          // Its requests carry the instructions of the definition and exactly its resident tools.
          const own = ofReviewer
          expect(own.length).toBeGreaterThan(0)
          for (const body of own) expect(toolNamesOf(body)).toEqual(['Files'])

          // Another tenant does not see the definition among its targets, and cannot hand work to it.
          const other = await otherTenant(tree)
          const made = await cliOk(other, ['create-session', '--definition', 'coding'])
          const theirs = String(made.body['session'])
          const asked = await planner(other)(
            theirs,
            [agents('targets', {})],
            [agents('dispatch', { mode: 'delegate', agent: 'reviewer', instruction: 'look' })],
          )
          expect(asked).toContain('"agent":"coding","type":"master"')
          expect(asked).not.toContain('"agent":"reviewer"')
          expect(asked).not.toContain('MARK-SUMMARY')
          // The dispatch runs in the background: given the time the first one took, no session is made for it.
          await new Promise(resolve => setTimeout(resolve, 4000))
          const none = await cliOk(other, ['list-sessions', '--definition', 'reviewer'])
          expect(JSON.stringify(none.body)).not.toContain('"definition":"reviewer"')
        },
        { script: model.script },
      )
    },
  )
})
