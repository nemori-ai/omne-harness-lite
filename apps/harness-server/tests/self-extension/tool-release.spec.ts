// @module-tag slow
// Starts the release tree: an agent writes a tool in its workspace and publishes it.
import { describe, expect, it } from 'vitest'
import { extensions } from '../support/planned-model.ts'
import { COUNT_PY, inWorkspace, points, WORDCOUNT, write } from './support.ts'

const publish = (id: string, name: string, dir: string) =>
  extensions('publish', { id, category: 'tool', name, dir })

describe('a tool an agent wrote, on the release tree', () => {
  it(
    'is published from a directory with tool.json and a script, as help says how; a tool that is not a script tool is refused with the reason',
    { tags: ['slow'], timeout: 240_000 },
    () =>
      inWorkspace(async ask => {
        const said = await ask(
          [
            write('work/wordcount/tool.json', JSON.stringify(WORDCOUNT)),
            write('work/wordcount/count.py', COUNT_PY),
          ],
          [publish('op-tool-1', 'wordcount', 'work/wordcount')],
          [extensions('show', { category: 'tool', name: 'wordcount' })],
        )
        expect(said).toContain('done OmneExtensions publish')
        expect(said).toMatch(/tool wordcount\s+sha256:[0-9a-f]{64}\s+enabled/u)
        const placed = await ask([points('show', { name: 'tool.tools' })])
        expect(placed).toMatch(/wordcount\s+tenant-assets#1 this tenant/u)
        // The tools of the release are held as before, each by the deployment and by this tenant.
        expect(placed).toMatch(/Files\s+governance#1 deployment\s+\[in effect\]/u)
        expect(placed.match(/governance#1 deployment/gu)).toHaveLength(18)

        // What help gives to copy is published as it stands.
        const helped = await ask([extensions('help', { name: 'publish', category: 'tool' })])
        const lines = helped.split('\n').map(line => line.trimEnd())
        const tool = lines.find(line => line.startsWith('{"name"')) ?? ''
        const script = lines.slice(lines.indexOf('and count.py beside it:') + 1).slice(0, 2)
        const name = (JSON.parse(tool) as { name: string }).name
        const copied = await ask(
          [
            write(`work/copied/${name}/tool.json`, tool),
            write(`work/copied/${name}/count.py`, `${script.join('\n')}\n`),
          ],
          [publish('op-tool-2', name, `work/copied/${name}`)],
        )
        expect(copied).toContain('done OmneExtensions publish')

        const refused = await ask(
          [
            write(
              'work/native/tool.json',
              JSON.stringify({ ...WORDCOUNT, name: 'native', executor: 'module' }),
            ),
            write('work/native/count.py', COUNT_PY),
            write(
              'work/escape/tool.json',
              JSON.stringify({
                ...WORDCOUNT,
                name: 'escape',
                run: { program: 'python3', script: '../wordcount/count.py' },
              }),
            ),
          ],
          [
            publish('op-tool-3', 'native', 'work/native'),
            publish('op-tool-4', 'escape', 'work/escape'),
          ],
          [extensions('list', { category: 'tool' })],
        )
        expect(refused).toContain(
          'tool.json: executor is "module"; a tool made here runs a script: leave executor out',
        )
        expect(refused).toContain(
          'tool.json: run.script is not a path inside the directory of the tool',
        )
        expect(refused).not.toMatch(/^(native|escape)\s+sha256/mu)
      }),
  )
})
