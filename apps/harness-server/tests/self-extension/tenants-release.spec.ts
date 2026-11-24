// @module-tag slow
// Starts the release tree: two tenants publish under the same names, and one of them loses sight of what it holds.
import { existsSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ExtensionSources } from '@omne-harness/loop-extension-contract'
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
    'does not answer that there is none while what a tenant holds cannot be read: the tools do not hold the turn up, a tool of the release runs, and each asking is told the basis cannot be read',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      await inWorkspace(async (ask, tree, project) => {
        // The loop extensions the tenant enabled stay readable: a turn waits while they cannot be read, whatever its tools are.
        const extensionSources = tree.scope.get('loopExtensionSources') as ExtensionSources<unknown>
        const present = extensionSources.of.bind(extensionSources)
        let seen: Awaited<ReturnType<typeof present>>
        extensionSources.of = async access => (seen = (await present(access)) ?? seen)
        const mine = await ask(made('MARK-ALPHA', COUNT_PY), published)
        expect(mine.match(/done OmneExtensions publish/gu)).toHaveLength(2)

        // The assets of every tenant stop answering: held or not is no longer known.
        const assets = tree.scope.get(tenantAssetsKey)
        if (assets === undefined) throw new Error('the tree has no tenant assets')
        const { open, standing } = assets
        Object.assign(assets, { open: async () => undefined, standing: async () => 'unknown' })
        try {
          const created = await tree.cli(['create-session', '--definition', 'reviewer'])
          expect(created.status).not.toBe(0)
          expect(created.stdout).toContain('"outcome":"basis-unavailable"')
          expect(created.stdout).not.toContain('"outcome":"invalid"')

          // This session has residents of the release alone: its turn is not held up, and a tool of the release runs.
          const during = await ask(
            [write('work/still-works.txt', 'yes'), search, agents('targets', {})],
            [count],
          )
          expect(existsSync(join(project, 'work/still-works.txt'))).toBe(true)
          expect(during).toContain('the agent definitions cannot be read now')
          expect(during).not.toContain('"tools":[')
          expect(during).not.toContain('unknown-target')
          expect(during).not.toContain('MARK-ALPHA')
          expect(during).not.toMatch(/^3$/mu)
          expect(during.match(/^ERROR: unavailable$/gmu)).toHaveLength(2)
        } finally {
          Object.assign(assets, { open, standing })
        }
        // Read again, it is there: the next turn finds the tool and the definition, and calls the tool.
        const found = await ask(...used)
        expect(found).toContain('Count the words of a text')
        expect(found).toContain('MARK-ALPHA')
        expect(found).toMatch(/^3$/mu)
        expect(found).not.toContain('"tools":[]')
      })
    },
  )
})
