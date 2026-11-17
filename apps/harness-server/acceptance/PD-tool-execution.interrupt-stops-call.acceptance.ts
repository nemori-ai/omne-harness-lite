// covers: PD-tool-execution S10
import assert from 'node:assert/strict'
import { it } from 'vitest'
import { onReleaseTree, toolCalls, toolCallsByRequest } from '../tests/support/release-tree.ts'
import { LIMIT_MS, count, history, interrupt, record, textOf, until } from './fixtures/release.ts'

const OPENING = 'start: S10 the agent asks the person and waits'
const URGENT = 'S10 urgent: never mind the question'
// Ask waits for a person and can never move to the background.
const ASK = JSON.stringify({
  command: 'ask',
  params: {
    questions: [
      {
        title: 'Which port should the dev server use?',
        description: 'Port 8080 is in use.',
        options: [
          { label: '8081', description: 'The next free port.' },
          { label: '3000', description: 'The default port.' },
        ],
      },
    ],
  },
})

it(
  'S10 an urgent input while the agent waits on a call that cannot go to the background: it is interrupted, the turn takes the input',
  { timeout: 4 * LIMIT_MS },
  async () => {
    const bodies: string[] = []
    const script = toolCallsByRequest(body => {
      bodies.push(body)
      return body.includes(OPENING) && !body.includes('"role":"tool"')
        ? [{ id: 'call_s10', tool: 'Ask', arguments: ASK }]
        : []
    })
    const observed: Record<string, unknown> = {}
    let passed = false
    const exitCode = await onReleaseTree(
      { script, permission: 'bypass-permissions' },
      async tree => {
        try {
          const session = await tree.startSession(OPENING)
          await until(
            'the question to wait for the person',
            () => toolCalls(tree.storageRoot).find(call => call.tool === 'Ask'),
            call => call !== undefined && call.phase !== 'settled',
          )
          await until(
            'the card to be open',
            () => tree.cards(),
            cards => cards.length > 0,
          )
          const sent = await interrupt(tree, session, URGENT)
          observed['interrupt'] = sent.json
          assert.equal(sent.status, 0, sent.stderr)
          assert.equal((sent.json?.['body'] as { as?: string } | undefined)?.as, 'interrupt')
          const entries = await until(
            'the turn to take the urgent input',
            () => history(tree, session),
            value =>
              count(value, 'message.tool') >= 1 && bodies.some(body => body.includes(URGENT)),
          )
          const result = entries.find(entry => entry.kind === 'message.tool')
          observed['result'] = result === undefined ? null : textOf(result).slice(0, 600)
          assert.ok(result !== undefined, 'the foreground got a result')
          assert.match(
            textOf(result),
            /closed before the person answered/u,
            'the result says why the call ended without an answer',
          )
          assert.ok(
            bodies.some(body => body.includes(URGENT)),
            'the same turn took the urgent input',
          )
          assert.equal(count(entries, 'run.started'), 1, 'no other turn took it')
          assert.ok(
            !entries.some(
              entry => entry.kind === 'run.terminal' && /cancelled/u.test(textOf(entry)),
            ),
            'the turn was not cancelled',
          )
          passed = true
        } finally {
          record('S10', passed, observed)
        }
      },
    )
    assert.equal(exitCode, 0)
  },
)
