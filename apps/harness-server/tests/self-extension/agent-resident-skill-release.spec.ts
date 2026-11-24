// @module-tag slow
// Starts the release tree: a definition a tenant published keeps a Skill the tenant published resident.
import { describe, expect, it } from 'vitest'
import { cliOk, direct, extensions, files, plan } from '../support/planned-model.ts'
import { historyOf, pollUntil, toolResults } from '../support/release-tree.ts'
import { inWorkspace, recordingModel, write } from './support.ts'

const DESCRIPTION = 'Tidies meeting notes into decisions and actions; keeps {{names}} as written.'

const SKILL_MD = `---
name: tidy-notes
description: ${DESCRIPTION}
---
Read the notes, then list the decisions and the actions.
`

const AGENT_MD = `---
name: notetaker
summary: Takes notes. MARK-NOTETAKER-SUMMARY
references:
  - { category: tool, name: Skills, resident: true }
  - { category: skill, name: tidy-notes, resident: true }
  - { category: skill, name: never-published, resident: true }
---
You take notes. MARK-NOTETAKER
`

const SEGMENT = [
  '## Skills kept at hand',
  'Each line is a skill: its name, then what it is for. Read one with Skills read before you use it.',
  `- tidy-notes: ${DESCRIPTION}`,
].join('\n')

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

describe('a definition that keeps a published Skill resident, on the release tree', () => {
  it(
    'puts the name and the description of the Skill in the system prompt after the definition, the same bytes in every request after a new version and after the Skill is switched off; a Skill the tenant does not hold is left out and the session opens',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const model = recordingModel()
      await inWorkspace(
        async (ask, tree) => {
          const made = await ask(
            [
              write('work/tidy-notes/SKILL.md', SKILL_MD),
              write('work/notetaker/AGENT.md', AGENT_MD),
            ],
            [publish('op-1', 'skill', 'tidy-notes')],
            [publish('op-2', 'AgentDefinition', 'notetaker')],
          )
          expect(made.match(/done OmneExtensions publish/gu)).toHaveLength(2)

          const created = await cliOk(tree, ['create-session', '--definition', 'notetaker'])
          expect(created.outcome).toBe('succeeded')
          const session = String(created.body['session'])
          const runs = (wanted: number) =>
            pollUntil(
              `run ${String(wanted)} of the notetaker session to end`,
              () => historyOf(tree, session),
              seen => seen.filter(entry => entry.kind === 'run.terminal').length >= wanted,
            )
          const before = model.systems.length
          const read = plan([
            direct('Skills', { command: 'read', params: { skill: 'tidy-notes' } }),
          ])
          const say = (text: string) =>
            cliOk(tree, ['send-input', '--session', session, '--text', text])
          await say(read)
          const first = toolResults(await runs(1))
          expect(first.join('\n')).toContain('Read the notes, then list the decisions')
          await say('and these')
          await runs(2)

          // A new version of the Skill: the session keeps the line it adopted.
          const republished = await ask(
            [
              files('write', {
                path: 'work/tidy-notes/SKILL.md',
                text: SKILL_MD.replace(DESCRIPTION, 'A newer description. MARK-NEWER'),
                mode: 'replace',
              }),
            ],
            [publish('op-3', 'skill', 'tidy-notes')],
          )
          expect(republished).toContain('done OmneExtensions publish')
          await say('after the new version')
          await runs(3)

          // Switched off: reading it says so at once, and the prompt does not change.
          const off = await ask([
            extensions('disable', { id: 'op-4', category: 'skill', name: 'tidy-notes' }),
          ])
          expect(off).toContain('done OmneExtensions disable')
          await say(read)
          const fourth = toolResults(await runs(4))
            .slice(first.length)
            .join('\n')
          expect(fourth).toMatch(/ERROR: disabled/u)

          const own = model.bodies
            .slice(before)
            .map(systemTextOf)
            .filter(system => system.includes('MARK-NOTETAKER'))
          expect(own.length).toBeGreaterThanOrEqual(4)
          expect(own.some(system => system.includes('MARK-NEWER'))).toBe(false)
          for (const system of own) {
            expect(system.indexOf(SEGMENT), system).toBeGreaterThan(
              system.indexOf('MARK-NOTETAKER'),
            )
            expect(system).not.toContain('never-published')
          }
          expect(new Set(own).size).toBe(1)
        },
        { script: model.script },
      )
    },
  )
})
