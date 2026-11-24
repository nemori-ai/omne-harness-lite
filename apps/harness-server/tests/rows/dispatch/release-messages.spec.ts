// @module-tag slow
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bodyOf, runOmne } from '../../r9/support.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsByRequest,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import {
  DISPATCHED,
  answered,
  call,
  outcomesOf,
  registryAs,
  reminders,
  settled,
  settledWhen,
} from './release-support.ts'

const OPTIONS = {
  permission: 'bypass-permissions',
  extraHistoryKinds: ['message.system_reminder'],
} as const
const NOBODY = 'f'.repeat(64)
/** The work of a dispatched session as its starting input words it, in the JSON text of a model request. */
const workOf = (name: string) => `Work:\\n${name}: dispatch on`

/** A session of another tenant on the same server. */
async function strangerSession(tree: ReleaseTree): Promise<string> {
  const base = dirname(tree.home)
  const home = join(base, 'frank')
  const server = `http://127.0.0.1:${String(tree.port)}`
  const run = (args: readonly string[], credential?: string) =>
    runOmne({ args, home, server, cwd: base, ...(credential === undefined ? {} : { credential }) })
  for (const command of ['register', 'login'])
    expect(
      (await run([command, '--login-identifier', 'frank'], 'frank-pw-dispatch-5d1c')).status,
    ).toBe(0)
  const created = await run(['create-session', '--definition', 'coding'])
  expect(created.status, created.stderr).toBe(0)
  return String(bodyOf(created)['session'])
}

async function say(tree: ReleaseTree, session: string, text: string): Promise<void> {
  const sent = await tree.cli(['send-input', '--session', session, '--text', text])
  expect(sent.status, sent.stderr).toBe(0)
}

