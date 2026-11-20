// @module-tag slow
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCalls,
  toolCallsByRequest,
  toolLedger,
  toolLedgerText,
  type ReleaseTree,
} from '../../support/release-tree.ts'
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

/** A model whose dispatched agents first wait, in a Shell call, for a file the test writes: the child
 * is busy in a tool, as a real one would be, and no model reply is held. `pick` answers every other request. */
function busyChildren(
  pick: Parameters<typeof toolCallsByRequest>[0],
  fileOf: (body: string) => string = () => 'go',
) {
  const wait = (file: string) => ({
    id: 'c_wait',
    tool: 'Shell',
    arguments: JSON.stringify({
      command: 'execute',
      intent: 'wait for the test',
      params: { script: `while [ ! -f ${file} ]; do sleep 0.1; done; echo released` },
    }),
  })
  const script = toolCallsByRequest(body =>
    body.includes(DISPATCHED) && !answered(body) ? [wait(fileOf(body))] : pick(body),
  )
  const release = (tree: ReleaseTree, file = 'go') =>
    writeFileSync(join(dirname(tree.storageRoot), 'workspace', file), '')
  return { script, release }
}

/** The dispatch call of the tree is parked on its wait. */
const parked = (tree: ReleaseTree) =>
  pollUntil(
    'the dispatch call to wait for its report',
    () => ({
      phase: toolLedger(tree.storageRoot).find(row => row.tool === 'Agents')?.phase,
      stage: toolCalls(tree.storageRoot).find(row => row.tool === 'Agents')?.entry?.stage,
    }),
    seen => seen.phase === 'suspended' && seen.stage === 'parked',
  )

async function cancelFirstRun(tree: ReleaseTree, session: string): Promise<void> {
  const started = (await historyOf(tree, session)).find(entry => entry.kind === 'run.started')
  const run = String(started?.payload['run'])
  const cancelled = await tree.cli([
    'cancel-run',
    '--session',
    session,
    '--run',
    run,
    '--urgency',
    'graceful',
  ])
  expect(cancelled.status, cancelled.stderr).toBe(0)
}

