// @module-tag slow
// Starts the release tree: what OmneExtensions tells of a tool and of an Agent definition, before and after publishing.
import { describe, expect, it } from 'vitest'
import { extensions } from '../support/planned-model.ts'
import { COUNT_PY, inWorkspace, WORDCOUNT, write } from './support.ts'

const definition = (name: string, tool: string) => `---
name: ${name}
summary: Counts the words of what it is given.
references:
  - { category: tool, name: Files, resident: true }
  - { category: tool, name: ${tool}, resident: true }
  - { category: skill, name: tidy-notes }
---
You count words.
`
const NO_RUN = { name: 'broken', summary: 'Has no run.', parameters: WORDCOUNT.parameters }
const impact = (category: string, name: string) =>
  extensions('impact', { category, dir: `work/${name}` })
const publish = (id: string, category: string, name: string) =>
  extensions('publish', { id, category, name, dir: `work/${name}` })
const show = (category: string, name: string) => extensions('show', { category, name })

describe('what is told of a tool and of a definition, on the release tree', () => {
  it(
    'says before publishing what would be refused or would not work, and after it whether each can be used now',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      await inWorkspace(async ask => {
        const before = await ask(
          [
            write('work/wordcount/tool.json', JSON.stringify(WORDCOUNT)),
            write('work/wordcount/count.py', COUNT_PY),
            write('work/broken/tool.json', JSON.stringify(NO_RUN)),
            write('work/Files/tool.json', JSON.stringify({ ...WORDCOUNT, name: 'Files' })),
            write('work/Files/count.py', COUNT_PY),
            write('work/counter/AGENT.md', definition('counter', 'wordcount')),
            write('work/coding/AGENT.md', definition('coding', 'wordcount')),
            write('work/boss/AGENT.md', '---\nname: boss\nsummary: s\ntype: master\n---\nx\n'),
          ],
          [
            impact('tool', 'wordcount'),
            impact('tool', 'broken'),
            impact('tool', 'Files'),
            impact('AgentDefinition', 'counter'),
            impact('AgentDefinition', 'coding'),
            impact('AgentDefinition', 'boss'),
          ],
        )
        const told = before.split('done OmneExtensions impact').slice(1)
        expect(told).toHaveLength(6)
        const [tool, broken, files, counter, coding, boss] = told as [string, ...string[]]
        expect(tool).toContain(
          '+ tool.tools / wordcount   → held; Tools of this tenant finds it and calls it from now',
        )
        expect(tool).toContain('A call of it asks a person unless the session lets it through.')
        expect(broken).toContain('! tool.tools / broken   → would be refused: tool.json: ')
        expect(files).toContain('→ would be refused: the deployment holds a tool named Files')
        // The tool it keeps resident is not published yet: that is said, with what does nothing.
        expect(counter).toContain('+ agent.definitions / counter   → held; work can be handed')
        expect(counter).toContain(
          '! wordcount: tool.tools / wordcount   → its resident tool wordcount is not there now',
        )
        expect(counter).not.toContain('Files   →')
        expect(counter).toContain('Kept and without effect yet: skill/tidy-notes.')
        expect(coding).toContain(
          '→ would be held and not in effect: the definition coding of the deployment stands and cannot be replaced',
        )
        expect(boss).toContain('→ would be refused: AGENT.md: type is master')

        const after = await ask(
          [publish('op-1', 'AgentDefinition', 'counter')],
          [show('AgentDefinition', 'counter')],
          [publish('op-2', 'tool', 'wordcount')],
          [show('tool', 'wordcount'), show('AgentDefinition', 'counter'), show('tool', 'Files')],
        )
        const shown = after.split('done OmneExtensions show').slice(1)
        expect(shown).toHaveLength(4)
        const [early, held, late, deployed] = shown as [string, ...string[]]
        expect(early).toContain(
          'agent.definitions / counter   [not in effect]   a session with it cannot start now: a resident tool is not there',
        )
        expect(early).toMatch(/tool\.tools \/ wordcount +\[not in effect\] +its resident tool/u)
        expect(held).toMatch(
          /tool\.tools \/ wordcount +\[selected\] +Tools of this tenant calls it now/u,
        )
        expect(late).toMatch(
          /agent\.definitions \/ counter +\[selected\] +work can be handed to it now, and a session made with it/u,
        )
        expect(late).toMatch(
          /tool\.tools \/ Files +\[in effect\] +a tool this definition keeps resident/u,
        )
        expect(late).toMatch(/tool\.tools \/ wordcount +\[in effect\]/u)
        expect(late).toContain('Kept and without effect yet: skill/tidy-notes.')
        expect(deployed).toMatch(
          /tool\.tools \/ Files +\[selected\] +installed with the deployment/u,
        )
      })
    },
  )
})
