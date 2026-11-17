// covers: PD-tool-execution S13
import assert from 'node:assert/strict'
import { it } from 'vitest'
import type { GatewayScript } from '../tests/fixtures/model-gateway.ts'
import { onReleaseTree, sse, toolCallFacts, toolCalls } from '../tests/support/release-tree.ts'
import {
  backgroundCalls,
  count,
  history,
  lastRunOf,
  LIMIT_MS,
  omne,
  record,
  release,
  textOf,
  until,
  untilQuiet,
  waitingCommand,
} from './fixtures/release.ts'

const OPENING = 'start: S13 a background command, then a long reply'
const serving = { model: 'm', provider: 'OpenAI' }
const text = (words: string) => ({ ...serving, choices: [{ delta: { content: words } }] })
const stop = { choices: [{ delta: {}, finish_reason: 'stop' }] }

it(
  'S13 a person cancels the turn while a command runs in the background: it runs on and its outcome opens a new turn',
  { timeout: 4 * LIMIT_MS },
  async () => {
    const held = Promise.withResolvers<void>()
    let requests = 0
    // The first reply starts the command in the background; the second is held half way, so the
    // turn is still running when the person cancels it; later replies are plain text.
    const script: GatewayScript = ({ body }) => {
      requests += 1
      if (body.includes(OPENING) && !body.includes('"role":"tool"')) {
        const call = {
          index: 0,
          id: 'call_s13',
          type: 'function',
          function: { name: 'Shell', arguments: waitingCommand('go-s13') },
        }
        return {
          status: 200,
          contentType: 'text/event-stream',
          body: sse([
            { ...serving, choices: [{ delta: { tool_calls: [call] } }] },
            { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
          ]),
        }
      }
      if (requests === 2)
        return {
          status: 200,
          contentType: 'text/event-stream',
          body: `data: ${JSON.stringify(text('thinking about '))}\n\n`,
          rest: { after: held.promise, body: sse([text('it'), stop]) },
        }
      return { status: 200, contentType: 'text/event-stream', body: sse([text('done'), stop]) }
    }
    const observed: Record<string, unknown> = {}
    let passed = false
    const exitCode = await onReleaseTree(
      { script, permission: 'bypass-permissions', extraHistoryKinds: ['message.system_reminder'] },
      async tree => {
        try {
          const session = await tree.startSession(OPENING)
          const [reference] = await until(
            'the command to be in the background',
            () => backgroundCalls(tree, session),
            calls => calls.length === 1,
          )
          await until(
            'the second reply to be half way',
            () => requests,
            value => value >= 2,
          )
          const run = lastRunOf(await history(tree, session))
          const cancelled = await omne(tree, ['cancel-run', '--session', session, '--run', run])
          observed['cancel'] = cancelled.json
          assert.equal(cancelled.status, 0, cancelled.stderr)
          const ended = await until(
            'the turn to end as cancelled',
            () => history(tree, session),
            value => count(value, 'run.terminal') >= 1,
          )
          assert.match(
            textOf(ended.find(entry => entry.kind === 'run.terminal')),
            /"outcome":"cancelled"/u,
          )
          held.resolve()
          assert.deepEqual(await backgroundCalls(tree, session), [reference], 'it runs on')
          const call = toolCalls(tree.storageRoot).find(item => item.tool === 'Shell')
          assert.equal(call?.phase, 'running', 'the cancel did not stop it')
          release(tree, 'go-s13')
          const after = await until(
            'its outcome to open a new turn and that turn to end',
            () => history(tree, session),
            value => count(value, 'run.terminal') >= 2,
          )
          observed['kinds'] = after.map(entry => entry.kind)
          assert.equal(count(after, 'run.started'), 2, 'the outcome opened a new turn')
          assert.ok(
            after.some(
              entry =>
                entry.kind === 'message.system_reminder' && /go-s13-done/u.test(textOf(entry)),
            ),
          )
          assert.equal(toolCallFacts(tree.storageRoot).get(call?.call ?? '')?.starts, 1)
          await untilQuiet(tree, session, 2)
          passed = true
        } finally {
          held.resolve()
          record('S13', passed, observed)
        }
      },
    )
    assert.equal(exitCode, 0)
  },
)
