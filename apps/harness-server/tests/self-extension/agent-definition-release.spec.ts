// @module-tag slow
// Starts the release tree: an agent writes an Agent definition in its workspace and publishes it.
import { describe, expect, it } from 'vitest'
import { extensions } from '../support/planned-model.ts'
import { inWorkspace, points, write } from './support.ts'

const AGENT_MD = `---
name: reviewer
summary: Reviews one file and reports what it found.
---
You review code. Read the file you are given and report the problems you find.
`

describe('an Agent definition an agent wrote, on the release tree', () => {
  it(
    'an agent publishes an Agent definition it wrote as a directory with AGENT.md',
    { tags: ['slow'], timeout: 240_000 },
    () =>
      inWorkspace(async ask => {
        const said = await ask(
          [write('work/reviewer/AGENT.md', AGENT_MD)],
          [
            extensions('publish', {
              id: 'op-agent-1',
              category: 'AgentDefinition',
              name: 'reviewer',
              dir: 'work/reviewer',
            }),
          ],
          [extensions('show', { category: 'AgentDefinition', name: 'reviewer' })],
        )
        expect(said).toContain('done OmneExtensions publish')
        expect(said).toMatch(/AgentDefinition reviewer\s+sha256:[0-9a-f]{64}\s+enabled/u)
        const placed = await ask([points('show', { name: 'agent.definitions' })])
        expect(placed).toMatch(/reviewer\s+tenant-assets#1 this tenant/u)

        // What help gives to copy is published as it stands.
        const helped = await ask([
          extensions('help', { name: 'publish', category: 'AgentDefinition' }),
        ])
        const lines = helped.split('\n').map(line => line.trimEnd())
        const opening = lines.indexOf('---')
        const closing = lines.indexOf('---', opening + 1)
        expect(closing).toBeGreaterThan(opening)
        const example = `${lines.slice(opening, closing + 2).join('\n')}\n`
        const name = /^name: (.+)$/mu.exec(example)?.[1] ?? ''
        expect(name).not.toBe('')
        const copied = await ask(
          [write(`work/copied/${name}/AGENT.md`, example)],
          [
            extensions('publish', {
              id: 'op-agent-2',
              category: 'AgentDefinition',
              name,
              dir: `work/copied/${name}`,
            }),
          ],
        )
        expect(copied).toContain('done OmneExtensions publish')

        const master = await ask(
          [
            write(
              'work/lead/AGENT.md',
              AGENT_MD.replace('name: reviewer', 'name: lead\ntype: master'),
            ),
          ],
          [
            extensions('impact', { category: 'AgentDefinition', dir: 'work/lead' }),
            extensions('publish', {
              id: 'op-agent-3',
              category: 'AgentDefinition',
              name: 'lead',
              dir: 'work/lead',
            }),
          ],
          [extensions('list', { category: 'AgentDefinition' })],
        )
        expect(master).toContain(
          'AGENT.md: type is master; a definition made here is non-master: leave type out. For how',
        )
        expect(master).not.toMatch(/AgentDefinition lead\s+sha256/u)
      }),
  )
})