describe('messages between agents on the release tree', () => {
  it(
    'sends a message to another session of the tenant as a system reminder that wakes it, and refuses every other target with its reason',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const ids = { a: '', b: '', archived: '', foreign: '' }
      const script = toolCallsByRequest(body => {
        if (!body.includes('agents: message') || answered(body)) return []
        return [
          call('c_ok', 'message', { to: ids.b, text: 'hello from A', id: 'note-1' }),
          call('c_again', 'message', { to: ids.b, text: 'hello from A', id: 'note-1' }),
          call('c_self', 'message', { to: ids.a, text: 'to myself' }),
          call('c_nobody', 'message', { to: NOBODY, text: 'to nobody' }),
          call('c_foreign', 'message', { to: ids.foreign, text: 'to another tenant' }),
          call('c_archived', 'message', { to: ids.archived, text: 'to an archived session' }),
        ]
      })
      const exitCode = await onReleaseTree({ ...OPTIONS, script }, async tree => {
        ids.a = await tree.startSession('hello, I am A')
        ids.b = await tree.startSession('hello, I am B')
        ids.archived = await tree.startSession('hello, I am gone')
        for (const session of [ids.a, ids.b, ids.archived]) await settled(tree, session)
        expect(await tree.archive(ids.archived)).toHaveProperty('ok')
        ids.foreign = await strangerSession(tree)

        await say(tree, ids.a, 'agents: message')
        const { results } = await settled(tree, ids.a, 2)
        expect(results.split(`done Agents message\n{"to":"${ids.b}"}`)).toHaveLength(3)
        expect(results).toContain('to-self: a message goes to another session, not to your own')
        const absent = 'no-such-session: no such session for this tenant; see list'
        expect(results.split(absent)).toHaveLength(3)
        expect(results).toContain('archived: that session is archived and takes no message')
        expect(results).not.toContain(ids.foreign)

        const woken = await settled(tree, ids.b, 2)
        const got = reminders(woken.entries).filter(text => text.includes('hello from A'))
        expect(got).toHaveLength(1)
        expect(got[0]).toContain(`From session: ${ids.a}`)
        expect(got[0]).toContain('Agent definition: coding')
        expect(got[0]).toContain('What that session is to yours: unrelated')
        expect(woken.entries.filter(entry => entry.kind === 'message.user')).toHaveLength(1)

        for (const session of [ids.a, ids.archived])
          expect(reminders(await historyOf(tree, session)).some(text => text.includes('to '))).toBe(
            false,
          )
        expect(await (await registryAs(tree, ids.a)).made()).toEqual([])
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'refuses a dispatch from the deepest layer, an unknown definition and a handoff to a definition that is not a master, and hands work over to a new attended main session',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const delegate = (id: string, instruction: string) =>
        call(id, 'dispatch', { mode: 'delegate', agent: 'coding', instruction })
      const relay = (body: string, level: string, next: string) => {
        if (!answered(body)) return [delegate(`c_${level}`, next)]
        if (body.includes(`c_${level}_report`)) return []
        // The dispatch starts in the background: report once its outcome has come back.
        if (!body.includes('This is background call')) return []
        const said = /too-deep[^"\\]*/u.exec(body)?.[0] ?? 'no refusal seen'
        return [
          call(`c_${level}_report`, 'report', { text: `${level} heard: ${said.slice(0, 60)}` }),
        ]
      }
      const script = toolCallsByRequest(body => {
        if (body.includes(DISPATCHED)) {
          if (body.includes(workOf('chain-2'))) return relay(body, 'two', 'chain-3: dispatch on')
          if (body.includes(workOf('chain-1'))) return relay(body, 'one', 'chain-2: dispatch on')
          return []
        }
        if (body.includes('agents: relations'))
          return body.includes('c_handed')
            ? []
            : [
                call('c_handed', 'list', { relation: 'handed-off' }),
                call('c_children', 'list', { relation: 'child' }),
              ]
        if (answered(body)) return []
        if (body.includes('agents: chain')) return [delegate('c_zero', 'chain-1: dispatch on')]
        if (body.includes('agents: handoff'))
          return [
            call('c_unknown', 'dispatch', { mode: 'delegate', agent: 'nobody', instruction: 'x' }),
            call('c_assistant', 'dispatch', {
              mode: 'handoff',
              agent: 'assistant',
              instruction: 'x',
            }),
            call('c_handoff', 'dispatch', {
              mode: 'handoff',
              agent: 'coding',
              instruction: 'Take this over.',
            }),
          ]
        return []
      })
      const exitCode = await onReleaseTree({ ...OPTIONS, script }, async tree => {
        const top = await tree.startSession('agents: chain')
        const chained = await outcomesOf(tree, top, 1)
        expect(chained).toContain('done Agents dispatch')
        expect(chained).toMatch(
          /"report":"one heard: too-deep: this session is at the deepest layer/u,
        )
        const registry = await registryAs(tree, top)
        const [first] = await registry.made()
        if (first === undefined) throw new Error('no dispatch of the top session')
        const second = (await (await registryAs(tree, first.session)).made())[0]
        if (second === undefined) throw new Error('no dispatch of the first child')
        expect(await (await registryAs(tree, second.session)).made()).toEqual([])

        const owner = await tree.startSession('agents: handoff')
        const handed = { results: await outcomesOf(tree, owner, 3) }
        expect(handed.results).toContain(
          'unknown-agent: no such agent definition for this tenant; see targets',
        )
        expect(handed.results).toContain(
          'agent-not-master: a handoff goes to a master definition only',
        )
        expect(handed.results).toMatch(
          /done Agents dispatch\n\{"dispatch":"dsp_[0-9a-f]{64}","session":"[0-9a-f]{64}","state":"handed-off"/u,
        )
        const [handoff] = await (await registryAs(tree, owner)).made()
        if (handoff === undefined) throw new Error('no handoff of the owner')
        expect(handoff).toMatchObject({ mode: 'handoff', state: 'handed-off', report: null })
        const taken = await pollUntil(
          'the handed-over session to answer its starting input',
          () => historyOf(tree, handoff.session),
          entries => entries.some(entry => entry.kind === 'run.terminal'),
        )
        expect(
          reminders(taken).some(text => text.includes('Take this over.') && text.includes(owner)),
        ).toBe(true)

        await say(tree, owner, 'agents: relations')
        // The words may join the run that still takes the outcomes in: wait for their answer, not for a count of runs.
        const related = await settledWhen(tree, owner, 'the relations', seen =>
          seen.results.includes('{"sessions":[],"next":null,"complete":true}'),
        )
        expect(related.results).toMatch(
          new RegExp(
            `"session":"${handoff.session}","title":[^{}]*"relation":"handed-off","attendance":"attended","definition":"coding"`,
            'u',
          ),
        )
        expect(related.results).toContain('{"sessions":[],"next":null,"complete":true}')
      })
      expect(exitCode).toBe(0)
    },
  )
})
