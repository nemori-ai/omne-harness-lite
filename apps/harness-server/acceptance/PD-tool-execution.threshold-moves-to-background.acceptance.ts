// covers: PD-tool-execution S7
import assert from 'node:assert/strict'
import { it } from 'vitest'
import { onReleaseTree, toolCallsThenText } from '../tests/support/release-tree.ts'
import {
  LIMIT_MS,
  backgroundCalls,
  callOf,
  factsOf,
  foregroundCommand,
  history,
  kinds,
  record,
  release,
  textOf,
  until,
} from './fixtures/release.ts'

const OPENING = 'start: S7 one long command in the foreground'
// The operator lowers the Shell threshold so the scenario does not wait the one-minute default.
const THRESHOLD_MS = 1500

it(
  'S7 a long one-shot command moves to the background at the threshold, starts once, and its outcome comes back',
  { timeout: 4 * LIMIT_MS },
  async () => {
    const script = toolCallsThenText(body =>
      body.includes(OPENING)
        ? [{ id: 'call_s7', tool: 'Shell', arguments: foregroundCommand('go-s7') }]
        : [],
    )
    const observed: Record<string, unknown> = {}
    let passed = false
    const exitCode = await onReleaseTree(
      {
        script,
        permission: 'bypass-permissions',
        extraHistoryKinds: ['message.system_reminder'],
        toolSettings: { Shell: { backgroundAfterMs: THRESHOLD_MS } },
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
          assert.match(
            textOf(placeholder),
            /moved to the background after its foreground threshold/u,
            'the placeholder names the threshold as the reason',
          )
          const [reference] = await backgroundCalls(tree, session)
          assert.ok(reference !== undefined, 'the session lists the call in the background')

          release(tree, 'go-s7')
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
          assert.match(textOf(reminder), /go-s7-done/u, 'the reminder carries the command output')
          assert.ok(textOf(reminder).includes(callOf(reference)), 'the reminder names the call')
          const firstEnd = after.findIndex(entry => entry.kind === 'run.terminal')
          assert.ok(
            after.slice(firstEnd).some(entry => entry.kind === 'run.started'),
            'a follow-up turn starts by itself',
          )
          const facts = factsOf(tree, reference)
          observed['starts'] = facts.starts
          assert.equal(facts.starts, 1, 'the process starts once')
          passed = true
        } finally {
          record('S7', passed, observed)
        }
      },
    )
    assert.equal(exitCode, 0)
  },
)
