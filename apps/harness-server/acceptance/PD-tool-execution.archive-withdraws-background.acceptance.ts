// covers: PD-tool-execution S14
import assert from 'node:assert/strict'
import { it } from 'vitest'
import { onReleaseTree, toolCallsByRequest } from '../tests/support/release-tree.ts'
import {
  LIMIT_MS,
  backgroundCalls,
  callOf,
  count,
  history,
  omne,
  record,
  textOf,
  until,
  waitingCommand,
} from './fixtures/release.ts'

const OPENING = 'start: S14 a background command, then the session is archived'

it(
  'S14 a person archives a session with a command in the background: it is withdrawn, its outcome stays out of the session',
  { timeout: 4 * LIMIT_MS },
  async () => {
    const script = toolCallsByRequest(body =>
      body.includes(OPENING) && !body.includes('"role":"tool"')
        ? [{ id: 'call_s14', tool: 'Shell', arguments: waitingCommand('never-s14') }]
        : [],
    )
    const observed: Record<string, unknown> = {}
    let passed = false
    const exitCode = await onReleaseTree(
      { script, permission: 'bypass-permissions', extraHistoryKinds: ['message.system_reminder'] },
      async tree => {
        try {
          const session = await tree.startSession(OPENING)
          await until(
            'the turn to end with the command in the background',
            () => history(tree, session),
            entries => count(entries, 'run.terminal') >= 1,
          )
          const [reference] = await backgroundCalls(tree, session)
          assert.ok(reference !== undefined, 'the command is in the background')

          const archived = await omne(tree, ['archive-session', '--session', session])
          observed['archive'] = archived.json
          assert.equal(archived.status, 0, archived.stderr)
          assert.deepEqual(
            archived.json?.['body'],
            {
              kind: 'archived',
              controlId: (archived.json?.['request'] as { controlId?: string })?.controlId,
              runs: 0,
              backgroundCalls: 1,
            },
            'the answer counts the command as withdrawn, not as stopped',
          )

          const shown = await until(
            'the withdrawn command to end and its outcome to be kept',
            async () => (await omne(tree, ['calls', 'show', '--call', reference])).stdout,
            text => /^End: /mu.test(text),
          )
          observed['show'] = shown
          const entries = await history(tree, session)
          observed['kinds'] = entries.map(entry => entry.kind)
          assert.equal(count(entries, 'run.started'), 1, 'no new turn starts')
          assert.ok(
            !entries.some(
              entry =>
                entry.kind === 'message.system_reminder' &&
                textOf(entry).includes(`The background call ${callOf(reference)}`),
            ),
            'the outcome does not come back to the session',
          )

          const list = await omne(tree, ['list-archived-sessions'])
          observed['archived'] = list.json
          const items = (
            list.json?.['body'] as { sessions?: { session: string; archivedBy: string }[] }
          )?.sessions
          assert.deepEqual(
            items?.filter(item => item.session === session).map(item => item.archivedBy),
            ['person'],
            'the session is in the archived list',
          )
          const { tenant } = tree.registrar()
          const plain = await tree.clients.session['list-sessions']({ tenant, cursor: null })
          assert.ok(
            plain.outcome === 'succeeded' &&
              !plain.body.sessions.some(item => item.session === session),
            'the session is not in the plain list',
          )

          const again = await omne(tree, ['archive-session', '--session', session])
          assert.equal((again.json?.['body'] as { kind?: string })?.kind, 'already-archived')
          const back = await omne(tree, ['unarchive-session', '--session', session])
          assert.equal((back.json?.['body'] as { kind?: string })?.kind, 'unarchived')
          const relisted = await tree.clients.session['list-sessions']({ tenant, cursor: null })
          assert.ok(
            relisted.outcome === 'succeeded' &&
              relisted.body.sessions.some(item => item.session === session),
            'after unarchiving it is in the plain list again',
          )
          passed = true
        } finally {
          record('S14', passed, observed)
        }
      },
    )
    assert.equal(exitCode, 0)
  },
)
