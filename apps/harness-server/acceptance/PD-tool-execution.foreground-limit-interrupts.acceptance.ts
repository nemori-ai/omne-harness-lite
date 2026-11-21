// covers: PD-tool-execution S8
import assert from 'node:assert/strict'
import { it } from 'vitest'
import { onReleaseTree, toolCallFacts, toolCallsByRequest } from '../tests/support/release-tree.ts'
import { LIMIT_MS, history, record, release, textOf, until } from './fixtures/release.ts'

const OPENING = 'start: S8 a terminal command with a foreground limit'
const FOREGROUND_MS = 1500
// Persistent terminals need Linux (bash, mkfifo and node-pty); elsewhere the scenario does not run.
const TERMINAL = /terminal=\{\\"id\\":\\"([^\\"]+)\\",\\"generation\\":\\"([^\\"]+)\\"\}/u

it.skipIf(process.platform !== 'linux')(
  'S8 a terminal command that may not go to the background ends as interrupted at the foreground limit',
  { timeout: 4 * LIMIT_MS },
  async () => {
    const script = toolCallsByRequest(body => {
      if (!body.includes(OPENING) || body.includes('call_s8_run')) return []
      const terminal = TERMINAL.exec(body)
      if (terminal === null)
        return [
          {
            id: 'call_s8_open',
            tool: 'Shell',
            arguments: JSON.stringify({ command: 'create_session', params: {} }),
          },
        ]
      return [
        {
          id: 'call_s8_run',
          tool: 'Shell',
          arguments: JSON.stringify({
            command: 'execute',
            intent: 'wait in the terminal',
            params: {
              script: 'while [ ! -f go-s8 ]; do sleep 0.1; done; echo go-s8-done',
              terminal: { id: terminal[1], generation: terminal[2] },
            },
          }),
        },
      ]
    })
    const observed: Record<string, unknown> = {}
    let passed = false
    const exitCode = await onReleaseTree(
      {
        script,
        permission: 'bypass-permissions',
        toolSettings: { Shell: { foregroundMs: FOREGROUND_MS } },
      },
      async tree => {
        try {
          const session = await tree.startSession(OPENING)
          const ended = await until(
            'the turn to end at the foreground limit while the command still runs',
            () => history(tree, session),
            entries => entries.some(entry => entry.kind === 'run.terminal'),
          )
          const results = ended.filter(entry => entry.kind === 'message.tool')
          const interrupted = results.at(-1)
          observed['result'] = textOf(interrupted)
          assert.match(
            textOf(interrupted),
            /interrupted/u,
            'the foreground gets an interrupted result',
          )
          assert.match(textOf(interrupted), /foreground/u, 'the reason is the foreground limit')
          assert.doesNotMatch(textOf(interrupted), /placeholder|background/u, 'it does not move')

          release(tree, 'go-s8')
          const call = () =>
            [...toolCallFacts(tree.storageRoot).values()].find(facts =>
              facts.arguments.includes('go-s8'),
            )
          const facts = await until(
            'the real end of the command as a late version beside the interrupted result',
            call,
            found => found?.results.includes('late') === true && found.receipts.includes('late'),
          )
          observed['ledger'] = {
            results: facts?.results,
            accounts: facts?.accounts,
            receipts: facts?.receipts,
            durations: facts?.durations,
          }
          assert.deepEqual(
            [...(facts?.results ?? [])].sort(),
            ['late', 'original'],
            'the real result is kept as a late version beside the interrupted one',
          )
          assert.deepEqual(
            facts?.receipts,
            ['late'],
            'the call keeps one account, its next revision marked late',
          )
          assert.equal(facts?.starts, 1, 'the command starts once')
          const kept = (await history(tree, session))
            .filter(entry => entry.kind === 'message.tool')
            .at(-1)
          assert.equal(textOf(kept), textOf(interrupted), 'the foreground result is not rewritten')
          passed = true
        } finally {
          record('S8', passed, observed)
        }
      },
    )
    assert.equal(exitCode, 0)
  },
)
