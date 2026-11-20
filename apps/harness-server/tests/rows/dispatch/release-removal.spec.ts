// @module-tag slow
import { describe, expect, it } from 'vitest'
import { dispatchingKey } from '@omne-harness/dispatch-cordis-contract/cordis'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
  toolResults,
} from '../../support/release-tree.ts'
import { call, registryAs, settled } from './release-support.ts'

const DISPATCH_ROWS = ['dispatch', 'dispatch-session', 'dispatch-tool']
const todo = {
  id: 'call_todo',
  tool: 'TodoItems',
  arguments: JSON.stringify({ command: 'add', params: { text: 'water the plants' } }),
}
const rowsOf = (records: readonly Record<string, unknown>[]) =>
  records.filter(record => record['kind'] === 'tree').map(record => String(record['id']))

describe('the release tree without dispatch rows', () => {
  it(
    'starts without all three, lets a session talk and call its other tools, and answers a call of Agents that its services are not available',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const seen = { agents: false, requests: 0 }
      const script = toolCallsThenText(body => {
        seen.requests += 1
        seen.agents ||= body.includes('"name":"Agents"')
        return body.includes('note it') ? [todo, call('c_targets', 'targets')] : []
      })
      const exitCode = await onReleaseTree({ script, withoutRows: DISPATCH_ROWS }, async tree => {
        expect(rowsOf(tree.records).filter(id => DISPATCH_ROWS.includes(id))).toEqual([])
        expect(tree.scope.get(dispatchingKey)).toBeUndefined()
        const ended = (session: string) =>
          pollUntil(
            'the Run to end',
            () => historyOf(tree, session),
            entries => entries.some(entry => entry.kind === 'run.terminal'),
          )
        const talking = await ended(await tree.startSession('hello'))
        expect(JSON.stringify(talking.find(entry => entry.kind === 'run.terminal'))).toContain(
          '"outcome":"completed"',
        )
        const working = await ended(await tree.startSession('note it'))
        expect(toolResults(working).join('\n')).toContain('"ok":{"receipt"')
        expect(seen.requests).toBeGreaterThan(1)
        expect(toolResults(working).join('\n')).toContain(
          'the dispatch services are not available now',
        )
        expect(seen.agents).toBe(true)
      })
      expect(exitCode).toBe(0)
    },
  )

  it.each([
    ['dispatch-session', 'the session side'],
    ['dispatch-tool', 'the Tool side'],
  ])(
    'starts without %s alone: the other dispatch rows run, and a dispatch is refused or waits instead of being lost',
    { tags: ['slow'], timeout: 300_000 },
    async row => {
      const script = toolCallsThenText(body =>
        body.includes('agents: delegate')
          ? [
              call('c_dispatch', 'dispatch', {
                mode: 'delegate',
                agent: 'coding',
                instruction: 'Do it.',
              }),
            ]
          : [],
      )
      const options = { script, withoutRows: [row], permission: 'bypass-permissions' }
      const exitCode = await onReleaseTree(options, async tree => {
        const started = rowsOf(tree.records).filter(id => DISPATCH_ROWS.includes(id))
        expect(started).toEqual(DISPATCH_ROWS.filter(id => id !== row))
        expect(tree.scope.get(dispatchingKey)).toBeDefined()
        const plain = await settled(tree, await tree.startSession('hello'))
        expect(
          JSON.stringify(plain.entries.find(entry => entry.kind === 'run.terminal')),
        ).toContain('"outcome":"completed"')
        if (row !== 'dispatch-session') return
        const parent = await tree.startSession('agents: delegate')
        const { results } = await settled(tree, parent)
        expect(results).toContain('the dispatch services cannot answer now; nothing was changed')
        expect(await (await registryAs(tree, parent)).made()).toEqual([])
      })
      expect(exitCode).toBe(0)
    },
  )
})
