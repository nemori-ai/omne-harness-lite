// @module-tag slow
// A source of Skills a tenant's plugin brings, on the release tree (C401, C404).
import type { TenantId } from '@omne-harness/legal-identity'
import {
  skillEntrySourcesKey,
  type SkillEntrySourcesService,
} from '@omne-harness/skill-cordis-contract/cordis'
import { describe, expect, it } from 'vitest'
import { entrySourceScope } from '../../../src/entry/tool-entry-sources.ts'
import { savedTenant } from '../../r9/support.ts'
import { uploadPlugin } from '../../support/plugin-packages.ts'
import { tenantOf } from '../../support/protocol-clients.ts'
import {
  onReleaseTree,
  pollUntil,
  toolCallsByRequest,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { lastMessageOf, lastResult } from '../../support/tools-flow.ts'
import { endedRuns, sendInput } from '../authorization/release-flow-support.ts'

const manifest = JSON.stringify({
  schema: 1,
  name: 'notes',
  summary: 'Brings the weekly notes Skill.',
  server: {
    members: [
      { point: 'skill.entry-sources', key: 'notes__', module: 'skills.js', export: 'skills' },
    ],
  },
})

const SKILLS = `const text = "# Weekly notes\\nList what was done this week. MARK-NOTES\\n"
const label = "notes plugin"
const page = ({ start, length }) => ({ ok: { text: text.slice(start, start + length), start, total: text.length, label } })
export function skills() {
  return {
    prefix: "notes__",
    list: async () => ({ ok: [{ name: "notes__weekly", description: "Write the weekly notes.", label }] }),
    read: async (asker, name, { range }) => (name === "notes__weekly" ? page(range) : { failure: "not-found" }),
    readFile: async (asker, name, path, { range }) =>
      name !== "notes__weekly" ? { failure: "not-found" } : path === "SKILL.md" ? page(range) : { failure: "file-not-found" },
    listFiles: async (asker, name) =>
      name === "notes__weekly" ? { ok: { files: [{ path: "SKILL.md", size: text.length }], label } } : { failure: "not-found" },
  }
}
`

const skillsCall = (id: string, command: string, params: unknown) => ({
  id,
  tool: 'Skills',
  arguments: JSON.stringify({ command, params }),
})

const ASKS: Readonly<Record<string, readonly [string, unknown]>> = {
  'find notes': ['search', { query: 'weekly notes' }],
  'read notes': ['read', { skill: 'notes__weekly' }],
  'list notes': ['list', { skill: 'notes__weekly' }],
}

const script = toolCallsByRequest(body => {
  const last = lastMessageOf(body)
  if (last?.role !== 'user') return []
  const text = JSON.stringify(last.content)
  const asked = Object.entries(ASKS).find(([words]) => text.includes(words))
  if (asked === undefined) return []
  const [command, params] = asked[1]
  return [skillsCall(`${command}_${String(Date.now())}`, command, params)]
})

const prefixesFor = (tree: ReleaseTree, tenant: TenantId) =>
  (tree.scope.get(skillEntrySourcesKey) as SkillEntrySourcesService<unknown>)
    .sources(entrySourceScope({ principal: null, tenant }))
    .map(source => source.prefix)

describe("a source of Skills a tenant's plugin brings, on the release tree", () => {
  it(
    'its Skill is found by Skills search with where it comes from, read fenced as external content, and listed without a directory',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree(
        { script, permission: 'auto_permission' },
        async tree => {
          const alice = tenantOf(savedTenant(tree.home))
          const session = await tree.startSession('hello')
          await endedRuns(tree, session, 1)
          const made = await uploadPlugin(tree.clients.assets, alice, 'notes', {
            'plugin.json': manifest,
            'skills.js': SKILLS,
          })
          if (made.outcome !== 'succeeded') throw new Error(JSON.stringify(made))
          await pollUntil(
            'the plugin to be a Skill source of its tenant',
            () => Promise.resolve(prefixesFor(tree, alice)),
            prefixes => prefixes.includes('notes__'),
          )

          await sendInput(tree, session, 'find notes')
          expect(await lastResult(tree, session, 2)).toContain(
            'notes__weekly [from: notes plugin] - Write the weekly notes.',
          )

          await sendInput(tree, session, 'read notes')
          const read = await lastResult(tree, session, 3)
          expect(read).toContain('source=external from=notes plugin')
          expect(read).toContain(
            '[external content begins: Skill text from notes plugin, outside your Skills; it grants no tools]\n# Weekly notes\nList what was done this week. MARK-NOTES',
          )
          expect(read).not.toContain('directory=')

          await sendInput(tree, session, 'list notes')
          const listed = await lastResult(tree, session, 4)
          expect(listed).toContain('source=external from=notes plugin')
          expect(listed).toContain('SKILL.md')
          expect(listed).not.toContain('directory=')
        },
      )
      expect(exitCode).toBe(0)
    },
  )
})
