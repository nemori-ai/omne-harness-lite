// @module-tag slow
// Starts the release tree: a resident Skill the definition names is published after the session began; the next run has it.
import { describe, expect, it } from 'vitest'
import { cliOk, extensions, plan } from '../support/planned-model.ts'
import { historyOf, pollUntil } from '../support/release-tree.ts'
import { inWorkspace, recordingModel, write } from './support.ts'

const FIRST = 'Tidies meeting notes into decisions and actions.'
const LATER = 'Turns a list of actions into a plan by date. MARK-LATER'

const skill = (name: string, description: string) => `---
name: ${name}
description: ${description}
---
Do what the description says.
`

const AGENT_MD = `---
name: notetaker
summary: Takes notes.
references:
  - { category: tool, name: Skills, resident: true }
  - { category: skill, name: tidy-notes, resident: true }
  - { category: skill, name: plan-actions, resident: true }
---
You take notes. MARK-NOTETAKER
`

function systemTextOf(body: string): string {
  const { messages } = JSON.parse(body) as { messages: { role: string; content: unknown }[] }
  return messages
    .filter(message => message.role === 'system')
    .map(({ content }) =>
      typeof content === 'string'
        ? content
        : (content as { text?: string }[]).map(part => part.text ?? '').join(''),
    )
    .join('\n')
}

const publish = (id: string, category: string, name: string) =>
  extensions('publish', { id, category, name, dir: `work/${name}` })

describe('a resident Skill published after the session began, on the release tree', () => {
  it(
    'is judged at the next run with the definition unchanged: the run after it was published has its line, after the lines kept',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const model = recordingModel()
      await inWorkspace(
        async (ask, tree) => {
          await ask(
            [
              write('work/tidy-notes/SKILL.md', skill('tidy-notes', FIRST)),
              write('work/notetaker/AGENT.md', AGENT_MD),
            ],
            [publish('op-1', 'skill', 'tidy-notes')],
            [publish('op-2', 'AgentDefinition', 'notetaker')],
          )
          const created = await cliOk(tree, ['create-session', '--definition', 'notetaker'])
          const session = String(created.body['session'])
          const runs = (wanted: number) =>
            pollUntil(
              `run ${String(wanted)} of the notetaker session to end`,
              () => historyOf(tree, session),
              seen => seen.filter(entry => entry.kind === 'run.terminal').length >= wanted,
            )
          const own = () =>
            model.bodies.map(systemTextOf).filter(system => system.includes('MARK-NOTETAKER'))
          await cliOk(tree, ['send-input', '--session', session, '--text', plan()])
          await runs(1)
          const before = own().at(-1) ?? ''
          expect(before).toContain(`- tidy-notes: ${FIRST}`)
          expect(before).not.toContain('plan-actions')

          await ask(
            [write('work/plan-actions/SKILL.md', skill('plan-actions', LATER))],
            [publish('op-3', 'skill', 'plan-actions')],
          )
          await cliOk(tree, ['send-input', '--session', session, '--text', 'and now'])
          await runs(2)
          const after = own().at(-1) ?? ''
          expect(after).toContain(`- plan-actions: ${LATER}`)
          expect(after.indexOf(`- tidy-notes: ${FIRST}`)).toBeGreaterThan(-1)
          expect(after.indexOf(`- tidy-notes: ${FIRST}`)).toBeLessThan(
            after.indexOf('plan-actions'),
          )
        },
        { script: model.script },
      )
    },
  )
})
