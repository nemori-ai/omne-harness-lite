// covers: PD-tool-execution S5
import assert from 'node:assert/strict'
import { it } from 'vitest'
import { onReleaseTree, toolCallsThenText } from '../tests/support/release-tree.ts'
import {
  LIMIT_MS,
  backgroundCalls,
  callOf,
  factsOf,
  history,
  omne,
  record,
  release,
  textOf,
  until,
  waitingCommand,
} from './fixtures/release.ts'

const OPENING = 'start: S5 two long commands'

it(
  'S5 of two background commands, a stop of one is accepted, then proven; only the other comes back',
  { timeout: 4 * LIMIT_MS },
  async () => {
    const script = toolCallsThenText(body =>
      body.includes(OPENING)
        ? [
            { id: 'call_s5_stop', tool: 'Shell', arguments: waitingCommand('never-s5') },
            { id: 'call_s5_keep', tool: 'Shell', arguments: waitingCommand('go-s5') },
          ]
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
            'the first turn to end while both commands run',
            () => history(tree, session),
            entries => entries.some(entry => entry.kind === 'run.terminal'),
          )
          const listed = await backgroundCalls(tree, session)
          assert.equal(listed.length, 2, 'both commands are in the background')
          const target = listed.find(reference =>
            factsOf(tree, reference).arguments.includes('never-s5'),
          )
          const kept = listed.find(reference => reference !== target)
          assert.ok(target !== undefined && kept !== undefined)

          const stop = await omne(tree, ['calls', 'stop', '--session', session, '--call', target])
          observed['stop'] = stop.json
          assert.equal(stop.status, 0)
          assert.deepEqual(
            [stop.json?.['outcome'], (stop.json?.['body'] as { kind?: string } | undefined)?.kind],
            ['succeeded', 'requested'],
            'the receipt of the stop is an acceptance, not a stop',
          )
          const shown = await until(
            'the stop to be proven',
            async () => (await omne(tree, ['calls', 'show', '--call', target])).stdout,
            text => text.includes('End: interrupted'),
          )
          observed['show'] = shown
          assert.match(shown, /^Control \S+: stopped$/mu, 'the control reads stopped once proven')
          assert.doesNotMatch(shown, /: stop accepted$/mu)

          release(tree, 'go-s5')
          const entries = await until(
            'the other command to come back',
            () => history(tree, session),
            value => {
              const at = value.findIndex(entry => entry.kind === 'message.system_reminder')
              return at >= 0 && value.slice(at).some(entry => entry.kind === 'run.terminal')
            },
          )
          const reminders = entries.filter(entry => entry.kind === 'message.system_reminder')
          observed['reminders'] = reminders.map(textOf)
          assert.equal(reminders.length, 1, 'one reminder: the stopped call has none')
          assert.ok(
            textOf(reminders[0]).includes(callOf(kept)),
            'the reminder is of the other call',
          )
          assert.match(textOf(reminders[0]), /go-s5-done/u)
          assert.ok(!reminders.some(entry => textOf(entry).includes(callOf(target))))
          assert.equal(factsOf(tree, target).starts, 1)
          assert.deepEqual(await backgroundCalls(tree, session), [])
          passed = true
        } finally {
          record('S5', passed, observed)
        }
      },
    )
    assert.equal(exitCode, 0)
  },
)
