// @module-tag slow
// Starts the release tree: an agent publishes a tool and, in the same run, finds it with Tools and calls it.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { heldKeyNow, isHeldNow } from '../../src/rows/tool-host/held-now.ts'
import { fixtureTenant } from '../entry/support.ts'
import { cliOk, extensions, follow, planner, tools } from '../support/planned-model.ts'
import { COUNT_PY, inWorkspace, otherTenant, recordingModel, WORDCOUNT, write } from './support.ts'

const search = (query: string) => tools('search', { query, after: null, limit: 10 })
const count = (text: string) =>
  tools('execute', { name: 'wordcount', command: null, arguments: { text } })

/** The tools the coding definition of the release keeps resident: what a coding session declares, no more. */
const CODING_RESIDENTS = (
  JSON.parse(
    readFileSync(new URL('../../config/serve.distribution.json', import.meta.url), 'utf8'),
  ) as {
    rows: {
      id: string
      config?: {
        mappings?: {
          definition: { name: string; references: { capability: { name: string } }[] }
        }[]
      }
    }[]
  }
).rows
  .find(row => row.id === 'agent-adoptions')
  ?.config?.mappings?.find(mapping => mapping.definition.name === 'coding')
  ?.definition.references.map(reference => reference.capability.name)
  .toSorted()

const toolNamesOf = (body: string): string[] =>
  ((JSON.parse(body) as { tools?: { function?: { name?: string } }[] }).tools ?? []).map(
    tool => tool.function?.name ?? '',
  )

describe('a tool a tenant published, used in the run that published it, on the release tree', () => {
  it(
    'is found and executed with Tools at once, without entering the tools of the run; another tenant does not find it',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const model = recordingModel()
      await inWorkspace(
        async (ask, tree) => {
          const said = await ask(
            [
              write('work/wordcount/tool.json', JSON.stringify(WORDCOUNT)),
              write('work/wordcount/count.py', COUNT_PY),
            ],
            [
              extensions('publish', {
                id: 'op-1',
                category: 'tool',
                name: 'wordcount',
                dir: 'work/wordcount',
              }),
            ],
            [search('count words')],
            [tools('inspect', { name: 'wordcount', command: null })],
            [count('one two three four')],
            [follow],
            [follow],
          )
          expect(said).toContain('done OmneExtensions publish')
          expect(said).toContain('wordcount')
          expect(said).toContain('Count the words of a text. Returns the number.')
          expect(said).toMatch(/^4$/mu)

          // What the run offers the model directly did not change when the tool was published.
          const offered = model.bodies.map(body => toolNamesOf(body).join(','))
          expect(new Set(offered).size).toBe(1)
          expect(offered[0]).not.toContain('wordcount')
          expect(toolNamesOf(model.bodies[0] ?? '{}').toSorted()).toEqual(CODING_RESIDENTS)

          // What may start: the version this tenant holds now, for this tenant, also as a record gives it back.
          const { tenant } = tree.registrar()
          const key = heldKeyNow(tree.scope, tenant, 'wordcount')
          if (key === null) throw new Error('the tenant holds no wordcount')
          const stale = { ...key.asset.adoption, digest: `sha256:${'0'.repeat(64)}` }
          expect(isHeldNow(tree.scope, tenant, key)).toBe(true)
          expect(isHeldNow(tree.scope, tenant, JSON.parse(JSON.stringify(key)) as typeof key)).toBe(
            true,
          )
          expect(
            isHeldNow(tree.scope, tenant, { ...key, asset: { ...key.asset, adoption: stale } }),
          ).toBe(false)
          expect(isHeldNow(tree.scope, fixtureTenant('b'), key)).toBe(false)
          expect(heldKeyNow(tree.scope, fixtureTenant('b'), 'wordcount')).toBeNull()

          // Another tenant neither finds it nor can execute it.
          const other = await otherTenant(tree)
          const made = await cliOk(other, ['create-session', '--definition', 'coding'])
          const theirs = await planner(other)(
            String(made.body['session']),
            [search('count words')],
            [count('one two')],
            [follow],
            [follow],
          )
          expect(theirs).not.toContain('Count the words of a text')
          expect(theirs).not.toMatch(/^2$/mu)
        },
        { script: model.script },
      )
    },
  )
})
