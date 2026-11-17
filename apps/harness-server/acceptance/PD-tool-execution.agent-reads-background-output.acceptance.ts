// covers: PD-tool-execution S16
import assert from 'node:assert/strict'
import { it } from 'vitest'
import {
  onReleaseTree,
  toolCallFacts,
  toolCallsByRequest,
  type ScriptedToolCall,
} from '../tests/support/release-tree.ts'
import {
  LIMIT_MS,
  backgroundCalls,
  history,
  omne,
  record,
  release,
  textOf,
  until,
} from './fixtures/release.ts'

const OPENING = 'start: S16 a command that keeps writing'
const SECOND = 'S16: read its output'
const THIRD = 'S16: read what is new'
const SCRIPT =
  'echo first-s16; while [ ! -f more-s16 ]; do sleep 0.1; done; echo second-s16; while [ ! -f end-s16 ]; do sleep 0.1; done; echo s16-done'
const READ = /done BkgToolCalls output\\nb1 (\w+)\\n(.*?)\\nnext: ([0-9]+) \((open|sealed)/gu

type Entry = Awaited<ReturnType<typeof history>>[number]
const count = (entries: readonly Entry[], kind: string) =>
  entries.filter(entry => entry.kind === kind).length
const reads = (body: string) => [...body.matchAll(READ)]
const output = (id: string, params: object): ScriptedToolCall => ({
  id,
  tool: 'BkgToolCalls',
  arguments: JSON.stringify({ command: 'output', params }),
})

// One Run holds one tool place and the command keeps its place in the first turn, so each read is
// a turn of its own; the second read passes the position the first one gave.
function step(body: string): readonly ScriptedToolCall[] {
  const done = reads(body)
  if (body.includes(THIRD)) {
    const next = done[0]?.[3]
    return done.length === 1 && next !== undefined
      ? [output('call_s16_read_2', { id: 'b1', after: next })]
      : []
  }
  if (body.includes(SECOND))
    return done.length === 0 ? [output('call_s16_read_1', { id: 'b1' })] : []
  if (!body.includes(OPENING) || body.includes('call_s16_run')) return []
  const execute = {
    command: 'execute',
    intent: 'write lines slowly',
    params: { script: SCRIPT, run_in_background: true },
  }
  return [{ id: 'call_s16_run', tool: 'Shell', arguments: JSON.stringify(execute) }]
}

it(
  'S16 the agent reads a running command twice; the second read, from the given position, is new only',
  { timeout: 4 * LIMIT_MS },
  async () => {
    const bodies: string[] = []
    const script = toolCallsByRequest(body => {
      bodies.push(body)
      return step(body)
    })
    const observed: Record<string, unknown> = {}
    let passed = false
    const exitCode = await onReleaseTree(
      { script, permission: 'bypass-permissions', extraHistoryKinds: ['message.system_reminder'] },
      async tree => {
        try {
          const session = await tree.startSession(OPENING)
          const turn = async (text: string, ended: number) => {
            await until(
              `turn ${ended} to end`,
              () => history(tree, session),
              entries => count(entries, 'run.terminal') >= ended,
            )
            const sent = await tree.cli(['send-input', '--session', session, '--text', text])
            assert.equal(sent.status, 0, sent.stderr)
          }
          const [reference] = await until(
            'the command to be in the background',
            () => backgroundCalls(tree, session),
            calls => calls.length === 1,
          )
          assert.ok(reference !== undefined)
          await until(
            'its output to be readable while it runs',
            async () => (await omne(tree, ['calls', 'output', '--call', reference])).stdout,
            text => text.includes('first-s16'),
          )
          await turn(SECOND, 1)
          const first = await until(
            'the first read to reach the model',
            () => bodies.map(reads).find(found => found.length === 1)?.[0],
            found => found !== undefined,
          )
          observed['first'] = first?.[0]
          assert.ok(first !== undefined)
          const [, status, text, next, kind] = first
          assert.equal(status, 'running')
          assert.equal(kind, 'open')
          assert.match(text ?? '', /first-s16/u, 'the first read gives the output so far')

          release(tree, 'more-s16')
          await until(
            'the new line to be written',
            async () =>
              (await omne(tree, ['calls', 'output', '--call', reference, '--after', next ?? '']))
                .stdout,
            value => value.includes('second-s16'),
          )
          await turn(THIRD, 2)
          const second = await until(
            'the second read to reach the model',
            () => bodies.map(reads).find(found => found.length === 2)?.[1],
            found => found !== undefined,
          )
          observed['second'] = second?.[0]
          assert.ok(second !== undefined)
          assert.match(second[2] ?? '', /second-s16/u)
          assert.doesNotMatch(second[2] ?? '', /first-s16/u, 'from the position, only what is new')
          assert.ok(Number(second[3]) > Number(next), 'the position moves on')

          await until(
            'the third turn to end',
            () => history(tree, session),
            value => count(value, 'run.terminal') >= 3,
          )
          release(tree, 'end-s16')
          const entries = await until(
            'the outcome to come back',
            () => history(tree, session),
            value =>
              value.some(
                entry =>
                  entry.kind === 'message.system_reminder' && /s16-done/u.test(textOf(entry)),
              ),
          )
          const outcome = entries.find(
            entry => entry.kind === 'message.system_reminder' && /s16-done/u.test(textOf(entry)),
          )
          observed['outcome'] = textOf(outcome).slice(0, 600)
          assert.match(
            textOf(outcome),
            /first-s16\\nsecond-s16\\ns16-done/u,
            'reads change no output',
          )
          const [facts] = [...toolCallFacts(tree.storageRoot).values()].filter(item =>
            item.arguments.includes('first-s16'),
          )
          observed['facts'] = facts
          assert.equal(facts?.starts, 1, 'reads start nothing')
          assert.equal(facts?.accounts.length, 1, 'reads add no account')
          passed = true
        } finally {
          record('S16', passed, observed)
        }
      },
    )
    assert.equal(exitCode, 0)
  },
)
