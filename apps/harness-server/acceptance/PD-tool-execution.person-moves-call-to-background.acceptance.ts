// covers: PD-tool-execution S6
import assert from 'node:assert/strict'
import { it } from 'vitest'
import {
  onReleaseTree,
  toolCallFacts,
  toolCalls,
  toolCallsThenText,
} from '../tests/support/release-tree.ts'
import {
  LIMIT_MS,
  foregroundCommand,
  history,
  omne,
  record,
  release,
  textOf,
  until,
} from './fixtures/release.ts'

const OPENING = 'start: S6 a long command in the foreground'

type Entry = Awaited<ReturnType<typeof history>>[number]
const count = (entries: readonly Entry[], kind: string) =>
  entries.filter(entry => entry.kind === kind).length

it(
  'S6 a person moves a running foreground command to the background; it is listed, not restarted',
  { timeout: 4 * LIMIT_MS },
  async () => {
    const script = toolCallsThenText(body =>
      body.includes(OPENING)
        ? [{ id: 'call_s6', tool: 'Shell', arguments: foregroundCommand('go-s6') }]
        : [],
    )
    const observed: Record<string, unknown> = {}
    let passed = false
    const exitCode = await onReleaseTree(
      { script, permission: 'bypass-permissions', extraHistoryKinds: ['message.system_reminder'] },
      async tree => {
        try {
          const session = await tree.startSession(OPENING)
          const running = await until(
            'the command to run in the foreground',
            () => toolCalls(tree.storageRoot).find(call => call.tool === 'Shell'),
            call => call?.phase === 'running',
          )
          assert.ok(running !== undefined)
          // A person reaches the reference through the call view; the test reads it from the ledger.
          const reference = JSON.stringify([
            'tool-invocation',
            2,
            running.call,
            `admit-${running.call.slice('call-'.length)}`,
          ])
          const moved = await omne(tree, [
            'calls',
            'background',
            '--session',
            session,
            '--call',
            reference,
          ])
          observed['moved'] = moved.json
          assert.equal(moved.status, 0, moved.stderr)
          const entries = await until(
            'the turn to end on the placeholder',
            () => history(tree, session),
            value => count(value, 'run.terminal') >= 1,
          )
          const placeholder = entries.find(
            entry =>
              entry.kind === 'message.tool' && /moved to the background/u.test(textOf(entry)),
          )
          observed['placeholder'] = placeholder === undefined ? null : textOf(placeholder)
          assert.ok(
            placeholder !== undefined,
            'the foreground place got a placeholder that says why',
          )
          const listed = await omne(tree, ['calls', 'list', '--session', session, '--json'])
          const calls = (listed.json?.['body'] as { calls?: unknown[] } | undefined)?.calls ?? []
          observed['listed'] = calls
          assert.deepEqual(calls, [
            {
              id: 'b1',
              producer: { kind: 'tool', call: reference },
              label: {
                intent: 'wait for go-s6',
                tool: 'Shell',
                command: 'execute',
                preview: 'while [ ! -f go-s6 ]; do sleep 0.1; done; echo go-s6-done',
              },
              source: 'control',
              status: 'running',
              stop: null,
              lastLine: null,
            },
          ])
          release(tree, 'go-s6')
          await until(
            'the outcome to come back',
            () => history(tree, session),
            value =>
              value.some(
                entry =>
                  entry.kind === 'message.system_reminder' && /go-s6-done/u.test(textOf(entry)),
              ),
          )
          assert.equal(
            toolCallFacts(tree.storageRoot).get(running.call)?.starts,
            1,
            'not restarted',
          )
          passed = true
        } finally {
          record('S6', passed, observed)
        }
      },
    )
    assert.equal(exitCode, 0)
  },
)
