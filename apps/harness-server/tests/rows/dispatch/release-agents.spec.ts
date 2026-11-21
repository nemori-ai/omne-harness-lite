// @module-tag slow
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { savedLoginProof, savedTenant } from '../../r9/support.ts'
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
      params: { script: `: > running; while [ ! -f ${file} ]; do sleep 0.1; done; echo released` },
    }),
  })
  const script = toolCallsByRequest(body =>
    body.includes(DISPATCHED) && !answered(body) ? [wait(fileOf(body))] : pick(body),
  )
  const inWorkspace = (tree: ReleaseTree, file: string) =>
    join(dirname(tree.storageRoot), 'workspace', file)
  const release = (tree: ReleaseTree, file = 'go') => writeFileSync(inWorkspace(tree, file), '')
  /** The script of a dispatched agent has begun: its Shell call is past its start, where a stop reaches it. */
  const running = (tree: ReleaseTree) =>
    pollUntil(
      'the Shell call of the dispatched agent to run',
      () => existsSync(inWorkspace(tree, 'running')),
      begun => begun,
    )
  return { script, release, running }
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
    'spawns an agent whose session is forked from the conversation as it was when the work was dispatched',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const seen = { child: '' }
      const spawn = (id: string, instruction: string) =>
        call(id, 'dispatch', { mode: 'spawn', agent: 'coding', instruction })
      const script = toolCallsByRequest(body => {
        if (body.includes(DISPATCHED)) {
          seen.child ||= body
          return answered(body.slice(body.indexOf(DISPATCHED)))
            ? []
            : [call('c_report', 'report', { text: 'I know the word' })]
        }
        if (body.includes('agents: spawn now') && !answered(body))
          return [spawn('c_spawn', 'Tell me the code word.')]
        return []
      })
      // More than the two hundred thousand bytes a copied conversation was once held to.
      const long = `Remember: the code word is HERON. ${'filler words. '.repeat(20_000)}`
      const exitCode = await onReleaseTree({ ...OPTIONS, script }, async tree => {
        const parent = await tree.startSession(long)
        await settled(tree, parent)
        const sent = await tree.cli([
          'send-input',
          '--session',
          parent,
          '--text',
          'agents: spawn now',
        ])
        expect(sent.status, sent.stderr).toBe(0)
        const { results } = await settled(tree, parent, 2)
        expect(results).toContain('"report":"I know the word"')
        const [dispatch] = await (await registryAs(tree, parent)).made()
        if (dispatch === undefined) throw new Error('no dispatch')
        expect(dispatch).toMatchObject({ mode: 'spawn', state: 'reported' })
        expect(dispatch.context).toMatch(/^\["[^"]+","\d+","\d+"\]$/u)

        // The input of the dispatched session holds the work alone; the conversation is not in it.
        const child = await historyOf(tree, dispatch.session)
        const told = reminders(child)
        const starting = told.find(text => text.includes(DISPATCHED))
        expect(starting).toContain('This session is forked from the dispatching session')
        expect(starting).toContain('Work:\\nTell me the code word.')
        expect(JSON.stringify(child)).not.toContain('the code word is HERON')
        // Its first runtime context reminder is the whole snapshot: it is told in a scope of its own.
        const context = told.filter(text => text.includes('Runtime context: '))
        expect(context[0]).toContain('Runtime context: the current values')

        // A person reads the conversation it started with through the command line, under its source.
        const read = [
          'read-history',
          '--session',
          dispatch.session,
          '--tenant',
          savedTenant(tree.home),
        ]
        const plain = await tree.cli(read)
        expect(plain.status, plain.stderr).toBe(0)
        expect(plain.stdout).not.toContain('the code word is HERON')
        const whole = await tree.cli([...read, '--inherited'])
        expect(whole.status, whole.stderr).toBe(0)
        const lines = whole.stdout.split('\n')
        expect(lines[0]).toBe(`--- inherited: session ${parent} ---`)
        expect(whole.stdout).toContain('the code word is HERON')
        expect(lines.indexOf('--- this session ---')).toBeGreaterThan(
          lines.findIndex(line => line.includes('agents: spawn now')),
        )
        expect(whole.stdout.endsWith(plain.stdout)).toBe(true)

        // Its first model request is given the conversation of the dispatcher, then its own rows.
        expect(Buffer.byteLength(seen.child)).toBeGreaterThan(200_000)
        const said = seen.child.indexOf('the code word is HERON')
        const asked = seen.child.indexOf('agents: spawn now')
        const work = seen.child.indexOf(DISPATCHED)
        expect(said).toBeGreaterThan(-1)
        expect(asked).toBeGreaterThan(said)
        expect(work).toBeGreaterThan(asked)
        expect(seen.child).not.toContain('c_spawn')
        expect(seen.child).not.toContain('It starts from a copy of the conversation')

        const later = await tree.cli([
          'send-input',
          '--session',
          parent,
          '--text',
          'The word changed to EGRET.',
        ])
        expect(later.status, later.stderr).toBe(0)
        await settled(tree, parent, 3)
        expect(JSON.stringify(await historyOf(tree, dispatch.session))).not.toContain('EGRET')
        expect(JSON.stringify(await historyOf(tree, parent))).not.toContain(dispatch.session + '/')
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'shows a person and an agent what the sessions are to each other: the command line and Sessions list give the relation and narrow by it',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const sessions = (id: string, params: Record<string, unknown>) => ({
        id,
        tool: 'Sessions',
        arguments: JSON.stringify({ command: 'list', params }),
      })
      const script = toolCallsByRequest(body => {
        if (body.includes(DISPATCHED))
          return answered(body) ? [] : [call('c_report', 'report', { text: 'done' })]
        if (body.includes('sessions: look') && !body.includes('c_children'))
          return [
            sessions('c_children', { relation: 'child' }),
            sessions('c_mains', { relation: 'main', attendance: 'attended' }),
          ]
        return lateDispatch(body)
      })
      const exitCode = await onReleaseTree({ ...OPTIONS, script }, async tree => {
        const parent = await tree.startSession('agents: delegate late')
        await settled(tree, parent)
        const [dispatch] = await (await registryAs(tree, parent)).made()
        if (dispatch === undefined) throw new Error('no dispatch')
        const child = dispatch.session
        const rows = async (args: readonly string[]) => {
          const answer = await tree.cli(['list-sessions', ...args])
          expect(answer.status, answer.stderr).toBe(0)
          const listed = (
            JSON.parse(answer.stdout) as { body: { sessions: Record<string, unknown>[] } }
          ).body.sessions
          return Object.fromEntries(listed.map(row => [String(row['session']), row]))
        }
        const all = await rows([])
        expect(all[child]).toMatchObject({
          relation: 'child',
          parent,
          origin: null,
          root: parent,
          depth: 1,
          attendance: 'unattended',
          definition: 'coding',
        })
        expect(all[parent]).toMatchObject({
          relation: 'main',
          parent: null,
          depth: 0,
          attendance: 'attended',
        })
        expect(Object.keys(await rows(['--relation', 'child']))).toEqual([child])
        expect(Object.keys(await rows(['--parent', parent]))).toEqual([child])
        expect(Object.keys(await rows(['--attendance', 'attended']))).toEqual([parent])
        expect(Object.keys(await rows(['--relation', 'handoff']))).toEqual([])
        expect(Object.keys(await rows(['--definition', 'nobody']))).toEqual([])

        const sent = await tree.cli(['send-input', '--session', parent, '--text', 'sessions: look'])
        expect(sent.status, sent.stderr).toBe(0)
        const { results } = await settled(tree, parent, 2)
        const [children, mains] = results
          .split('done Sessions list ')
          .slice(1)
          .map(
            part =>
              JSON.parse(part.slice(part.indexOf('\n') + 1).split('\n')[0] ?? '[]') as Record<
                string,
                unknown
              >[],
          )
        expect(children).toMatchObject([
          {
            session: child,
            relation: 'child',
            parent,
            depth: 1,
            attendance: 'unattended',
            definition: 'coding',
          },
        ])
        expect(mains?.map(row => row['session'])).toEqual([parent])
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'lets the dispatched agent run its own tools while the dispatching call waits for the report',
    { tags: ['slow'], timeout: 120_000 },
    async () => {
      const shell = {
        id: 'c_work',
        tool: 'Shell',
        arguments: JSON.stringify({
          command: 'execute',
          intent: 'do the work',
          params: { script: 'echo the child worked' },
        }),
      }
      const script = toolCallsByRequest(body => {
        if (body.includes(DISPATCHED)) {
          if (!answered(body)) return [shell]
          return body.includes('c_report')
            ? []
            : [call('c_report', 'report', { text: 'worked with a tool' })]
        }
        return lateDispatch(body)
      })
      const exitCode = await onReleaseTree({ ...OPTIONS, script }, async tree => {
        const parent = await tree.startSession('agents: delegate late')
        const { results } = await settled(tree, parent)
        expect(results).toContain('"report":"worked with a tool"')
        const [dispatch] = await (await registryAs(tree, parent)).made()
        if (dispatch === undefined) throw new Error('no dispatch')
        const child = await settled(tree, dispatch.session)
        expect(child.results).toContain('the child worked')
      })
      expect(exitCode).toBe(0)
    },
  )

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
    'takes back the open dispatch of a session that is archived, and archives the session it dispatched with it',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const { script, release, running } = busyChildren(body =>
        body.includes(DISPATCHED) ? [] : lateDispatch(body),
      )
      await onReleaseTree({ ...OPTIONS, script }, async tree => {
        const parent = await tree.startSession('agents: delegate late')
        await parked(tree)
        const registry = await registryAs(tree, parent)
        const [dispatch] = await registry.made()
        if (dispatch === undefined) throw new Error('the registry has no dispatch of the parent')
        const bystander = await tree.startSession('hello, I stay')
        await settled(tree, bystander)
        await running(tree)
        expect(await tree.archive(parent)).toHaveProperty('ok')

        const taken = await pollUntil(
          'the dispatch to be taken back',
          () => registry.shown(dispatch.id),
          shown => shown.state === 'withdrawn',
        )
        expect(taken).toMatchObject({ state: 'withdrawn', report: null })
        const listed = async (command: string) => {
          const answer = await tree.cli([command])
          expect(answer.status, answer.stderr).toBe(0)
          return answer.stdout
        }
        const archived = await pollUntil(
          'the dispatched session to follow its parent into the archive',
          () => listed('list-archived-sessions'),
          text => text.includes(dispatch.session),
        )
        const byOf = (session: string) =>
          new RegExp(`"session":"${session}"[^{}]*"archivedBy":"([a-z]+)"`, 'u').exec(archived)?.[1]
        expect(byOf(parent)).toBe('person')
        expect(byOf(dispatch.session)).toBe('parent')
        expect(archived).not.toContain(bystander)
        const response = await fetch(
          `http://127.0.0.1:${String(tree.port)}/api/session/v1/list-sessions`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${savedLoginProof(tree.home)}`,
              'omne-message-id': 'm-list-after-archive',
            },
            body: JSON.stringify({ tenant: savedTenant(tree.home), cursor: null }),
          },
        )
        const open = await response.text()
        expect(open).toContain(bystander)
        expect(open).not.toContain(parent)
        expect(open).not.toContain(dispatch.session)

        release(tree)
        const child = await pollUntil(
          'the run of the dispatched session to end',
          () => historyOf(tree, dispatch.session),
          entries => entries.some(entry => entry.kind === 'run.terminal'),
        )
        expect(JSON.stringify(child.find(entry => entry.kind === 'run.terminal'))).toContain(
          '"outcome":"cancelled"',
        )
        expect((await registry.shown(dispatch.id)).state).toBe('withdrawn')
        const stopped = await pollUntil(
          'Tool to report the call of the dispatched session as stopped',
          () => toolLedger(tree.storageRoot).find(row => row.tool === 'Shell'),
          row => row?.phase === 'settled',
        )
        expect(stopped?.terminal).toBe('interrupted')
      })
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
