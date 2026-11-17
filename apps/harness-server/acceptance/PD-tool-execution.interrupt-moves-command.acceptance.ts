// covers: PD-tool-execution S9
import assert from 'node:assert/strict'
import { it } from 'vitest'
import {
  onReleaseTree,
  toolCallFacts,
  toolCalls,
  toolCallsByRequest,
} from '../tests/support/release-tree.ts'
import {
  LIMIT_MS,
  backgroundCalls,
  count,
  foregroundCommand,
  history,
  interrupt,
  record,
  release,
  textOf,
  until,
} from './fixtures/release.ts'

const OPENING = 'start: S9 a long command the agent waits for'
const URGENT = 'S9 urgent: read this before the command ends'

it(
  'S9 an urgent input while the agent waits on a command that may go to the background: it moves, the turn takes the input',
  { timeout: 4 * LIMIT_MS },
  async () => {
    const bodies: string[] = []
    const script = toolCallsByRequest(body => {
      bodies.push(body)
      return body.includes(OPENING) && !body.includes('"role":"tool"')
        ? [{ id: 'call_s9', tool: 'Shell', arguments: foregroundCommand('go-s9') }]
        : []
    })
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
          const sent = await interrupt(tree, session, URGENT)
          observed['interrupt'] = sent.json
          assert.equal(sent.status, 0, sent.stderr)
          assert.deepEqual((sent.json?.['body'] as { as?: string } | undefined)?.as, 'interrupt')
          const entries = await until(
            'the same turn to take the urgent input',
            () => history(tree, session),
            value => count(value, 'message.assistant') >= 2 && count(value, 'message.tool') >= 1,
          )
          const placeholder = entries.find(
            entry => entry.kind === 'message.tool' && /background/u.test(textOf(entry)),
          )
          observed['placeholder'] = placeholder === undefined ? null : textOf(placeholder)
          assert.ok(
            placeholder !== undefined,
            'the command moved to the background with a placeholder',
          )
          assert.ok(
            bodies.some(body => body.includes(URGENT) && body.includes('"role":"tool"')),
            'the same turn gave the urgent input to the model, after the placeholder',
          )
          assert.equal(count(entries, 'run.started'), 1, 'no other turn took it')
          assert.ok(
            !entries.some(
              entry => entry.kind === 'run.terminal' && /cancelled/u.test(textOf(entry)),
            ),
            'the turn was not cancelled',
          )
          assert.equal(
            (await backgroundCalls(tree, session)).length,
            1,
            'it runs on in the background',
          )
          release(tree, 'go-s9')
          await until(
            'the outcome to come back',
            () => history(tree, session),
            value =>
              value.some(
                entry =>
                  entry.kind === 'message.system_reminder' && /go-s9-done/u.test(textOf(entry)),
              ),
          )
          assert.equal(toolCallFacts(tree.storageRoot).get(running?.call ?? '')?.starts, 1)
          passed = true
        } finally {
          record('S9', passed, observed)
        }
      },
    )
    // Known defect (plan, out-of-run finding 2): the interrupt control never reconciles after the
    // call moves to the background, so the turn stays open and the tree closes with it running.
    assert.equal(exitCode, 5, 'when this fails, the defect is fixed: expect 0 again')
  },
)
