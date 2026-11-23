// @module-tag slow
// Starts the release tree: two tenants publish under the same names, and one of them loses sight of what it holds.
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tenantAssetsKey } from '../../src/rows/tenant-assets/service.ts'
import {
  agents,
  cliOk,
  extensions,
  follow,
  planner,
  tools,
  type PlannedCall,
} from '../support/planned-model.ts'
import { history } from '../support/release-tree.ts'
import { COUNT_PY, inWorkspace, otherTenant, WORDCOUNT, write } from './support.ts'

const agent = (mark: string) => `---
name: reviewer
summary: Reviews what it is given. ${mark}
---
You review. ${mark}
`
/** The same tool under the same name, told apart by what it prints before the count. */
const script = (mark: string) =>
  `import json, sys\nprint("${mark}" + str(len(json.load(sys.stdin)["text"].split())))\n`
const made = (mark: string, count: string): PlannedCall[] => [
  write('work/wordcount/tool.json', JSON.stringify(WORDCOUNT)),
  write('work/wordcount/count.py', count),
  write('work/reviewer/AGENT.md', agent(mark)),
]
const publish = (id: string, category: string, name: string) =>
  extensions('publish', { id, category, name, dir: `work/${name}` })
const published = [
  publish('op-1', 'tool', 'wordcount'),
  publish('op-2', 'AgentDefinition', 'reviewer'),
]
const search = tools('search', { query: 'count words', after: null, limit: 10 })
const count = tools('execute', {
  name: 'wordcount',
  command: null,
  arguments: { text: 'one two three' },
})
const used = [[search, agents('targets', {})], [count], [follow], [follow]]

describe('two tenants that publish a tool and a definition under the same names, on the release tree', () => {
  it(
    'each use their own, and neither sees the other one',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      await inWorkspace(async (ask, tree) => {
        const mine = await ask(made('MARK-ALPHA', COUNT_PY), published, ...used)
        expect(mine.match(/done OmneExtensions publish/gu)).toHaveLength(2)
        expect(mine).toMatch(/^3$/mu)
        expect(mine).toContain('MARK-ALPHA')

        const other = await otherTenant(tree)
        const project = realpathSync(mkdtempSync(join(tmpdir(), 'self-extension-other-')))
        const { workspace, instance } = (await cliOk(other, ['workspace', 'register', project]))
          .body
        const at = ['--workspace', String(workspace), '--instance', String(instance)]
        const session = (await cliOk(other, ['create-session', '--definition', 'coding', ...at]))
          .body
        const theirs = await planner(other)(
          String(session['session']),
          made('MARK-BETA', script('BETA-')),
          published,
          ...used,
        )
        expect(theirs.match(/done OmneExtensions publish/gu)).toHaveLength(2)
        expect(theirs).toMatch(/^BETA-3$/mu)
        expect(theirs).toContain('MARK-BETA')
        expect(theirs).not.toContain('MARK-ALPHA')
        expect(theirs).not.toMatch(/^3$/mu)

        // The first tenant still has its own, after the other one published under the same names.
        const again = await ask(...used)
        expect(again).toMatch(/^3$/mu)
        expect(again).toContain('MARK-ALPHA')
        expect(again).not.toContain('MARK-BETA')
        expect(again).not.toContain('BETA-3')
      })
    },
  )

  it(
    'does not answer that there is none while what a tenant holds cannot be read: the turn waits, and a creation is told the basis cannot be read',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      await inWorkspace(async (ask, tree, _project, session) => {
        const mine = await ask(made('MARK-ALPHA', COUNT_PY), published)
        expect(mine.match(/done OmneExtensions publish/gu)).toHaveLength(2)
        const ended = async () =>
          (await history(tree.port, tree.home, session)).filter(
            entry => entry.kind === 'run.terminal',
          ).length
        const before = await ended()

        // The assets of every tenant stop answering: held or not is no longer known.
        const assets = tree.scope.get(tenantAssetsKey)
        if (assets === undefined) throw new Error('the tree has no tenant assets')
        const { open, standing } = assets
        Object.assign(assets, { open: async () => undefined, standing: async () => 'unknown' })
        let waited: Promise<string>
        try {
          const created = await tree.cli(['create-session', '--definition', 'reviewer'])
          expect(created.status).not.toBe(0)
          expect(created.stdout).toContain('"outcome":"basis-unavailable"')
          expect(created.stdout).not.toContain('"outcome":"invalid"')

          // A turn that needs the catalog does not go on with a catalog that lacks what cannot be read.
          waited = ask(...used)
          await new Promise(resolve => setTimeout(resolve, 8000))
          expect(await ended()).toBe(before)
        } finally {
          Object.assign(assets, { open, standing })
        }
        // Read again, it is there: the turn goes on, finds the tool and the definition, and calls the tool.
        const found = await waited
        expect(found).toContain('Count the words of a text')
        expect(found).toContain('MARK-ALPHA')
        expect(found).toMatch(/^3$/mu)
        expect(found).not.toContain('"tools":[]')
      })
    },
  )
})
