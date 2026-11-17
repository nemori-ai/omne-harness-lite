// covers: PD-tool-execution S4
import assert from 'node:assert/strict'
import { it } from 'vitest'
import { onReleaseTree, toolCallsThenText } from '../tests/support/release-tree.ts'
import {
  LIMIT_MS,
  backgroundCalls,
  callOf,
  factsOf,
  history,
  kinds,
  record,
  release,
  textOf,
  until,
  waitingCommand,
} from './fixtures/release.ts'

const OPENING = 'start: S4 one long command'

it(
  'S4 a long command launched in the background ends the turn, then its outcome wakes the session once',
  { timeout: 4 * LIMIT_MS },
  async () => {
    const script = toolCallsThenText(body =>
      body.includes(OPENING)
        ? [{ id: 'call_s4', tool: 'Shell', arguments: waitingCommand('go-s4') }]
        : [],
    )
    const observed: Record<string, unknown> = {}
    let passed = false
    const exitCode = await onReleaseTree(
      {
        script,
        permission: 'bypass-permissions',
        extraHistoryKinds: ['message.system_reminder', 'account.linked'],
      },
      async tree => {
        try {
          const session = await tree.startSession(OPENING)
          const first = await until(
            'the first turn to end while the command still runs',
            () => history(tree, session),
            entries => entries.some(entry => entry.kind === 'run.terminal'),
          )
          const placeholder = first.find(entry => entry.kind === 'message.tool')
          observed['placeholder'] = textOf(placeholder)
          assert.match(textOf(placeholder), /started in the background/u)
          assert.ok(
            !kinds(first).includes('message.system_reminder'),
            'no outcome before the command ends',
          )
          const [reference] = await backgroundCalls(tree, session)
          assert.ok(reference !== undefined, 'the session lists the call in the background')

          release(tree, 'go-s4')
          const after = await until(
            'the reminder and a follow-up turn that took it',
            () => history(tree, session),
            entries => {
              const at = entries.findIndex(entry => entry.kind === 'message.system_reminder')
              return at >= 0 && entries.slice(at).some(entry => entry.kind === 'run.terminal')
            },
          )
          observed['kinds'] = kinds(after)
          const reminder = after.find(entry => entry.kind === 'message.system_reminder')
          observed['reminder'] = textOf(reminder)
          assert.match(textOf(reminder), /go-s4-done/u, 'the reminder carries the command output')
          assert.ok(textOf(reminder).includes(callOf(reference)), 'the reminder names the call')
          assert.match(
            textOf(reminder),
            /background-tool-execution/u,
            'its source is the background call',
          )
          const firstEnd = after.findIndex(entry => entry.kind === 'run.terminal')
          const reminderAt = after.indexOf(reminder!)
          assert.ok(reminderAt > firstEnd, 'the outcome arrives after the first turn ended')
          assert.ok(
            after.slice(firstEnd).some(entry => entry.kind === 'run.started'),
            'a follow-up turn starts by itself',
          )
          const facts = factsOf(tree, reference)
          observed['starts'] = facts.starts
          assert.equal(facts.starts, 1, 'the process starts once')
          // Tool keeps an account only for a result it makes itself; a real Shell run has none in
          // the foreground too. Moving to the background must not add one: the session links what the ledger holds.
          const accounts = after.filter(
            entry => entry.kind === 'account.linked' && textOf(entry).includes(callOf(reference)),
          )
          observed['accounts'] = { ledger: facts.accounts, session: accounts.length }
          assert.ok(facts.accounts.length <= 1, 'the ledger holds at most one account for the call')
          assert.equal(
            accounts.length,
            facts.accounts.length,
            'the session links the ledger account once',
          )
          assert.deepEqual(
            await backgroundCalls(tree, session),
            [],
            'nothing is left in the background',
          )
          passed = true
        } finally {
          record('S4', passed, observed)
        }
      },
    )
    assert.equal(exitCode, 0)
  },
)
