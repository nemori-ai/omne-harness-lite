// @module-tag slow
// Starts the release tree: whether an agent may publish a Skill follows the change gate of OmneExtensions.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { answerCard, pendingCard, setGate } from '../rows/authorization/release-flow-support.ts'
import { direct, extensions } from '../support/planned-model.ts'
import { inWorkspace } from './support.ts'

const EXTENSIONS = { kind: 'asset', category: 'tool', name: 'OmneExtensions' } as const
const skill = (name: string) =>
  `---\nname: ${name}\ndescription: Checks a step before it starts. MARK-${name}\n---\nRead the notes first.\n`
const publish = (id: string, name: string) =>
  extensions('publish', { id, category: 'skill', name, dir: `work/${name}` })
const search = direct('Skills', { command: 'search', params: { query: 'checks a step' } })

describe('an agent publishing a Skill under the change gate of OmneExtensions, on the release tree', () => {
  it(
    'asks the person when the gate asks and publishes once released; when the gate denies, publishes nothing',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      await inWorkspace(
        async (ask, tree, project, session) => {
          for (const name of ['release-checklist', 'deploy-checklist']) {
            mkdirSync(join(project, 'work', name), { recursive: true })
            writeFileSync(join(project, 'work', name, 'SKILL.md'), skill(name))
          }
          await setGate(tree, EXTENSIONS, 'change', 'ask', 'gate-ask')
          const asked = ask([publish('op-1', 'release-checklist')])
          const card = await pendingCard(tree, session, 'the publish')
          expect(card.question).toMatchObject({
            kind: 'release',
            target: { tool: 'OmneExtensions' },
            gateTitle: '改动',
          })
          await answerCard(tree, card, ['--option', 'allow-once'], 'reply-allow')
          expect(await asked).toContain('done OmneExtensions publish')

          await setGate(tree, EXTENSIONS, 'change', 'deny', 'gate-deny')
          const denied = await ask([publish('op-2', 'deploy-checklist')], [search])
          expect(denied).toContain(
            'The tool call was denied by a rule or a prohibition and did not run.',
          )
          expect(denied).not.toContain('done OmneExtensions publish')
          expect(denied).toContain('release-checklist - Checks a step before it starts.')
          expect(denied).not.toContain('MARK-deploy-checklist')
        },
        { permission: 'auto_permission' },
      )
    },
  )
})
