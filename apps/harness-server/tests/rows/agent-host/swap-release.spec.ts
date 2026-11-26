// @module-tag slow
// Starts the release tree: the operator swaps the Agent host while a run waits on a tool call.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { askControl } from '../../../src/control-port.ts'
import { inWorkspace } from '../../self-extension/support.ts'
import { officialLayer } from '../../support/official-layer.ts'
import { cliOk, direct, plan } from '../../support/planned-model.ts'
import { history, pollUntil } from '../../support/release-tree.ts'
import { publisher, versionDirectory } from '../../support/version-directory.ts'

/** A Shell call that marks each time it runs, then waits until the test writes the file `go`. */
const waitFor = (project: string) =>
  direct('Shell', {
    command: 'execute',
    intent: 'wait until the test lets the call end',
    params: {
      script: `echo ran >> ${join(project, 'runs.txt')}; while [ ! -f ${join(project, 'go')} ]; do sleep 0.2; done; cat ${join(project, 'go')}`,
    },
  })

const SHIPPED = `export const row = kit => kit.shipped('agent-host')\n`
const BAD = `export function row(kit) {
  return {
    declaration: kit.shipped('agent-host').declaration,
    plugin: { apply() { throw new Error('this host cannot start') } },
  }
}
`

describe('发行树：一轮在跑时换 agent-host（C17）', () => {
  it(
    '一个工具调用在等时换：这一轮接手一次之后跑到结束；那个命令只跑了一次；依赖它的行没有重跑；起不来的一版被拒',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const key = publisher()
      const next = versionDirectory(SHIPPED, key)
      const bad = versionDirectory(BAD, key)
      await inWorkspace(
        async (_ask, tree, project, session) => {
          const before = officialLayer(tree)
          await cliOk(tree, [
            'send-input',
            '--session',
            session,
            '--text',
            plan([waitFor(project)], []),
          ])
          await pollUntil(
            'the tool to run',
            async () => existsSync(join(project, 'runs.txt')),
            Boolean,
          )

          const swap = (directory: string) =>
            askControl(tree.env.stateRoot, { op: 'swap', row: 'agent-host', directory })
          const refused = await swap(bad)
          expect(refused.at(-1)).toMatchObject({ outcome: 'refused', reason: 'did-not-start' })
          const answer = await swap(next)
          expect(answer[0]).toMatchObject({ kind: 'impact', way: 'implementation', reruns: [] })
          expect(answer.at(-1)).toMatchObject({ outcome: 'swapped' })

          // The call that was sent goes on; once it ends the run goes on to its end on the new generation.
          writeFileSync(join(project, 'go'), 'RELEASED')
          const after = await pollUntil(
            'the run to end',
            () => history(tree.port, tree.home, session),
            seen => seen.some(entry => entry.kind === 'run.terminal'),
          )
          expect(readFileSync(join(project, 'runs.txt'), 'utf8').trim().split('\n')).toEqual([
            'ran',
          ])
          expect(JSON.stringify(after.filter(entry => entry.kind === 'message.tool'))).toContain(
            'RELEASED',
          )
          const attempts = after.filter(entry => entry.kind === 'run.attempt-started')
          expect(attempts.length).toBe(2)
          expect(after.filter(entry => entry.kind === 'run.started')).toHaveLength(1)

          // Only the swapped row has a new fiber: the rows that inject its services did not run again.
          const now = officialLayer(tree)
          const changed = [...before].filter(([row, was]) => now.get(row)?.fiber !== was.fiber)
          expect(changed.map(([row]) => row)).toEqual(['agent-host'])
          const stray = ['swap-mismatch', 'row-supervision', 'supervision-exit']
          expect(tree.records.filter(r => stray.includes(r.kind))).toEqual([])
        },
        { publisherKeys: [key.publicKey], extraHistoryKinds: ['run.attempt-started'] },
      )
    },
  )
})
