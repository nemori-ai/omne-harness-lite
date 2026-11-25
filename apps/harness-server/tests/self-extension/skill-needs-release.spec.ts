// @module-tag slow
// Starts the release tree: an agent publishes a Skill whose .omne/skill.json names a tool this session does not have.
import { describe, expect, it } from 'vitest'
import { direct, extensions } from '../support/planned-model.ts'
import { inWorkspace, write } from './support.ts'

const SKILL_MD = `---
name: browse-notes
description: Reads meeting notes from a web page. MARK-BROWSE-NOTES
---
Open the page with Browser, then list the decisions.
`

const DECLARATION = JSON.stringify({
  formatVersion: 1,
  dependencies: [
    { category: 'tool', name: 'Browser' },
    { category: 'tool', name: 'Files' },
  ],
})

const skills = (name: string, params: Record<string, unknown>) =>
  direct('Skills', { command: name, params })

describe('a Skill that needs a tool this session does not have, on the release tree', () => {
  it(
    'keeps the declaration an agent wrote under .omne, and names the missing tool in search and read while it still gives the text',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      await inWorkspace(async ask => {
        const published = await ask(
          [
            write('work/browse-notes/SKILL.md', SKILL_MD),
            write('work/browse-notes/.omne/skill.json', DECLARATION),
          ],
          [
            extensions('publish', {
              id: 'op-1',
              category: 'skill',
              name: 'browse-notes',
              dir: 'work/browse-notes',
            }),
          ],
        )
        expect(published).toContain('done OmneExtensions publish')

        const found = await ask(
          [skills('search', { query: 'meeting notes web page' })],
          [skills('read', { skill: 'browse-notes' })],
        )
        // The needs come only from .omne/skill.json: naming Browser shows the declaration was published.
        expect(found).toContain(
          'browse-notes [needs: Browser] - Reads meeting notes from a web page. MARK-BROWSE-NOTES',
        )
        expect(found).toMatch(/\nsource=tenant version=\S+ missing-tools=Browser\n/u)
        expect(found).toContain('Open the page with Browser, then list the decisions.')
      })
    },
  )
})
