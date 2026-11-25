// @module-tag slow
// Starts the release tree: what a Skill search finds follows what the tenant holds at once, and stays with its tenant.
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cliOk, direct, extensions, planner } from '../support/planned-model.ts'
import { inWorkspace, otherTenant, write, type Ask } from './support.ts'

const skill = (name: string, mark: string) => `---
name: ${name}
description: Tidies meeting notes into decisions. ${mark}
---
Read the notes, then list the decisions. ${mark}
`
const publish = (id: string, name: string) =>
  extensions('publish', { id, category: 'skill', name, dir: `work/${name}` })
const skills = (command: string, params: Record<string, unknown>) =>
  direct('Skills', { command, params })
const search = skills('search', { query: 'meeting notes' })
const read = (name: string) => skills('read', { skill: name })

describe('a Skill search on the release tree', () => {
  it(
    'in a session that found a Skill, gives it as disabled and then not at all on the next search, as soon as the person changes it',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      await inWorkspace(async (ask, tree) => {
        const found = await ask(
          [write('work/tidy-notes/SKILL.md', skill('tidy-notes', 'MARK-TIDY'))],
          [publish('op-1', 'tidy-notes')],
          [search],
        )
        expect(found).toContain('done OmneExtensions publish')
        expect(found).toContain('1. tidy-notes - Tidies meeting notes into decisions. MARK-TIDY')

        const off = await cliOk(tree, ['asset', 'disable', 'skill:tidy-notes'])
        expect(off.outcome).toBe('succeeded')
        const disabled = await ask([search], [read('tidy-notes')])
        expect(disabled).toMatch(/1\. tidy-notes \[disabled: [^\]]+\]/u)
        expect(disabled).toContain('ERROR: disabled')

        const removed = await cliOk(tree, ['asset', 'remove', 'skill:tidy-notes', '--yes'])
        expect(removed.outcome).toBe('succeeded')
        const gone = await ask([search], [read('tidy-notes')])
        expect(gone).toContain('no Skill matches')
        expect(gone).toContain('ERROR: not-found')
      })
    },
  )

  it(
    'of two tenants that each publish a Skill under the same name, finds and reads only the Skill of its own tenant',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      await inWorkspace(async (ask, tree) => {
        const mine = await ask(
          [
            write('work/shared-notes/SKILL.md', skill('shared-notes', 'MARK-ALPHA')),
            write('work/alpha-notes/SKILL.md', skill('alpha-notes', 'MARK-ALPHA-ONLY')),
          ],
          [publish('op-1', 'shared-notes'), publish('op-2', 'alpha-notes')],
        )
        expect(mine.match(/done OmneExtensions publish/gu)).toHaveLength(2)

        const other = await otherTenant(tree)
        const project = realpathSync(mkdtempSync(join(tmpdir(), 'skill-catalog-other-')))
        const { workspace, instance } = (await cliOk(other, ['workspace', 'register', project]))
          .body
        const at = ['--workspace', String(workspace), '--instance', String(instance)]
        const created = await cliOk(other, ['create-session', '--definition', 'coding', ...at])
        const send = planner(other)
        const theirs: Ask = (...steps) =>
          send(String(created.body['session']), ...steps)
        const published = await theirs(
          [write('work/shared-notes/SKILL.md', skill('shared-notes', 'MARK-BETA'))],
          [publish('op-1', 'shared-notes')],
        )
        expect(published).toContain('done OmneExtensions publish')

        const seen = await theirs([search], [read('shared-notes')], [read('alpha-notes')])
        expect(seen).toContain('1. shared-notes - Tidies meeting notes into decisions. MARK-BETA')
        expect(seen).toContain('Read the notes, then list the decisions. MARK-BETA')
        expect(seen).not.toContain('MARK-ALPHA')
        expect(seen).toContain('ERROR: not-found')

        const again = await ask([search], [read('shared-notes')])
        expect(again).toContain('Read the notes, then list the decisions. MARK-ALPHA')
        expect(again).toContain('alpha-notes')
        expect(again).not.toContain('MARK-BETA')
      })
    },
  )
})