const lateDispatch = (body: string) =>
  body.includes('agents: delegate late') && !answered(body) && !body.includes('arrived after')
    ? [
        call('c_dispatch', 'dispatch', {
          mode: 'delegate',
          agent: 'coding',
          instruction: 'Say the late word.',
        }),
      ]
    : []

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

  it(
    'sends a report that comes after the dispatching run was cancelled into the dispatching session and wakes it, and takes one report only',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const { script, release } = busyChildren(body => {
        if (!body.includes(DISPATCHED)) return lateDispatch(body)
        if (!body.includes('c_report'))
          return [call('c_report', 'report', { text: 'the late word is HERON' })]
        if (body.includes('c_again')) return []
        return [
          call('c_again', 'report', { text: 'the late word is HERON' }),
          call('c_other', 'report', { text: 'another report' }),
        ]
      })
      const exitCode = await onReleaseTree({ ...OPTIONS, script }, async tree => {
        const parent = await tree.startSession('agents: delegate late')
        await parked(tree)
        const registry = await registryAs(tree, parent)
        const [dispatch] = await registry.made()
        if (dispatch === undefined) throw new Error('the registry has no dispatch of the parent')
        expect(dispatch.state).toBe('started')

        await cancelFirstRun(tree, parent)
        const stopped = await settled(tree, parent)
        expect(stopped.results).toContain('the run was cancelled before the call returned')
        expect(stopped.results).not.toContain('HERON')
        const ended = await pollUntil(
          'the dispatch call to end',
          () => toolLedger(tree.storageRoot).find(row => row.tool === 'Agents'),
          row => row?.phase === 'settled',
        )
        expect(ended).toMatchObject({
          terminal: 'interrupted',
          waits: [{ phase: 'closed', cause: 'cancelled' }],
        })
        expect(toolLedgerText(tree.storageRoot)).toContain('The dispatch is still in progress')
        expect((await registry.shown(dispatch.id)).state).toBe('started')

        release(tree)
        expect(await registry.delivered(dispatch.id)).toMatchObject({
          state: 'reported',
          report: { text: 'the late word is HERON', origin: 'report' },
          delivery: { kind: 'delivered', to: 'input' },
        })
        const woken = await settled(tree, parent, 2)
        const arrived = reminders(woken.entries).filter(text =>
          text.includes('the late word is HERON'),
        )
        expect(arrived).toHaveLength(1)
        expect(arrived[0]).toContain(dispatch.session)
        expect(arrived[0]).toContain('arrived after your call stopped waiting')

        const child = await settled(tree, dispatch.session)
        expect(child.results).toMatch(/done Agents report\n\{[^\n]*"recalled":true/u)
        expect(child.results).toContain('already-reported: the dispatch already has its one report')
        expect((await registry.shown(dispatch.id)).report?.text).toBe('the late word is HERON')
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'records a report as not deliverable when the dispatching session is archived by then, and show reads it',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const { script, release } = busyChildren(body => {
        if (!body.includes(DISPATCHED)) return lateDispatch(body)
        return body.includes('c_report')
          ? []
          : [call('c_report', 'report', { text: 'nobody is here to read this' })]
      })
      const exitCode = await onReleaseTree({ ...OPTIONS, script }, async tree => {
        const parent = await tree.startSession('agents: delegate late')
        await parked(tree)
        const registry = await registryAs(tree, parent)
        const [dispatch] = await registry.made()
        if (dispatch === undefined) throw new Error('the registry has no dispatch of the parent')
        await cancelFirstRun(tree, parent)
        await settled(tree, parent)
        expect(await tree.archive(parent)).toHaveProperty('ok')

        release(tree)
        const ended = await registry.delivered(dispatch.id)
        expect(ended).toMatchObject({
          state: 'reported',
          report: { text: 'nobody is here to read this' },
          delivery: { kind: 'undeliverable' },
        })
        const after = await historyOf(tree, parent)
        expect(reminders(after).some(text => text.includes('nobody is here'))).toBe(false)
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'refuses a dispatch over the limit of open ones, withdraws one before its report, and refuses a report that comes after the withdrawal',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const target = { id: '' }
      const many = [1, 2, 3, 4].map(n =>
        call(`c_many_${String(n)}`, 'dispatch', {
          mode: 'delegate',
          agent: 'coding',
          instruction: `Do part ${String(n)}.`,
        }),
      )
      const { script, release } = busyChildren(
        body => {
          if (body.includes(DISPATCHED)) return []
          if (body.includes('agents: withdraw'))
            return body.includes('c_withdraw')
              ? []
              : [
                  call('c_withdraw', 'withdraw', { dispatch: target.id }),
                  call('c_withdraw_again', 'withdraw', { dispatch: target.id }),
                ]
          return body.includes('agents: many') && !answered(body) ? many : []
        },
        body => (body.includes('Do part 1.') ? 'go-first' : 'go-rest'),
      )
      const exitCode = await onReleaseTree({ ...OPTIONS, script }, async tree => {
        const parent = await tree.startSession('agents: many')
        const registry = await registryAs(tree, parent)
        const open = await pollUntil(
          'three dispatches to start',
          () => registry.made(),
          made => made.filter(dispatch => dispatch.state === 'started').length === 3,
        )
        expect(open).toHaveLength(3)
        const refused = await pollUntil(
          'the fourth dispatch call to end',
          () => toolLedger(tree.storageRoot).filter(row => row.tool === 'Agents'),
          rows => rows.filter(row => row.phase === 'settled').length === 1,
        )
        expect(refused.filter(row => row.phase === 'suspended')).toHaveLength(3)
        expect(toolLedgerText(tree.storageRoot)).toContain(
          'too-many-open: this session has as many',
        )

        const first = open.find(dispatch => dispatch.instruction === 'Do part 1.')
        if (first === undefined) throw new Error('the first part was not dispatched')
        release(tree, 'go-rest')
        for (const dispatch of open.filter(item => item.id !== first.id))
          expect(await registry.delivered(dispatch.id)).toMatchObject({
            state: 'reported',
            report: { text: 'done', origin: 'final-reply' },
            delivery: { kind: 'delivered', to: 'result' },
          })

        await cancelFirstRun(tree, parent)
        await settled(tree, parent)
        target.id = first.id
        const sent = await tree.cli([
          'send-input',
          '--session',
          parent,
          '--text',
          'agents: withdraw',
        ])
        expect(sent.status, sent.stderr).toBe(0)
        const second = await settled(tree, parent, 2)
        const withdrew = `done Agents withdraw\n{"dispatch":"${first.id}","state":"withdrawn","stop":`
        expect(second.results.split(withdrew)).toHaveLength(3)
        expect(second.results).toContain('"recalled":false')
        expect(second.results).toContain('"recalled":true')
        const child = await registryAs(tree, first.session)
        expect(await child.dispatching.report(child.ctx, 'a report after the withdrawal')).toEqual({
          kind: 'refused',
          reason: 'withdrawn',
        })
        const stopped = await pollUntil(
          'the stop of the withdrawn run to be confirmed',
          () => registry.shown(first.id),
          dispatch => dispatch.stop === 'confirmed',
        )
        expect(stopped).toMatchObject({ state: 'withdrawn', report: null })
        const withdrawn = await historyOf(tree, first.session)
        expect(JSON.stringify(withdrawn.filter(entry => entry.kind === 'run.terminal'))).toContain(
          '"outcome":"cancelled"',
        )
        release(tree, 'go-first')
        expect((await registry.shown(first.id)).state).toBe('withdrawn')
      })
      expect(exitCode).toBe(0)
    },
  )
})
