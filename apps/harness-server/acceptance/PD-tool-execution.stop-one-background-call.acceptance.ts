// covers: PD-tool-execution S5
import assert from 'node:assert/strict'
import { it } from 'vitest'
import { onReleaseTree, toolCallsByRequest } from '../tests/support/release-tree.ts'
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
const REASON = 'S5 no longer needed'

type Entry = Awaited<ReturnType<typeof history>>[number]
const count = (entries: readonly Entry[], kind: string) =>
  entries.filter(entry => entry.kind === kind).length

it(
  'S5 a person stops one of two background commands: both sides know, and only the other wakes the agent',
  { timeout: 4 * LIMIT_MS },
  async () => {
    const bodies: string[] = []
    const script = toolCallsByRequest(body => {
      bodies.push(body)
      return body.includes(OPENING) && !body.includes('"role":"tool"')
        ? [
            { id: 'call_s5_stop', tool: 'Shell', arguments: waitingCommand('never-s5') },
            { id: 'call_s5_keep', tool: 'Shell', arguments: waitingCommand('go-s5') },
          ]
        : []
    })
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

          const stop = await omne(tree, [
            'calls',
            'stop',
            '--session',
            session,
            '--call',
            target,
            '--reason',
            REASON,
          ])
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

          const outcomeOf = (entry: Entry, reference: string) =>
            entry.kind === 'message.system_reminder' &&
            textOf(entry).includes(`The background call ${callOf(reference)}`)
          const quiet = await until(
            'the outcome of the stopped call to come back',
            () => history(tree, session),
            value => value.some(entry => outcomeOf(entry, target)),
          )
          const stopReminder = quiet.find(
            entry =>
              entry.kind === 'message.system_reminder' &&
              textOf(entry).includes('The user stopped background call'),
          )
          assert.ok(stopReminder !== undefined, 'a stop reminder names the stop')
          assert.ok(textOf(stopReminder).includes(REASON), 'the stop reminder carries the reason')
          const stoppedOutcome = quiet.find(entry => outcomeOf(entry, target))
          assert.ok(
            stoppedOutcome !== undefined &&
              textOf(stoppedOutcome).includes(`stopped by the user. Reason: ${REASON}`),
            'the outcome of the stopped call names who stopped it',
          )
          assert.equal(count(quiet, 'run.started'), 1, 'neither reminder starts a turn')

          release(tree, 'go-s5')
          const entries = await until(
            'the other command to come back and wake the agent',
            () => history(tree, session),
            value => count(value, 'run.terminal') >= 2,
          )
          const reminders = entries.filter(entry => entry.kind === 'message.system_reminder')
          observed['reminders'] = reminders.map(textOf)
          observed['starts'] = count(entries, 'run.started')
          assert.equal(reminders.length, 3, 'the stop, the stopped outcome and the other outcome')
          assert.ok(reminders.some(entry => outcomeOf(entry, kept)))
          assert.ok(reminders.some(entry => /go-s5-done/u.test(textOf(entry))))
          assert.equal(count(entries, 'run.started'), 2, 'only the other outcome woke the agent')
          const woken = bodies.at(-1) ?? ''
          assert.ok(
            woken.includes('The user stopped background call') && woken.includes(REASON),
            'the turn the other outcome opened carries the stop reminder to the model',
          )
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
