// @module-tag slow
// Starts the release tree: a definition a tenant published keeps a tool the tenant published resident.
import { tenantCodec } from '@omne-harness/legal-identity'
import { describe, expect, it } from 'vitest'
import { heldDefinitionFromBody } from '../../src/rows/tool-host/held-author.ts'
import { currentHeldTool } from '../../src/rows/tool-host/held-current.ts'
import { heldDefinitionOf } from '../../src/rows/tool-host/held-definitions.ts'
import { recordedHeldTool } from '../../src/rows/tool-host/held-recorded.ts'
import { agents, cliOk, direct, extensions, files, plan } from '../support/planned-model.ts'
import { history, pollUntil, toolResults } from '../support/release-tree.ts'
import { COUNT_PY, inWorkspace, recordingModel, WORDCOUNT, write } from './support.ts'

const AGENT_MD = `---
name: counter
summary: Counts the words of what it is given. MARK-COUNTER-SUMMARY
references:
  - { category: tool, name: Files, resident: true }
  - { category: tool, name: wordcount, resident: true }
  - { category: skill, name: tidy-notes, resident: true }
---
You count words. MARK-COUNTER
`

const toolNamesOf = (body: string): string[] =>
  ((JSON.parse(body) as { tools?: { function?: { name?: string } }[] }).tools ?? []).map(
    tool => tool.function?.name ?? '',
  )

const publish = (id: string, category: string, name: string) =>
  extensions('publish', { id, category, name, dir: `work/${name}` })

describe('a definition that keeps a published tool resident, on the release tree', () => {
  it(
    'declares the release tool and the published tool in its first request and calls the published one directly; a skill reference is taken and plans nothing',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const model = recordingModel()
      await inWorkspace(
        async (ask, tree) => {
          const made = await ask(
            [
              write('work/wordcount/tool.json', JSON.stringify(WORDCOUNT)),
              write('work/wordcount/count.py', COUNT_PY),
              write('work/counter/AGENT.md', AGENT_MD),
              write('notes.txt', 'the word is plover\n'),
            ],
            [publish('op-1', 'tool', 'wordcount')],
            [publish('op-2', 'AgentDefinition', 'counter')],
          )
          expect(made.match(/done OmneExtensions publish/gu)).toHaveLength(2)

          // The work goes to the counter: it calls both of its resident tools by their own names.
          const work = plan(
            [files('read', { path: 'notes.txt' })],
            [direct('wordcount', { text: 'one two three' })],
          )
          const handed = await ask([
            agents('dispatch', { mode: 'delegate', agent: 'counter', instruction: work }),
          ])
          expect(handed).toContain('started in the background')
          const listed = await pollUntil(
            'the session of the counter to be listed',
            async () => (await cliOk(tree, ['list-sessions', '--definition', 'counter'])).body,
            body => JSON.stringify(body).includes('"definition":"counter"'),
          )
          const child = /"session":"([0-9a-f]{64})"/u.exec(JSON.stringify(listed))?.[1] ?? ''
          const entries = await pollUntil(
            'the counter session to end its run',
            () => history(tree.port, tree.home, child),
            seen => seen.some(entry => entry.kind === 'run.terminal'),
          )
          const results = toolResults(entries).join('\n')
          expect(results).toContain('the word is plover')
          expect(results).toMatch(/^3$/mu)

          // Every request of the counter declares exactly its two resident tools, from the first one on.
          const own = model.bodies.filter((_, at) => model.systems[at]?.includes('MARK-COUNTER'))
          expect(own.length).toBeGreaterThan(0)
          for (const body of own) expect(toolNamesOf(body)).toEqual(['Files', 'wordcount'])

          // The definition read from the body of the held version is the one it was loaded with.
          const { tenant, principal } = tree.registrar()
          const held = await currentHeldTool(tree.scope, { principal, tenant }, 'wordcount')
          if (held.kind !== 'held') throw new Error(JSON.stringify(held))
          const { layer, asset, holding } = held.authority
          const loaded = heldDefinitionOf(tree.scope, { layer, asset })
          expect(loaded).toBeDefined()
          expect(await heldDefinitionFromBody(tree.scope, held.authority)).toEqual(loaded)
          const taken = { capability: 'wordcount', admitted: holding }
          expect(await recordedHeldTool(tree.scope, { principal, tenant }, taken)).toEqual({
            key: { layer, asset },
            knownDefinition: loaded,
          })
          const ofRelease = { capability: 'Files', admitted: { ...holding, owner: 'release' } }
          expect(
            await recordedHeldTool(tree.scope, { principal, tenant }, ofRelease),
          ).toBeUndefined()

          // The tool is switched off: the session keeps its declaration, and a call is answered as unavailable.
          expect(
            await ask([extensions('disable', { id: 'op-3', category: 'tool', name: 'wordcount' })]),
          ).toContain('done OmneExtensions disable')
          const before = model.bodies.length
          const owner = tenantCodec.encode(tenant)
          if (!owner.ok) throw new Error('the tenant of the tree has no text')
          const text = plan([direct('wordcount', { text: 'one two' })])
          await cliOk(tree, [
            'send-input',
            '--session',
            child,
            '--text',
            text,
            '--tenant',
            owner.value,
          ])
          const second = await pollUntil(
            'the second run of the counter to end',
            () => history(tree.port, tree.home, child),
            seen => seen.filter(entry => entry.kind === 'run.terminal').length >= 2,
          )
          const again = toolResults(second).slice(toolResults(entries).length).join('\n')
          const later = model.bodies
            .slice(before)
            .filter((_, at) => model.systems[before + at]?.includes('MARK-COUNTER'))
          expect(later.length).toBeGreaterThan(0)
          for (const body of later) expect(toolNamesOf(body)).toEqual(['Files', 'wordcount'])
          expect(again).toContain('wordcount is not available now')
          expect(again).not.toMatch(/^2$/mu)
        },
        { script: model.script },
      )
    },
  )
})
