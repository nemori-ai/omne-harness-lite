// @module-tag slow
import { describe, expect, it } from 'vitest'
import { onReleaseTree, toolCallsByRequest } from '../../support/release-tree.ts'
import {
  DISPATCHED,
  answered,
  call,
  dispatchIn,
  registryAs,
  reminders,
  settled,
} from './release-support.ts'

const OPTIONS = {
  permission: 'bypass-permissions',
  extraHistoryKinds: ['message.system_reminder'],
} as const

describe('the Agents tool on the release tree', () => {
  it(
    'delegates work to a child session, returns its one report as the result of the call, and lists and shows the dispatch',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const declared = { parent: '', child: '' }
      const script = toolCallsByRequest(body => {
        const dispatched = body.includes(DISPATCHED)
        if (dispatched) declared.child ||= body
        else if (body.includes('agents: delegate')) declared.parent ||= body
        if (dispatched)
          return answered(body) ? [] : [call('c_report', 'report', { text: 'the word is PELICAN' })]
        if (body.includes('agents: look') && !body.includes('c_show')) {
          const dispatch = dispatchIn(body)
          return [
            call('c_children', 'list', { relation: 'child' }),
            call('c_reported', 'list', { dispatch: 'reported' }),
            call('c_show', 'show', { dispatch }),
            call('c_bad', 'dispatch', { mode: 'delegate' }),
            {
              id: 'c_sessions',
              tool: 'Sessions',
              arguments: JSON.stringify({ command: 'list', params: {} }),
            },
          ]
        }
        if (body.includes('agents: delegate') && !answered(body))
          return [
            call('c_targets', 'targets'),
            call('c_dispatch', 'dispatch', {
              mode: 'delegate',
              agent: 'coding',
              instruction: 'Say the code word.',
              expectation: 'One line with the word.',
            }),
          ]
        return []
      })
      const exitCode = await onReleaseTree({ ...OPTIONS, script }, async tree => {
        const parent = await tree.startSession('agents: delegate')
        const first = await settled(tree, parent)
        expect(first.results).toContain('done Agents targets')
        expect(first.results).toMatch(/"agent":"coding","type":"master"/u)
        expect(first.results).toContain('done Agents dispatch')
        expect(first.results).toContain('"report":"the word is PELICAN"')
        expect(first.results).toContain('"reportIs":"what the dispatched agent handed back"')
        expect(first.results).toContain('"expectation":"One line with the word."')

        const registry = await registryAs(tree, parent)
        const [dispatch] = await registry.made()
        if (dispatch === undefined) throw new Error('the registry has no dispatch of the parent')
        expect(await registry.delivered(dispatch.id)).toMatchObject({
          state: 'reported',
          mode: 'delegate',
          report: { text: 'the word is PELICAN', origin: 'report' },
          delivery: { kind: 'delivered', to: 'result' },
        })
        const child = await settled(tree, dispatch.session)
        expect(reminders(child.entries).some(text => text.includes('Say the code word.'))).toBe(
          true,
        )
        expect(child.results).toContain('done Agents report')
        expect(reminders(first.entries).some(text => text.includes('PELICAN'))).toBe(false)

        expect(declared.parent).toContain('"name":"Agents"')
        expect(declared.parent).toContain('dispatch {mode=')
        expect(declared.parent).not.toContain('report {text}')
        expect(declared.child).toContain('report {text}')

        const sent = await tree.cli(['send-input', '--session', parent, '--text', 'agents: look'])
        expect(sent.status, sent.stderr).toBe(0)
        const second = await settled(tree, parent, 2)
        const line = new RegExp(
          `"session":"${dispatch.session}","title":[^{}]*"relation":"child","attendance":"unattended","definition":"coding","lifecycle":"[a-z]+","dispatch":\\{"id":"${dispatch.id}","state":"reported","mode":"delegate"\\}`,
          'u',
        )
        expect(second.results).toMatch(line)
        expect(second.results).toContain(
          `{"session":"${dispatch.session}","relation":"child","attendance":"unattended","definition":"coding","dispatch":{"id":"${dispatch.id}","state":"reported","mode":"delegate"}}`,
        )
        expect(second.results).toContain(
          '"delivery":"delivered as the result of the dispatching call"',
        )
        expect(second.results).toContain(
          'Agents dispatch: agent: Invalid input: expected string, received undefined',
        )
        expect(second.results).toMatch(
          /Usage: Agents \{"command": "dispatch", "params": \{mode=spawn\|delegate\|handoff, agent, instruction, expectation\?\}\}/u,
        )
        expect(second.results).toContain('done Sessions list sessions=')
        const listed =
          second.results.split('\n').find(text => text.includes('done Sessions list')) ?? ''
        expect(second.results.slice(second.results.indexOf(listed))).toContain(dispatch.session)
      })
      expect(exitCode).toBe(0)
    },
  )
})
