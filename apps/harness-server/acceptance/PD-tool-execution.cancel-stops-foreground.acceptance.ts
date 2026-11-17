// covers: PD-tool-execution S12
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
  count,
  foregroundCommand,
  history,
  lastRunOf,
  omne,
  record,
  textOf,
  until,
} from './fixtures/release.ts'

const OPENING = 'start: S12 a long command in the foreground'

it(
  'S12 a person cancels the turn while a foreground command runs: the turn ends at once, the command is stopped, nothing revives',
  { timeout: 4 * LIMIT_MS },
  async () => {
    const script = toolCallsThenText(body =>
      body.includes(OPENING)
        ? [{ id: 'call_s12', tool: 'Shell', arguments: foregroundCommand('never-s12') }]
        : [],
    )
    const observed: Record<string, unknown> = {}
    let passed = false
    const exitCode = await onReleaseTree(
      { script, permission: 'bypass-permissions' },
      async tree => {
        try {
          const session = await tree.startSession(OPENING)
          const running = await until(
            'the command to run in the foreground',
            () => toolCalls(tree.storageRoot).find(call => call.tool === 'Shell'),
            call => call?.phase === 'running',
          )
          assert.ok(running !== undefined)
          const run = lastRunOf(await history(tree, session))
          const cancelled = await omne(tree, ['cancel-run', '--session', session, '--run', run])
          observed['cancel'] = cancelled.json
          assert.equal(cancelled.status, 0, cancelled.stderr)
          const ended = await until(
            'the turn to end as cancelled',
            () => history(tree, session),
            value => count(value, 'run.terminal') >= 1,
          )
          const terminal = ended.find(entry => entry.kind === 'run.terminal')
          observed['terminal'] = textOf(terminal).slice(0, 300)
          assert.match(textOf(terminal), /"outcome":"cancelled"/u, 'the turn is cancelled at once')
          const settled = await until(
            'the command to stop for real and its result to be kept',
            () => toolCalls(tree.storageRoot).find(call => call.call === running.call),
            call => call?.phase === 'settled' && call.delivery === 'released',
          )
          observed['call'] = settled
          const after = await history(tree, session)
          assert.equal(count(after, 'run.started'), 1, 'the real end revives no turn')
          assert.equal(count(after, 'run.terminal'), 1)
          assert.equal(toolCallFacts(tree.storageRoot).get(running.call)?.starts, 1)
          passed = true
        } finally {
          record('S12', passed, observed)
        }
      },
    )
    assert.equal(exitCode, 0)
  },
)
