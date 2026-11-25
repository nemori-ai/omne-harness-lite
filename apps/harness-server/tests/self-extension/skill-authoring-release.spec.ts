// @module-tag slow
// Starts the release tree: in one coding session the agent reads the meta skill, writes a Skill, publishes it, finds it, reads it and runs its script.
import { describe, expect, it } from 'vitest'
import { direct, extensions } from '../support/planned-model.ts'
import { inWorkspace, recordingModel, write } from './support.ts'

const SKILL_MD = `---
name: count-words
description: Counts the words of a text file. Use when asked how long a text is. MARK-COUNT-WORDS
---
Run scripts/count.mjs with Shell, giving the file as its argument.
`
const SCRIPT = "console.log('MARK-COUNTED')\n"

const skills = (name: string, params: Record<string, unknown>) =>
  direct('Skills', { command: name, params })
const shell = (script: string) =>
  direct('Shell', { command: 'execute', intent: 'run the script of the Skill', params: { script } })

function skillsDeclaration(body: string): string {
  const { tools } = JSON.parse(body) as { tools?: { function: { name: string } }[] }
  return JSON.stringify(tools?.find(tool => tool.function.name === 'Skills'))
}

describe('the meta skill and a Skill an agent writes, in one coding session on the release tree', () => {
  it(
    'keeps skill-authoring resident from the first request; the agent reads it, writes and publishes a Skill, finds and reads it, and runs its script, with the same Skills declaration throughout',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const model = recordingModel()
      await inWorkspace(
        async (ask, tree) => {
          const guide = await ask(
            [skills('search', { query: '' })],
            [skills('read', { skill: 'skill-authoring' })],
          )
          expect(guide).toMatch(/^\d+\. skill-authoring - Write, try and publish a Skill/mu)
          expect(guide).toContain('done Skills read skill=skill-authoring')
          expect(guide).toMatch(/\nsource=official version=\S+\n/u)

          const made = await ask(
            [
              write('work/count-words/SKILL.md', SKILL_MD),
              write('work/count-words/scripts/count.mjs', SCRIPT),
            ],
            [extensions('impact', { category: 'skill', dir: 'work/count-words' })],
            [
              extensions('publish', {
                id: 'op-1',
                category: 'skill',
                name: 'count-words',
                dir: 'work/count-words',
              }),
            ],
            [skills('search', { query: 'how long is this text' })],
            [skills('read', { skill: 'count-words' })],
          )
          expect(made).toContain('done OmneExtensions publish')
          expect(made).toContain('count-words - Counts the words of a text file.')
          expect(made).toMatch(/\nsource=tenant version=\S+\n/u)
          const directory = /^directory=(.+)$/mu.exec(made)?.[1]
          expect(directory).toBeDefined()

          // The package lies outside the workspace: the tenant lets this session read there.
          const allowed = await tree.cli([
            'setting',
            'set',
            '--independent',
            'workspace/outside-files',
            'access',
            '--value',
            '"read"',
          ])
          expect(allowed.status).toBe(0)
          const ran = await ask([shell(`${process.execPath} ${directory}/scripts/count.mjs`)])
          expect(ran).toContain('MARK-COUNTED')
        },
        { script: model.script },
      )
      expect(model.systems[0]).toContain('- skill-authoring: ')
      expect(new Set(model.systems).size).toBe(1)
      expect(new Set(model.bodies.map(skillsDeclaration)).size).toBe(1)
    },
  )
})
